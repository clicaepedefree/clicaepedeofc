'use server'

import { validateUserPermissionsForStore } from '@/features/store/api'
import { normalizeUserEmail } from '@/features/user/user-policy'
import { requireAuth } from '@/services/auth'
import { db } from '@/services/db'
import {
  internalOperationAuditLogsTable,
  storeAccessInvitesTable,
  userStorePermissionsTable,
  usersTable,
} from '@/services/db/schema'
import {
  buildStoreAccessInviteUrl,
  createStoreAccessInviteToken,
  getStoreAccessInviteExpiresAt,
  getStoreAccessInviteSecret,
  hashStoreAccessInviteToken,
} from '@/features/store-access-invites/invite-policy'
import { auth } from '@clerk/nextjs/server'
import {
  and,
  asc,
  count,
  desc,
  eq,
  or,
  sql,
  type SQL,
} from 'drizzle-orm'
import { z } from 'zod'
import {
  assertCanRevokeStoreUser,
  assertCanUnsetPrimaryResponsible,
  getFallbackPrimaryResponsibleUserId,
  type StoreUserAccessState,
} from './store-users-policy'

const storeUsersPageSize = 8

const storeUserInviteSchema = z.object({
  email: z.string().email('Informe um e-mail valido.'),
  name: z.string().trim().max(120).optional(),
  phone: z.string().trim().max(32).optional(),
})

const storeUserUpdateSchema = z.object({
  userId: z.string().uuid(),
  name: z.string().trim().max(120).optional(),
  phone: z.string().trim().max(32).optional(),
  isPrimaryResponsible: z.boolean(),
})

const storeUserRevokeSchema = z.object({
  userId: z.string().uuid(),
  reason: z.string().trim().min(8, 'Informe um motivo com pelo menos 8 caracteres.'),
})

const storeInviteRevokeSchema = z.object({
  inviteId: z.number().int().positive(),
  reason: z.string().trim().min(8, 'Informe um motivo com pelo menos 8 caracteres.'),
})

export type StoreUsersStatusFilter = 'all' | 'active' | 'revoked' | 'deleted'

export type StoreUsersQuery = {
  page?: number
  search?: string
  status?: StoreUsersStatusFilter
}

export type StoreUserListItem = {
  userId: string
  email: string
  name: string | null
  phone: string | null
  userStatus: 'active' | 'deleted'
  role: 'admin'
  isPrimaryResponsible: boolean
  lastLoginAt: Date | null
  permissionCreatedAt: Date
  permissionUpdatedAt: Date
  revokedAt: Date | null
  revokedReason: string | null
  accessStatus: 'active' | 'revoked' | 'deleted'
}

export type StorePendingInvite = {
  id: number
  targetEmail: string
  targetName: string | null
  targetPhone: string | null
  deliveryStatus: string
  expiresAt: Date
  createdAt: Date
}

const getAppBaseUrl = () => {
  const explicitUrl =
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.APP_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null)

  if (explicitUrl) return explicitUrl

  const domain = process.env.NEXT_PUBLIC_APP_DOMAIN ?? 'localhost:3000'
  const protocol =
    domain.includes('localhost') || domain.includes('127.0.0.1')
      ? 'http'
      : 'https'

  return `${protocol}://${domain}`
}

const getActor = async () => {
  const [user, clerkAuth] = await Promise.all([requireAuth(), auth()])

  if (!clerkAuth.userId) throw new Error('NOT_AUTHENTICATED')

  return {
    user,
    clerkId: clerkAuth.userId,
    email: user.email,
    name: user.name,
  }
}

const normalizeTextInput = (value: string | undefined) => {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

const getStoreUsersWhere = ({
  storeId,
  search,
  status,
}: {
  storeId: number
  search: string
  status: StoreUsersStatusFilter
}) => {
  const conditions: SQL[] = [
    eq(userStorePermissionsTable.storeId, storeId),
    eq(userStorePermissionsTable.role, 'admin'),
  ]

  if (search) {
    const pattern = `%${search.toLowerCase()}%`
    conditions.push(
      or(
        sql`lower(${usersTable.email}) like ${pattern}`,
        sql`lower(coalesce(${usersTable.name}, '')) like ${pattern}`,
        sql`lower(coalesce(${usersTable.phone}, '')) like ${pattern}`
      )!
    )
  }

  if (status === 'active') {
    conditions.push(
      sql`${userStorePermissionsTable.revokedAt} is null`,
      eq(usersTable.status, 'active')
    )
  }

  if (status === 'revoked') {
    conditions.push(sql`${userStorePermissionsTable.revokedAt} is not null`)
  }

  if (status === 'deleted') {
    conditions.push(eq(usersTable.status, 'deleted'))
  }

  return and(...conditions)
}

const mapAccessStatus = (row: {
  userStatus: 'active' | 'deleted'
  revokedAt: Date | null
}): StoreUserListItem['accessStatus'] => {
  if (row.userStatus === 'deleted') return 'deleted'
  if (row.revokedAt) return 'revoked'
  return 'active'
}

async function getStoreAccessStates(
  storeId: number,
  tx: Pick<typeof db, 'select'> = db
) {
  const rows = await tx
    .select({
      userId: userStorePermissionsTable.userId,
      isPrimaryResponsible: userStorePermissionsTable.isPrimaryResponsible,
      revokedAt: userStorePermissionsTable.revokedAt,
      userStatus: usersTable.status,
    })
    .from(userStorePermissionsTable)
    .innerJoin(usersTable, eq(usersTable.id, userStorePermissionsTable.userId))
    .where(
      and(
        eq(userStorePermissionsTable.storeId, storeId),
        eq(userStorePermissionsTable.role, 'admin')
      )
    )

  return rows satisfies StoreUserAccessState[]
}

export async function getStoreUsers(
  storeId: number,
  query: StoreUsersQuery = {}
) {
  await validateUserPermissionsForStore(storeId, 'admin')

  const page = Math.max(1, query.page ?? 1)
  const search = query.search?.trim() ?? ''
  const status = query.status ?? 'all'
  const where = getStoreUsersWhere({ storeId, search, status })
  const offset = (page - 1) * storeUsersPageSize

  const [users, totalRows, pendingInvites] = await Promise.all([
    db
      .select({
        userId: usersTable.id,
        email: usersTable.email,
        name: usersTable.name,
        phone: usersTable.phone,
        userStatus: usersTable.status,
        role: userStorePermissionsTable.role,
        isPrimaryResponsible: userStorePermissionsTable.isPrimaryResponsible,
        lastLoginAt: usersTable.lastLoginAt,
        permissionCreatedAt: userStorePermissionsTable.createdAt,
        permissionUpdatedAt: userStorePermissionsTable.updatedAt,
        revokedAt: userStorePermissionsTable.revokedAt,
        revokedReason: userStorePermissionsTable.revokedReason,
      })
      .from(userStorePermissionsTable)
      .innerJoin(usersTable, eq(usersTable.id, userStorePermissionsTable.userId))
      .where(where)
      .orderBy(
        userStorePermissionsTable.revokedAt,
        desc(userStorePermissionsTable.isPrimaryResponsible),
        asc(usersTable.email)
      )
      .limit(storeUsersPageSize)
      .offset(offset),
    db
      .select({ value: count() })
      .from(userStorePermissionsTable)
      .innerJoin(usersTable, eq(usersTable.id, userStorePermissionsTable.userId))
      .where(where),
    db
      .select({
        id: storeAccessInvitesTable.id,
        targetEmail: storeAccessInvitesTable.targetEmail,
        targetName: usersTable.name,
        targetPhone: usersTable.phone,
        deliveryStatus: storeAccessInvitesTable.deliveryStatus,
        expiresAt: storeAccessInvitesTable.expiresAt,
        createdAt: storeAccessInvitesTable.createdAt,
      })
      .from(storeAccessInvitesTable)
      .leftJoin(usersTable, eq(usersTable.id, storeAccessInvitesTable.targetUserId))
      .where(
        and(
          eq(storeAccessInvitesTable.storeId, storeId),
          eq(storeAccessInvitesTable.status, 'pending'),
          sql`${storeAccessInvitesTable.usedAt} is null`,
          sql`${storeAccessInvitesTable.revokedAt} is null`,
          sql`${storeAccessInvitesTable.expiresAt} > now()`
        )
      )
      .orderBy(desc(storeAccessInvitesTable.createdAt))
      .limit(8),
  ])

  const total = totalRows[0]?.value ?? 0

  return {
    users: users.map(user => ({
      ...user,
      accessStatus: mapAccessStatus(user),
    })),
    pendingInvites,
    pagination: {
      page,
      pageSize: storeUsersPageSize,
      total,
      pageCount: Math.max(1, Math.ceil(total / storeUsersPageSize)),
    },
  }
}

export async function inviteStoreUser(
  storeId: number,
  values: z.infer<typeof storeUserInviteSchema>
) {
  const parsed = storeUserInviteSchema.parse(values)
  const actor = await getActor()
  await validateUserPermissionsForStore(storeId, 'admin')

  const normalizedEmail = normalizeUserEmail(parsed.email)
  const now = new Date()

  return await db.transaction(async tx => {
    let [targetUser] = await tx
      .select()
      .from(usersTable)
      .where(
        and(
          eq(usersTable.status, 'active'),
          sql`lower(${usersTable.email}) = ${normalizedEmail}`
        )
      )
      .limit(1)

    if (!targetUser) {
      const [createdUser] = await tx
        .insert(usersTable)
        .values({
          email: normalizedEmail,
          name: normalizeTextInput(parsed.name),
          phone: normalizeTextInput(parsed.phone),
          status: 'active',
          lastLoginAt: null,
          updatedAt: now,
        })
        .returning()

      targetUser = createdUser
    }

    const [activePermission] = await tx
      .select({ userId: userStorePermissionsTable.userId })
      .from(userStorePermissionsTable)
      .where(
        and(
          eq(userStorePermissionsTable.userId, targetUser.id),
          eq(userStorePermissionsTable.storeId, storeId),
          eq(userStorePermissionsTable.role, 'admin'),
          sql`${userStorePermissionsTable.revokedAt} is null`
        )
      )
      .limit(1)

    if (activePermission) throw new Error('STORE_USER_ALREADY_ACTIVE')

    await tx
      .update(storeAccessInvitesTable)
      .set({
        status: 'revoked',
        revokedAt: now,
        updatedAt: now,
      })
      .where(
        and(
          eq(storeAccessInvitesTable.storeId, storeId),
          sql`lower(${storeAccessInvitesTable.targetEmail}) = ${normalizedEmail}`,
          eq(storeAccessInvitesTable.status, 'pending'),
          sql`${storeAccessInvitesTable.usedAt} is null`,
          sql`${storeAccessInvitesTable.revokedAt} is null`
        )
      )

    const token = createStoreAccessInviteToken()
    const tokenHash = hashStoreAccessInviteToken(
      token,
      getStoreAccessInviteSecret()
    )
    const expiresAt = getStoreAccessInviteExpiresAt(now)

    const [invite] = await tx
      .insert(storeAccessInvitesTable)
      .values({
        storeId,
        targetUserId: targetUser.id,
        targetEmail: normalizedEmail,
        role: 'admin',
        tokenHash,
        status: 'pending',
        deliveryChannel: 'manual',
        deliveryStatus: 'ready',
        expiresAt,
        createdByClerkId: actor.clerkId,
        createdByEmail: actor.email,
        updatedAt: now,
      })
      .returning()

    await tx.insert(internalOperationAuditLogsTable).values({
      action: 'create_store_user_invite',
      actorClerkId: actor.clerkId,
      actorEmail: actor.email,
      actorName: actor.name,
      storeId,
      targetUserId: targetUser.id,
      targetUserEmail: normalizedEmail,
      previousStoreStatus: 'store_user_not_linked',
      newStoreStatus: 'store_user_invited',
      reason: 'Convite de acesso criado por administrador da loja.',
    })

    return {
      inviteId: invite.id,
      inviteUrl: buildStoreAccessInviteUrl({
        token,
        baseUrl: getAppBaseUrl(),
      }),
      targetEmail: normalizedEmail,
      expiresAt,
    }
  })
}

export async function updateStoreUser(
  storeId: number,
  values: z.infer<typeof storeUserUpdateSchema>
) {
  const parsed = storeUserUpdateSchema.parse(values)
  const actor = await getActor()
  await validateUserPermissionsForStore(storeId, 'admin')
  const now = new Date()

  return await db.transaction(async tx => {
    const [target] = await tx
      .select({
        userId: usersTable.id,
        email: usersTable.email,
        name: usersTable.name,
        phone: usersTable.phone,
        isPrimaryResponsible: userStorePermissionsTable.isPrimaryResponsible,
        revokedAt: userStorePermissionsTable.revokedAt,
        userStatus: usersTable.status,
      })
      .from(userStorePermissionsTable)
      .innerJoin(usersTable, eq(usersTable.id, userStorePermissionsTable.userId))
      .where(
        and(
          eq(userStorePermissionsTable.storeId, storeId),
          eq(userStorePermissionsTable.userId, parsed.userId),
          eq(userStorePermissionsTable.role, 'admin')
        )
      )
      .limit(1)

    if (!target) throw new Error('STORE_USER_NOT_FOUND')
    if (target.revokedAt || target.userStatus !== 'active') {
      throw new Error('STORE_USER_NOT_ACTIVE')
    }

    const users = await getStoreAccessStates(storeId, tx)

    if (!parsed.isPrimaryResponsible) {
      assertCanUnsetPrimaryResponsible({
        targetUserId: parsed.userId,
        users,
      })
    }

    await tx
      .update(usersTable)
      .set({
        name: normalizeTextInput(parsed.name),
        phone: normalizeTextInput(parsed.phone),
        updatedAt: now,
      })
      .where(eq(usersTable.id, parsed.userId))

    if (parsed.isPrimaryResponsible && !target.isPrimaryResponsible) {
      await tx
        .update(userStorePermissionsTable)
        .set({
          isPrimaryResponsible: false,
          updatedAt: now,
        })
        .where(
          and(
            eq(userStorePermissionsTable.storeId, storeId),
            sql`${userStorePermissionsTable.revokedAt} is null`
          )
        )

      await tx
        .update(userStorePermissionsTable)
        .set({
          isPrimaryResponsible: true,
          assignedPrimaryAt: now,
          updatedAt: now,
        })
        .where(
          and(
            eq(userStorePermissionsTable.storeId, storeId),
            eq(userStorePermissionsTable.userId, parsed.userId)
          )
        )

      await tx.insert(internalOperationAuditLogsTable).values({
        action: 'transfer_store_primary_responsible',
        actorClerkId: actor.clerkId,
        actorEmail: actor.email,
        actorName: actor.name,
        storeId,
        targetUserId: parsed.userId,
        targetUserEmail: target.email,
        previousStoreStatus: 'primary_responsible_changed',
        newStoreStatus: 'primary_responsible_assigned',
        reason: 'Responsavel principal da loja atualizado pelo painel da loja.',
      })
    }

    await tx.insert(internalOperationAuditLogsTable).values({
      action: 'update_store_user',
      actorClerkId: actor.clerkId,
      actorEmail: actor.email,
      actorName: actor.name,
      storeId,
      targetUserId: parsed.userId,
      targetUserEmail: target.email,
      previousStoreStatus: 'store_user_active',
      newStoreStatus: 'store_user_updated',
      reason: `Usuario atualizado pela loja. nome=${target.name ?? '-'} -> ${normalizeTextInput(parsed.name) ?? '-'}; telefone=${target.phone ?? '-'} -> ${normalizeTextInput(parsed.phone) ?? '-'}.`,
    })

    return { success: true }
  })
}

export async function revokeStoreUser(
  storeId: number,
  values: z.infer<typeof storeUserRevokeSchema>
) {
  const parsed = storeUserRevokeSchema.parse(values)
  const actor = await getActor()
  await validateUserPermissionsForStore(storeId, 'admin')
  const now = new Date()

  return await db.transaction(async tx => {
    const users = await getStoreAccessStates(storeId, tx)
    assertCanRevokeStoreUser({ targetUserId: parsed.userId, users })
    const fallbackPrimaryUserId = getFallbackPrimaryResponsibleUserId({
      targetUserId: parsed.userId,
      users,
    })

    const [target] = await tx
      .select({
        email: usersTable.email,
        isPrimaryResponsible: userStorePermissionsTable.isPrimaryResponsible,
      })
      .from(userStorePermissionsTable)
      .innerJoin(usersTable, eq(usersTable.id, userStorePermissionsTable.userId))
      .where(
        and(
          eq(userStorePermissionsTable.storeId, storeId),
          eq(userStorePermissionsTable.userId, parsed.userId),
          sql`${userStorePermissionsTable.revokedAt} is null`
        )
      )
      .limit(1)

    if (!target) throw new Error('STORE_USER_NOT_ACTIVE')

    const revokedRows = await tx
      .update(userStorePermissionsTable)
      .set({
        revokedAt: now,
        revokedReason: parsed.reason,
        isPrimaryResponsible: false,
        assignedPrimaryAt: null,
        updatedAt: now,
      })
      .where(
        and(
          eq(userStorePermissionsTable.storeId, storeId),
          eq(userStorePermissionsTable.userId, parsed.userId),
          sql`${userStorePermissionsTable.revokedAt} is null`,
          sql`(
            select count(*)
            from ${userStorePermissionsTable} usp
            inner join ${usersTable} u on u.id = usp.user_id
            where usp.store_id = ${storeId}
              and usp.role = 'admin'
              and usp.revoked_at is null
              and u.status = 'active'
          ) > 1`
        )
      )
      .returning({ userId: userStorePermissionsTable.userId })

    if (revokedRows.length === 0) {
      throw new Error('LAST_ACTIVE_STORE_ADMIN')
    }

    if (fallbackPrimaryUserId) {
      await tx
        .update(userStorePermissionsTable)
        .set({
          isPrimaryResponsible: true,
          assignedPrimaryAt: now,
          updatedAt: now,
        })
        .where(
          and(
            eq(userStorePermissionsTable.storeId, storeId),
            eq(userStorePermissionsTable.userId, fallbackPrimaryUserId),
            sql`${userStorePermissionsTable.revokedAt} is null`
          )
        )
    }

    await tx.insert(internalOperationAuditLogsTable).values({
      action: 'revoke_store_user',
      actorClerkId: actor.clerkId,
      actorEmail: actor.email,
      actorName: actor.name,
      storeId,
      targetUserId: parsed.userId,
      targetUserEmail: target.email,
      previousStoreStatus: 'store_user_active',
      newStoreStatus: fallbackPrimaryUserId
        ? 'store_user_revoked_primary_transferred'
        : 'store_user_revoked',
      reason: parsed.reason,
    })

    return { success: true }
  })
}

export async function revokeStoreUserInvite(
  storeId: number,
  values: z.infer<typeof storeInviteRevokeSchema>
) {
  const parsed = storeInviteRevokeSchema.parse(values)
  const actor = await getActor()
  await validateUserPermissionsForStore(storeId, 'admin')
  const now = new Date()

  const [invite] = await db
    .update(storeAccessInvitesTable)
    .set({
      status: 'revoked',
      revokedAt: now,
      updatedAt: now,
    })
    .where(
      and(
        eq(storeAccessInvitesTable.id, parsed.inviteId),
        eq(storeAccessInvitesTable.storeId, storeId),
        eq(storeAccessInvitesTable.status, 'pending'),
        sql`${storeAccessInvitesTable.usedAt} is null`,
        sql`${storeAccessInvitesTable.revokedAt} is null`
      )
    )
    .returning()

  if (!invite) throw new Error('STORE_INVITE_NOT_PENDING')

  await db.insert(internalOperationAuditLogsTable).values({
    action: 'revoke_store_user',
    actorClerkId: actor.clerkId,
    actorEmail: actor.email,
    actorName: actor.name,
    storeId,
    targetUserId: invite.targetUserId,
    targetUserEmail: invite.targetEmail,
    previousStoreStatus: 'store_user_invited',
    newStoreStatus: 'store_user_invite_revoked',
    reason: parsed.reason,
  })

  return { success: true }
}
