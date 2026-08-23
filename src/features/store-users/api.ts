'use server'

import { validateUserPermissionsForStore } from '@/features/store/api'
import { normalizeUserEmail } from '@/features/user/user-policy'
import { requireAuth } from '@/services/auth'
import { db } from '@/services/db'
import {
  internalOperationAuditLogsTable,
  storeAccessInvitesTable,
  storeUserAccessBlocksTable,
  storeUserPasswordResetRequestsTable,
  userStorePermissionRoles,
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
import { getPublicAppBaseUrl } from '@/shared/lib/domain-config'
import { auth, clerkClient } from '@clerk/nextjs/server'
import { and, asc, count, desc, eq, or, sql, type SQL } from 'drizzle-orm'
import { z } from 'zod'
import {
  assertCanAssignPrimaryResponsibleRole,
  assertCanBlockStoreUser,
  assertCanChangeStoreUserRole,
  assertCanRevokeStoreUser,
  assertCanUnsetPrimaryResponsible,
  getFallbackPrimaryResponsibleUserId,
  type StoreUserRole,
  type StoreUserAccessState,
} from './store-users-policy'

const storeUsersPageSize = 8

const maskStoreUserAuditPhone = (value: string | null | undefined) => {
  const digits = value?.replace(/\D/g, '') ?? ''
  if (!digits) return '-'

  return `***${digits.slice(-4)}`
}

const storeUserInviteSchema = z.object({
  email: z.string().email('Informe um e-mail valido.'),
  name: z.string().trim().max(120).optional(),
  phone: z.string().trim().max(32).optional(),
  role: z.enum(userStorePermissionRoles),
})

const storeUserUpdateSchema = z.object({
  userId: z.string().uuid(),
  name: z.string().trim().max(120).optional(),
  phone: z.string().trim().max(32).optional(),
  role: z.enum(userStorePermissionRoles),
  isPrimaryResponsible: z.boolean(),
})

const storeUserRevokeSchema = z.object({
  userId: z.string().uuid(),
  reason: z
    .string()
    .trim()
    .min(8, 'Informe um motivo com pelo menos 8 caracteres.'),
})

const storeUserBlockSchema = z.object({
  userId: z.string().uuid(),
  reason: z
    .string()
    .trim()
    .min(8, 'Informe um motivo com pelo menos 8 caracteres.'),
  notificationChannel: z
    .enum(['none', 'email', 'whatsapp', 'manual'])
    .default('none'),
  notificationNote: z.string().trim().max(500).optional(),
})

const storeUserUnblockSchema = z.object({
  userId: z.string().uuid(),
  reason: z
    .string()
    .trim()
    .min(8, 'Informe um motivo com pelo menos 8 caracteres.'),
})

const storeInviteRevokeSchema = z.object({
  inviteId: z.number().int().positive(),
  reason: z
    .string()
    .trim()
    .min(8, 'Informe um motivo com pelo menos 8 caracteres.'),
})

const storeInviteResendSchema = z.object({
  inviteId: z.number().int().positive(),
})

const storePasswordResetRequestSchema = z.object({
  userId: z.string().uuid(),
})

const passwordResetLinkConsumedSchema = z.object({
  requestId: z.string().uuid(),
})

export type StoreUsersStatusFilter =
  | 'all'
  | 'active'
  | 'blocked'
  | 'revoked'
  | 'deleted'

export type StoreUsersQuery = {
  page?: number
  search?: string
  status?: StoreUsersStatusFilter
  role?: StoreUserRole | 'all'
}

export type StoreUserListItem = {
  userId: string
  email: string
  name: string | null
  phone: string | null
  userStatus: 'active' | 'deleted'
  role: StoreUserRole
  isPrimaryResponsible: boolean
  lastLoginAt: Date | null
  permissionCreatedAt: Date
  permissionUpdatedAt: Date
  revokedAt: Date | null
  revokedReason: string | null
  blockedAt: Date | null
  blockedReason: string | null
  blockNotificationChannel: 'none' | 'email' | 'whatsapp' | 'manual' | null
  blockNotificationNote: string | null
  unblockedAt: Date | null
  unblockedReason: string | null
  accessStatus: 'active' | 'blocked' | 'revoked' | 'deleted'
}

export type StorePendingInvite = {
  id: number
  targetEmail: string
  targetName: string | null
  targetPhone: string | null
  role: StoreUserRole
  deliveryStatus: string
  expiresAt: Date
  createdAt: Date
}

const STORE_USER_PASSWORD_RESET_TTL_SECONDS = 60 * 60

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

const getPasswordResetExpiresAt = (now = new Date()) =>
  new Date(now.getTime() + STORE_USER_PASSWORD_RESET_TTL_SECONDS * 1000)

const buildPasswordResetUrl = ({ requestId }: { requestId: string }) => {
  const url = new URL('/acesso-temporario', getPublicAppBaseUrl())
  url.searchParams.set('request', requestId)
  return url.toString()
}

async function revokeActiveClerkSessionsForUser(clerkUserId: string) {
  const client = await clerkClient()
  const sessions = await client.sessions.getSessionList({
    userId: clerkUserId,
    status: 'active',
    limit: 500,
  })

  await Promise.all(
    sessions.data.map(session => client.sessions.revokeSession(session.id))
  )

  return sessions.data.length
}

const getStoreUsersWhere = ({
  storeId,
  search,
  status,
  role,
}: {
  storeId: number
  search: string
  status: StoreUsersStatusFilter
  role: StoreUserRole | 'all'
}) => {
  const conditions: SQL[] = [eq(userStorePermissionsTable.storeId, storeId)]

  if (role !== 'all') {
    conditions.push(eq(userStorePermissionsTable.role, role))
  }

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
      sql`not exists (
        select 1 from ${storeUserAccessBlocksTable} suab
        where suab.store_id = ${userStorePermissionsTable.storeId}
          and suab.user_id = ${userStorePermissionsTable.userId}
          and suab.unblocked_at is null
      )`,
      eq(usersTable.status, 'active')
    )
  }

  if (status === 'blocked') {
    conditions.push(
      sql`${userStorePermissionsTable.revokedAt} is null`,
      sql`exists (
        select 1 from ${storeUserAccessBlocksTable} suab
        where suab.store_id = ${userStorePermissionsTable.storeId}
          and suab.user_id = ${userStorePermissionsTable.userId}
          and suab.unblocked_at is null
      )`,
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
  blockedAt: Date | null
}): StoreUserListItem['accessStatus'] => {
  if (row.userStatus === 'deleted') return 'deleted'
  if (row.revokedAt) return 'revoked'
  if (row.blockedAt) return 'blocked'
  return 'active'
}

async function getStoreAccessStates(
  storeId: number,
  tx: Pick<typeof db, 'select'> = db
) {
  const rows = await tx
    .select({
      userId: userStorePermissionsTable.userId,
      role: userStorePermissionsTable.role,
      isPrimaryResponsible: userStorePermissionsTable.isPrimaryResponsible,
      revokedAt: userStorePermissionsTable.revokedAt,
      blockedAt: storeUserAccessBlocksTable.blockedAt,
      userStatus: usersTable.status,
    })
    .from(userStorePermissionsTable)
    .innerJoin(usersTable, eq(usersTable.id, userStorePermissionsTable.userId))
    .leftJoin(
      storeUserAccessBlocksTable,
      and(
        eq(
          storeUserAccessBlocksTable.storeId,
          userStorePermissionsTable.storeId
        ),
        eq(storeUserAccessBlocksTable.userId, userStorePermissionsTable.userId),
        sql`${storeUserAccessBlocksTable.unblockedAt} is null`
      )
    )
    .where(eq(userStorePermissionsTable.storeId, storeId))

  return rows satisfies StoreUserAccessState[]
}

export async function getStoreUsers(
  storeId: number,
  query: StoreUsersQuery = {}
) {
  await validateUserPermissionsForStore(storeId, 'store.users.manage')

  const page = Math.max(1, query.page ?? 1)
  const search = query.search?.trim() ?? ''
  const status = query.status ?? 'all'
  const role = query.role ?? 'all'
  const where = getStoreUsersWhere({ storeId, search, status, role })
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
        blockedAt: storeUserAccessBlocksTable.blockedAt,
        blockedReason: storeUserAccessBlocksTable.reason,
        blockNotificationChannel:
          storeUserAccessBlocksTable.notificationChannel,
        blockNotificationNote: storeUserAccessBlocksTable.notificationNote,
        unblockedAt: storeUserAccessBlocksTable.unblockedAt,
        unblockedReason: storeUserAccessBlocksTable.unblockReason,
      })
      .from(userStorePermissionsTable)
      .innerJoin(
        usersTable,
        eq(usersTable.id, userStorePermissionsTable.userId)
      )
      .leftJoin(
        storeUserAccessBlocksTable,
        and(
          eq(
            storeUserAccessBlocksTable.storeId,
            userStorePermissionsTable.storeId
          ),
          eq(
            storeUserAccessBlocksTable.userId,
            userStorePermissionsTable.userId
          ),
          sql`${storeUserAccessBlocksTable.unblockedAt} is null`
        )
      )
      .where(where)
      .orderBy(
        userStorePermissionsTable.revokedAt,
        storeUserAccessBlocksTable.blockedAt,
        desc(userStorePermissionsTable.isPrimaryResponsible),
        asc(usersTable.email)
      )
      .limit(storeUsersPageSize)
      .offset(offset),
    db
      .select({ value: count() })
      .from(userStorePermissionsTable)
      .innerJoin(
        usersTable,
        eq(usersTable.id, userStorePermissionsTable.userId)
      )
      .where(where),
    db
      .select({
        id: storeAccessInvitesTable.id,
        targetEmail: storeAccessInvitesTable.targetEmail,
        targetName: usersTable.name,
        targetPhone: usersTable.phone,
        role: storeAccessInvitesTable.role,
        deliveryStatus: storeAccessInvitesTable.deliveryStatus,
        expiresAt: storeAccessInvitesTable.expiresAt,
        createdAt: storeAccessInvitesTable.createdAt,
      })
      .from(storeAccessInvitesTable)
      .leftJoin(
        usersTable,
        eq(usersTable.id, storeAccessInvitesTable.targetUserId)
      )
      .where(
        and(
          eq(storeAccessInvitesTable.storeId, storeId),
          role !== 'all' ? eq(storeAccessInvitesTable.role, role) : undefined,
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
  await validateUserPermissionsForStore(storeId, 'store.users.manage')

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
        role: parsed.role,
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
      reason: `Convite de acesso criado pela loja. perfil=${parsed.role}.`,
    })

    return {
      inviteId: invite.id,
      inviteUrl: buildStoreAccessInviteUrl({
        token,
        baseUrl: getPublicAppBaseUrl(),
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
  await validateUserPermissionsForStore(storeId, 'store.users.manage')
  const now = new Date()

  return await db.transaction(async tx => {
    const [target] = await tx
      .select({
        userId: usersTable.id,
        email: usersTable.email,
        name: usersTable.name,
        phone: usersTable.phone,
        role: userStorePermissionsTable.role,
        isPrimaryResponsible: userStorePermissionsTable.isPrimaryResponsible,
        revokedAt: userStorePermissionsTable.revokedAt,
        blockedAt: storeUserAccessBlocksTable.blockedAt,
        userStatus: usersTable.status,
      })
      .from(userStorePermissionsTable)
      .innerJoin(
        usersTable,
        eq(usersTable.id, userStorePermissionsTable.userId)
      )
      .leftJoin(
        storeUserAccessBlocksTable,
        and(
          eq(
            storeUserAccessBlocksTable.storeId,
            userStorePermissionsTable.storeId
          ),
          eq(
            storeUserAccessBlocksTable.userId,
            userStorePermissionsTable.userId
          ),
          sql`${storeUserAccessBlocksTable.unblockedAt} is null`
        )
      )
      .where(
        and(
          eq(userStorePermissionsTable.storeId, storeId),
          eq(userStorePermissionsTable.userId, parsed.userId)
        )
      )
      .limit(1)

    if (!target) throw new Error('STORE_USER_NOT_FOUND')
    if (
      target.revokedAt ||
      target.blockedAt ||
      target.userStatus !== 'active'
    ) {
      throw new Error('STORE_USER_NOT_ACTIVE')
    }

    const users = await getStoreAccessStates(storeId, tx)

    assertCanChangeStoreUserRole({
      targetUserId: parsed.userId,
      nextRole: parsed.role,
      users,
    })

    if (!parsed.isPrimaryResponsible) {
      assertCanUnsetPrimaryResponsible({
        targetUserId: parsed.userId,
        users,
      })
    }

    if (parsed.isPrimaryResponsible) {
      assertCanAssignPrimaryResponsibleRole(parsed.role)
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
          role: parsed.role,
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
    } else if (target.role !== parsed.role) {
      const updatedPermissions = await tx
        .update(userStorePermissionsTable)
        .set({
          role: parsed.role,
          updatedAt: now,
        })
        .where(
          and(
            eq(userStorePermissionsTable.storeId, storeId),
            eq(userStorePermissionsTable.userId, parsed.userId),
            target.role === 'owner'
              ? sql`(
                  select count(*)
                  from ${userStorePermissionsTable} usp
                  inner join ${usersTable} u on u.id = usp.user_id
                  where usp.store_id = ${storeId}
                    and usp.role = 'owner'
                    and usp.revoked_at is null
                    and not exists (
                      select 1 from ${storeUserAccessBlocksTable} suab
                      where suab.store_id = usp.store_id
                        and suab.user_id = usp.user_id
                        and suab.unblocked_at is null
                    )
                    and u.status = 'active'
                ) > 1`
              : sql`true`
          )
        )
        .returning({ userId: userStorePermissionsTable.userId })

      if (updatedPermissions.length === 0) {
        throw new Error('LAST_ACTIVE_STORE_OWNER')
      }
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
      reason: `Usuario atualizado pela loja. nome=${target.name ?? '-'} -> ${normalizeTextInput(parsed.name) ?? '-'}; telefone=${maskStoreUserAuditPhone(target.phone)} -> ${maskStoreUserAuditPhone(parsed.phone)}; perfil=${target.role} -> ${parsed.role}.`,
    })

    return { success: true }
  })
}

export async function blockStoreUserAccess(
  storeId: number,
  values: z.infer<typeof storeUserBlockSchema>
) {
  const parsed = storeUserBlockSchema.parse(values)
  const actor = await getActor()
  await validateUserPermissionsForStore(storeId, 'store.users.manage')
  const now = new Date()

  const blockResult = await db.transaction(async tx => {
    await tx.execute(
      sql`select 1 from ${userStorePermissionsTable} where store_id = ${storeId} for update`
    )

    const users = await getStoreAccessStates(storeId, tx)
    assertCanBlockStoreUser({ targetUserId: parsed.userId, users })

    const fallbackPrimaryUserId = getFallbackPrimaryResponsibleUserId({
      targetUserId: parsed.userId,
      users,
    })

    const [target] = await tx
      .select({
        email: usersTable.email,
        clerkId: usersTable.clerkId,
        role: userStorePermissionsTable.role,
        isPrimaryResponsible: userStorePermissionsTable.isPrimaryResponsible,
        activeBlockId: storeUserAccessBlocksTable.id,
      })
      .from(userStorePermissionsTable)
      .innerJoin(
        usersTable,
        eq(usersTable.id, userStorePermissionsTable.userId)
      )
      .leftJoin(
        storeUserAccessBlocksTable,
        and(
          eq(
            storeUserAccessBlocksTable.storeId,
            userStorePermissionsTable.storeId
          ),
          eq(
            storeUserAccessBlocksTable.userId,
            userStorePermissionsTable.userId
          ),
          sql`${storeUserAccessBlocksTable.unblockedAt} is null`
        )
      )
      .where(
        and(
          eq(userStorePermissionsTable.storeId, storeId),
          eq(userStorePermissionsTable.userId, parsed.userId),
          sql`${userStorePermissionsTable.revokedAt} is null`,
          eq(usersTable.status, 'active')
        )
      )
      .limit(1)

    if (!target) throw new Error('STORE_USER_NOT_ACTIVE')
    if (target.activeBlockId) throw new Error('STORE_USER_ALREADY_BLOCKED')
    if (target.clerkId && target.clerkId === actor.clerkId) {
      throw new Error('CANNOT_BLOCK_SELF')
    }

    const [block] = await tx
      .insert(storeUserAccessBlocksTable)
      .values({
        storeId,
        userId: parsed.userId,
        reason: parsed.reason,
        notificationChannel: parsed.notificationChannel,
        notificationNote: normalizeTextInput(parsed.notificationNote),
        blockedAt: now,
        blockedByClerkId: actor.clerkId,
        blockedByEmail: actor.email,
        blockedByName: actor.name,
        updatedAt: now,
      })
      .returning()

    if (target.isPrimaryResponsible) {
      await tx
        .update(userStorePermissionsTable)
        .set({
          isPrimaryResponsible: false,
          assignedPrimaryAt: null,
          updatedAt: now,
        })
        .where(
          and(
            eq(userStorePermissionsTable.storeId, storeId),
            eq(userStorePermissionsTable.userId, parsed.userId)
          )
        )
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
      action: 'block_store_user_access',
      actorClerkId: actor.clerkId,
      actorEmail: actor.email,
      actorName: actor.name,
      storeId,
      targetUserId: parsed.userId,
      targetUserEmail: target.email,
      previousStoreStatus: 'store_user_active',
      newStoreStatus: fallbackPrimaryUserId
        ? 'store_user_blocked_primary_transferred'
        : 'store_user_blocked',
      reason: `Bloqueio de acesso individual. motivo=${parsed.reason}; notificacao=${parsed.notificationChannel}.`,
    })

    return {
      blockId: block.id,
      targetClerkId: target.clerkId,
    }
  })

  let revokedSessionCount = 0
  let sessionRevocationFailed = false

  if (blockResult.targetClerkId) {
    try {
      revokedSessionCount = await revokeActiveClerkSessionsForUser(
        blockResult.targetClerkId
      )
    } catch (error) {
      sessionRevocationFailed = true
      console.error('[StoreUsers] Failed to revoke Clerk sessions:', error)
    }
  }

  return {
    success: true,
    blockId: blockResult.blockId,
    revokedSessionCount,
    sessionRevocationFailed,
  }
}

export async function unblockStoreUserAccess(
  storeId: number,
  values: z.infer<typeof storeUserUnblockSchema>
) {
  const parsed = storeUserUnblockSchema.parse(values)
  const actor = await getActor()
  await validateUserPermissionsForStore(storeId, 'store.users.manage')
  const now = new Date()

  const [target] = await db
    .select({
      email: usersTable.email,
      userStatus: usersTable.status,
      revokedAt: userStorePermissionsTable.revokedAt,
      blockedAt: storeUserAccessBlocksTable.blockedAt,
    })
    .from(userStorePermissionsTable)
    .innerJoin(usersTable, eq(usersTable.id, userStorePermissionsTable.userId))
    .leftJoin(
      storeUserAccessBlocksTable,
      and(
        eq(
          storeUserAccessBlocksTable.storeId,
          userStorePermissionsTable.storeId
        ),
        eq(storeUserAccessBlocksTable.userId, userStorePermissionsTable.userId),
        sql`${storeUserAccessBlocksTable.unblockedAt} is null`
      )
    )
    .where(
      and(
        eq(userStorePermissionsTable.storeId, storeId),
        eq(userStorePermissionsTable.userId, parsed.userId)
      )
    )
    .limit(1)

  if (!target || target.revokedAt || target.userStatus !== 'active') {
    throw new Error('STORE_USER_NOT_ACTIVE')
  }

  const [block] = await db
    .update(storeUserAccessBlocksTable)
    .set({
      unblockedAt: now,
      unblockedByClerkId: actor.clerkId,
      unblockedByEmail: actor.email,
      unblockedByName: actor.name,
      unblockReason: parsed.reason,
      updatedAt: now,
    })
    .where(
      and(
        eq(storeUserAccessBlocksTable.storeId, storeId),
        eq(storeUserAccessBlocksTable.userId, parsed.userId),
        sql`${storeUserAccessBlocksTable.unblockedAt} is null`
      )
    )
    .returning()

  if (!block) throw new Error('STORE_USER_NOT_BLOCKED')

  await db.insert(internalOperationAuditLogsTable).values({
    action: 'unblock_store_user_access',
    actorClerkId: actor.clerkId,
    actorEmail: actor.email,
    actorName: actor.name,
    storeId,
    targetUserId: parsed.userId,
    targetUserEmail: target.email,
    previousStoreStatus: 'store_user_blocked',
    newStoreStatus: 'store_user_active',
    reason: parsed.reason,
  })

  return { success: true }
}

export async function revokeStoreUser(
  storeId: number,
  values: z.infer<typeof storeUserRevokeSchema>
) {
  const parsed = storeUserRevokeSchema.parse(values)
  const actor = await getActor()
  await validateUserPermissionsForStore(storeId, 'store.users.manage')
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
        role: userStorePermissionsTable.role,
        isPrimaryResponsible: userStorePermissionsTable.isPrimaryResponsible,
      })
      .from(userStorePermissionsTable)
      .innerJoin(
        usersTable,
        eq(usersTable.id, userStorePermissionsTable.userId)
      )
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
          target.role === 'owner'
            ? sql`(
                select count(*)
                from ${userStorePermissionsTable} usp
                inner join ${usersTable} u on u.id = usp.user_id
                where usp.store_id = ${storeId}
                  and usp.role = 'owner'
                  and usp.revoked_at is null
                  and not exists (
                    select 1 from ${storeUserAccessBlocksTable} suab
                    where suab.store_id = usp.store_id
                      and suab.user_id = usp.user_id
                      and suab.unblocked_at is null
                  )
                  and u.status = 'active'
              ) > 1`
            : sql`true`
        )
      )
      .returning({ userId: userStorePermissionsTable.userId })

    if (revokedRows.length === 0) {
      throw new Error('LAST_ACTIVE_STORE_OWNER')
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
  await validateUserPermissionsForStore(storeId, 'store.users.manage')
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

export async function resendStoreUserInvite(
  storeId: number,
  values: z.infer<typeof storeInviteResendSchema>
) {
  const parsed = storeInviteResendSchema.parse(values)
  const actor = await getActor()
  await validateUserPermissionsForStore(storeId, 'store.users.manage')
  const now = new Date()

  return await db.transaction(async tx => {
    const [currentInvite] = await tx
      .select()
      .from(storeAccessInvitesTable)
      .where(
        and(
          eq(storeAccessInvitesTable.id, parsed.inviteId),
          eq(storeAccessInvitesTable.storeId, storeId),
          eq(storeAccessInvitesTable.status, 'pending'),
          sql`${storeAccessInvitesTable.usedAt} is null`,
          sql`${storeAccessInvitesTable.revokedAt} is null`,
          sql`${storeAccessInvitesTable.expiresAt} > now()`
        )
      )
      .limit(1)

    if (!currentInvite) throw new Error('STORE_INVITE_NOT_PENDING')

    await tx
      .update(storeAccessInvitesTable)
      .set({
        status: 'revoked',
        revokedAt: now,
        updatedAt: now,
      })
      .where(eq(storeAccessInvitesTable.id, currentInvite.id))

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
        targetUserId: currentInvite.targetUserId,
        targetEmail: currentInvite.targetEmail,
        role: currentInvite.role,
        tokenHash,
        status: 'pending',
        deliveryChannel: currentInvite.deliveryChannel,
        deliveryStatus: 'ready',
        expiresAt,
        createdByClerkId: actor.clerkId,
        createdByEmail: actor.email,
        updatedAt: now,
      })
      .returning()

    await tx.insert(internalOperationAuditLogsTable).values({
      action: 'resend_store_user_invite',
      actorClerkId: actor.clerkId,
      actorEmail: actor.email,
      actorName: actor.name,
      storeId,
      targetUserId: currentInvite.targetUserId,
      targetUserEmail: currentInvite.targetEmail,
      previousStoreStatus: 'store_user_invite_pending',
      newStoreStatus: 'store_user_invite_reissued',
      reason: `Convite reenviado pela loja. convite_anterior=${currentInvite.id}; novo_convite=${invite.id}; perfil=${invite.role}.`,
    })

    return {
      inviteId: invite.id,
      inviteUrl: buildStoreAccessInviteUrl({
        token,
        baseUrl: getPublicAppBaseUrl(),
      }),
      targetEmail: invite.targetEmail,
      expiresAt,
    }
  })
}

export async function requestStoreUserPasswordReset(
  storeId: number,
  values: z.infer<typeof storePasswordResetRequestSchema>
) {
  const parsed = storePasswordResetRequestSchema.parse(values)
  const actor = await getActor()
  await validateUserPermissionsForStore(storeId, 'store.users.manage')
  const now = new Date()
  const expiresAt = getPasswordResetExpiresAt(now)

  const [target] = await db
    .select({
      userId: usersTable.id,
      email: usersTable.email,
      name: usersTable.name,
      clerkId: usersTable.clerkId,
      userStatus: usersTable.status,
      revokedAt: userStorePermissionsTable.revokedAt,
      blockedAt: storeUserAccessBlocksTable.blockedAt,
    })
    .from(userStorePermissionsTable)
    .innerJoin(usersTable, eq(usersTable.id, userStorePermissionsTable.userId))
    .leftJoin(
      storeUserAccessBlocksTable,
      and(
        eq(
          storeUserAccessBlocksTable.storeId,
          userStorePermissionsTable.storeId
        ),
        eq(storeUserAccessBlocksTable.userId, userStorePermissionsTable.userId),
        sql`${storeUserAccessBlocksTable.unblockedAt} is null`
      )
    )
    .where(
      and(
        eq(userStorePermissionsTable.storeId, storeId),
        eq(userStorePermissionsTable.userId, parsed.userId)
      )
    )
    .limit(1)

  if (
    !target ||
    target.revokedAt ||
    target.blockedAt ||
    target.userStatus !== 'active'
  ) {
    throw new Error('STORE_USER_NOT_ACTIVE')
  }

  if (!target.clerkId) throw new Error('STORE_USER_HAS_NO_CLERK_ACCOUNT')
  const targetClerkId = target.clerkId

  const request = await db.transaction(async tx => {
    await tx
      .update(storeUserPasswordResetRequestsTable)
      .set({
        status: 'revoked',
        revokedAt: now,
        updatedAt: now,
      })
      .where(
        and(
          eq(storeUserPasswordResetRequestsTable.storeId, storeId),
          eq(storeUserPasswordResetRequestsTable.targetUserId, target.userId),
          sql`${storeUserPasswordResetRequestsTable.status} in ('pending', 'consumed')`,
          sql`${storeUserPasswordResetRequestsTable.revokedAt} is null`,
          sql`${storeUserPasswordResetRequestsTable.completedAt} is null`
        )
      )

    const [request] = await tx
      .insert(storeUserPasswordResetRequestsTable)
      .values({
        storeId,
        targetUserId: target.userId,
        targetEmail: target.email,
        targetClerkId,
        status: 'pending',
        expiresAt,
        requestedByClerkId: actor.clerkId,
        requestedByEmail: actor.email,
        updatedAt: now,
      })
      .returning()

    await tx.insert(internalOperationAuditLogsTable).values({
      action: 'request_store_user_password_reset',
      actorClerkId: actor.clerkId,
      actorEmail: actor.email,
      actorName: actor.name,
      storeId,
      targetUserId: target.userId,
      targetUserEmail: target.email,
      previousStoreStatus: 'store_user_active',
      newStoreStatus: 'store_user_password_reset_requested',
      reason:
        'Link temporario de recuperacao solicitado pela loja. O codigo de redefinicao e enviado somente ao e-mail do usuario alvo.',
    })

    return request
  })

  return {
    requestId: request.id,
    resetUrl: buildPasswordResetUrl({
      requestId: request.id,
    }),
    targetEmail: target.email,
    expiresAt,
  }
}

export async function getStoreUserPasswordResetRequestPreview(
  requestId: string
) {
  const parsed = passwordResetLinkConsumedSchema.parse({ requestId })
  const now = new Date()

  const [request] = await db
    .select({
      targetEmail: storeUserPasswordResetRequestsTable.targetEmail,
      status: storeUserPasswordResetRequestsTable.status,
      expiresAt: storeUserPasswordResetRequestsTable.expiresAt,
      revokedAt: storeUserPasswordResetRequestsTable.revokedAt,
      completedAt: storeUserPasswordResetRequestsTable.completedAt,
    })
    .from(storeUserPasswordResetRequestsTable)
    .where(eq(storeUserPasswordResetRequestsTable.id, parsed.requestId))
    .limit(1)

  if (!request) return { status: 'invalid' as const }
  if (request.completedAt || request.status === 'completed') {
    return { status: 'completed' as const }
  }
  if (request.revokedAt || request.status === 'revoked') {
    return { status: 'revoked' as const }
  }
  if (request.expiresAt <= now || request.status === 'expired') {
    return { status: 'expired' as const }
  }
  if (request.status === 'consumed') {
    return { status: 'consumed' as const }
  }

  return {
    status: 'valid' as const,
    targetEmail: request.targetEmail,
    expiresAt: request.expiresAt,
  }
}

export async function markStoreUserPasswordResetLinkConsumed(values: {
  requestId: string
}) {
  const parsed = passwordResetLinkConsumedSchema.parse(values)
  const now = new Date()

  const [request] = await db
    .update(storeUserPasswordResetRequestsTable)
    .set({
      status: 'consumed',
      consumedAt: now,
      updatedAt: now,
    })
    .where(
      and(
        eq(storeUserPasswordResetRequestsTable.id, parsed.requestId),
        eq(storeUserPasswordResetRequestsTable.status, 'pending'),
        sql`${storeUserPasswordResetRequestsTable.expiresAt} > now()`,
        sql`${storeUserPasswordResetRequestsTable.revokedAt} is null`,
        sql`${storeUserPasswordResetRequestsTable.consumedAt} is null`
      )
    )
    .returning()

  if (!request) throw new Error('PASSWORD_RESET_REQUEST_NOT_AVAILABLE')

  await db.insert(internalOperationAuditLogsTable).values({
    action: 'consume_store_user_password_reset',
    actorClerkId: request.targetClerkId,
    actorEmail: request.targetEmail,
    actorName: null,
    storeId: request.storeId,
    targetUserId: request.targetUserId,
    targetUserEmail: request.targetEmail,
    previousStoreStatus: 'store_user_password_reset_pending',
    newStoreStatus: 'store_user_password_reset_code_sent',
    reason:
      'Codigo de redefinicao solicitado pelo fluxo temporario e enviado pelo Clerk somente ao e-mail do usuario alvo.',
  })

  return { success: true }
}

export async function completeStoreUserPasswordReset(values: {
  requestId: string
}) {
  const parsed = passwordResetLinkConsumedSchema.parse(values)
  const clerkAuth = await auth()

  if (!clerkAuth.userId) throw new Error('NOT_AUTHENTICATED')

  const now = new Date()

  const [request] = await db
    .update(storeUserPasswordResetRequestsTable)
    .set({
      status: 'completed',
      completedAt: now,
      updatedAt: now,
    })
    .where(
      and(
        eq(storeUserPasswordResetRequestsTable.id, parsed.requestId),
        eq(storeUserPasswordResetRequestsTable.targetClerkId, clerkAuth.userId),
        eq(storeUserPasswordResetRequestsTable.status, 'consumed'),
        sql`${storeUserPasswordResetRequestsTable.revokedAt} is null`,
        sql`${storeUserPasswordResetRequestsTable.completedAt} is null`
      )
    )
    .returning()

  if (!request) return { success: true }

  await db.insert(internalOperationAuditLogsTable).values({
    action: 'complete_store_user_password_reset',
    actorClerkId: clerkAuth.userId,
    actorEmail: request.targetEmail,
    actorName: null,
    storeId: request.storeId,
    targetUserId: request.targetUserId,
    targetUserEmail: request.targetEmail,
    previousStoreStatus: 'store_user_password_reset_code_sent',
    newStoreStatus: 'store_user_password_reset_completed',
    reason: 'Redefinicao de senha concluida no fluxo seguro do Clerk.',
  })

  return { success: true }
}
