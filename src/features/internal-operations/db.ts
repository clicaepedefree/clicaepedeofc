import type { InternalOperator } from '@/features/internal-operations/access'
import { normalizeUserEmail } from '@/features/user/user-policy'
import { db } from '@/services/db'
import {
  administrativeAuditLogsTable,
  internalOperationAuditLogsTable,
  storesTable,
  userStorePermissionsTable,
  usersTable,
  type SelectStore,
} from '@/services/db/schema'
import { and, count, desc, eq, inArray, lt, ne, or, sql } from 'drizzle-orm'
import { buildAdministrativeAuditLogInput } from './administrative-audit-policy'

export type InternalStoreStatus = SelectStore['status']

export type InternalStoreListItem = Pick<
  SelectStore,
  | 'id'
  | 'name'
  | 'subdomain'
  | 'status'
  | 'statusReason'
  | 'statusUpdatedAt'
  | 'createdAt'
  | 'updatedAt'
> & {
  admins: {
    userId: string
    email: string
    name: string | null
    userStatus: string
    revokedAt: Date | null
    revokedReason: string | null
  }[]
}

export type InternalAuditLog = typeof internalOperationAuditLogsTable.$inferSelect
export type AdministrativeAuditLog =
  typeof administrativeAuditLogsTable.$inferSelect

const storeStatusValues: InternalStoreStatus[] = [
  'active',
  'inactive',
  'pending_recovery',
  'archived',
]

const serializePermissionSnapshot = (permission: {
  userId: string
  storeId: number
  role: string
  isPrimaryResponsible?: boolean | null
  revokedAt?: Date | null
  revokedReason?: string | null
  email?: string | null
}) => ({
  userId: permission.userId,
  storeId: permission.storeId,
  role: permission.role,
  email: permission.email ?? null,
  isPrimaryResponsible: permission.isPrimaryResponsible ?? null,
  revokedAt: permission.revokedAt?.toISOString() ?? null,
  revokedReason: permission.revokedReason ?? null,
})

export function parseStoreStatus(value: unknown): InternalStoreStatus | undefined {
  if (typeof value !== 'string') return undefined
  if (!storeStatusValues.includes(value as InternalStoreStatus)) return undefined

  return value as InternalStoreStatus
}

export async function getInternalStoreStatusCounts() {
  const rows = await db
    .select({
      status: storesTable.status,
      total: count(storesTable.id),
    })
    .from(storesTable)
    .groupBy(storesTable.status)

  const counts = Object.fromEntries(
    storeStatusValues.map(status => [status, 0])
  ) as Record<InternalStoreStatus, number>

  for (const row of rows) {
    counts[row.status] = row.total
  }

  return counts
}

export async function listInternalStores({
  status,
  search,
}: {
  status?: InternalStoreStatus
  search?: string
}): Promise<InternalStoreListItem[]> {
  const trimmedSearch = search?.trim()
  const searchPattern = trimmedSearch ? `%${trimmedSearch.toLowerCase()}%` : null

  const stores = await db
    .select({
      id: storesTable.id,
      name: storesTable.name,
      subdomain: storesTable.subdomain,
      status: storesTable.status,
      statusReason: storesTable.statusReason,
      statusUpdatedAt: storesTable.statusUpdatedAt,
      createdAt: storesTable.createdAt,
      updatedAt: storesTable.updatedAt,
    })
    .from(storesTable)
    .where(
      and(
        status ? eq(storesTable.status, status) : undefined,
        searchPattern
          ? sql`(
              lower(${storesTable.name}) like ${searchPattern}
              or lower(${storesTable.subdomain}) like ${searchPattern}
              or ${storesTable.id}::text = ${trimmedSearch}
              or exists (
                select 1
                from ${userStorePermissionsTable}
                join ${usersTable} on ${usersTable.id} = ${userStorePermissionsTable.userId}
                where ${userStorePermissionsTable.storeId} = ${storesTable.id}
                  and lower(${usersTable.email}) like ${searchPattern}
              )
            )`
          : undefined
      )
    )
    .orderBy(desc(storesTable.statusUpdatedAt), desc(storesTable.id))
    .limit(100)

  if (stores.length === 0) return []

  const storeIds = stores.map(store => store.id)
  const adminRows = await db
    .select({
      storeId: userStorePermissionsTable.storeId,
      userId: usersTable.id,
      email: usersTable.email,
      name: usersTable.name,
      userStatus: usersTable.status,
      revokedAt: userStorePermissionsTable.revokedAt,
      revokedReason: userStorePermissionsTable.revokedReason,
    })
    .from(userStorePermissionsTable)
    .innerJoin(usersTable, eq(usersTable.id, userStorePermissionsTable.userId))
    .where(
      and(
        inArray(userStorePermissionsTable.storeId, storeIds),
        eq(userStorePermissionsTable.role, 'admin')
      )
    )

  const adminsByStoreId = new Map<number, InternalStoreListItem['admins']>()

  for (const admin of adminRows) {
    const admins = adminsByStoreId.get(admin.storeId) ?? []
    admins.push({
      userId: admin.userId,
      email: admin.email,
      name: admin.name,
      userStatus: admin.userStatus,
      revokedAt: admin.revokedAt,
      revokedReason: admin.revokedReason,
    })
    adminsByStoreId.set(admin.storeId, admins)
  }

  return stores.map(store => ({
    ...store,
    admins: adminsByStoreId.get(store.id) ?? [],
  }))
}

export async function getRecentInternalAuditLogs(limit = 25) {
  return await db
    .select()
    .from(internalOperationAuditLogsTable)
    .orderBy(desc(internalOperationAuditLogsTable.createdAt))
    .limit(limit)
}

export async function listAdministrativeAuditLogsByStore({
  storeId,
  limit = 20,
  cursor,
}: {
  storeId: number
  limit?: number
  cursor?: {
    createdAt: Date
    id: number
  }
}) {
  const safeLimit = Math.min(Math.max(Math.trunc(limit), 1), 50)

  const rows = await db
    .select()
    .from(administrativeAuditLogsTable)
    .where(
      and(
        eq(administrativeAuditLogsTable.storeId, storeId),
        cursor
          ? or(
              lt(administrativeAuditLogsTable.createdAt, cursor.createdAt),
              and(
                eq(administrativeAuditLogsTable.createdAt, cursor.createdAt),
                lt(administrativeAuditLogsTable.id, cursor.id)
              )
            )
          : undefined
      )
    )
    .orderBy(
      desc(administrativeAuditLogsTable.createdAt),
      desc(administrativeAuditLogsTable.id)
    )
    .limit(safeLimit + 1)

  const hasNextPage = rows.length > safeLimit
  const items = hasNextPage ? rows.slice(0, safeLimit) : rows
  const lastItem = items.at(-1)

  return {
    items,
    nextCursor:
      hasNextPage && lastItem
        ? {
            id: lastItem.id,
            createdAt: lastItem.createdAt,
          }
        : null,
  }
}

export async function reactivateStoreWithAdmin({
  storeId,
  adminEmail,
  reason,
  operator,
}: {
  storeId: number
  adminEmail: string
  reason: string
  operator: InternalOperator
}) {
  const normalizedAdminEmail = normalizeUserEmail(adminEmail)
  const now = new Date()

  return await db.transaction(async tx => {
    const [store] = await tx
      .select()
      .from(storesTable)
      .where(eq(storesTable.id, storeId))
      .limit(1)

    if (!store) throw new Error('STORE_NOT_FOUND')
    if (!['pending_recovery', 'inactive'].includes(store.status)) {
      throw new Error('STORE_STATUS_NOT_REACTIVATABLE')
    }

    const [targetUser] = await tx
      .select()
      .from(usersTable)
      .where(
        and(
          eq(usersTable.status, 'active'),
          sql`lower(${usersTable.email}) = ${normalizedAdminEmail}`
        )
      )
      .limit(1)

    if (!targetUser) throw new Error('TARGET_USER_NOT_FOUND')

    const [previousTargetPermission] = await tx
      .select({
        userId: userStorePermissionsTable.userId,
        storeId: userStorePermissionsTable.storeId,
        role: userStorePermissionsTable.role,
        isPrimaryResponsible: userStorePermissionsTable.isPrimaryResponsible,
        revokedAt: userStorePermissionsTable.revokedAt,
        revokedReason: userStorePermissionsTable.revokedReason,
        email: usersTable.email,
      })
      .from(userStorePermissionsTable)
      .innerJoin(usersTable, eq(usersTable.id, userStorePermissionsTable.userId))
      .where(
        and(
          eq(userStorePermissionsTable.userId, targetUser.id),
          eq(userStorePermissionsTable.storeId, storeId)
        )
      )
      .limit(1)

    await tx
      .insert(userStorePermissionsTable)
      .values({
        userId: targetUser.id,
        storeId,
        role: 'admin',
        revokedAt: null,
        revokedReason: null,
      })
      .onConflictDoUpdate({
        target: [
          userStorePermissionsTable.userId,
          userStorePermissionsTable.storeId,
        ],
        set: {
          role: 'admin',
          revokedAt: null,
          revokedReason: null,
          updatedAt: now,
        },
      })

    const [updatedStore] = await tx
      .update(storesTable)
      .set({
        status: 'active',
        statusReason: reason,
        statusUpdatedAt: now,
        updatedAt: now,
      })
      .where(
        and(
          eq(storesTable.id, storeId),
          inArray(storesTable.status, ['pending_recovery', 'inactive'])
        )
      )
      .returning()

    if (!updatedStore) throw new Error('STORE_STATUS_NOT_REACTIVATABLE')

    await tx.insert(internalOperationAuditLogsTable).values({
      action: 'reactivate_store',
      actorClerkId: operator.clerkId,
      actorEmail: operator.email,
      actorName: operator.name,
      storeId,
      targetUserId: targetUser.id,
      targetUserEmail: targetUser.email,
      previousStoreStatus: store.status,
      newStoreStatus: updatedStore.status,
      reason,
    })

    await tx.insert(administrativeAuditLogsTable).values(
      buildAdministrativeAuditLogInput({
        operator,
        storeId,
        scope: 'access',
        action: 'reactivate',
        entityType: 'store',
        entityId: storeId,
        targetUserId: targetUser.id,
        targetUserEmail: targetUser.email,
        reason,
        previousValues: {
          storeStatus: store.status,
          targetPermission: previousTargetPermission
            ? serializePermissionSnapshot(previousTargetPermission)
            : null,
        },
        newValues: {
          storeStatus: updatedStore.status,
          targetPermission: serializePermissionSnapshot({
            userId: targetUser.id,
            storeId,
            role: 'admin',
            revokedAt: null,
            revokedReason: null,
            email: targetUser.email,
          }),
        },
        metadata: {
          source: 'internal_operations',
          legacyAuditAction: 'reactivate_store',
        },
      })
    )

    return updatedStore
  })
}

export async function archiveStore({
  storeId,
  confirmationSubdomain,
  reason,
  operator,
}: {
  storeId: number
  confirmationSubdomain: string
  reason: string
  operator: InternalOperator
}) {
  const now = new Date()

  return await db.transaction(async tx => {
    const [store] = await tx
      .select()
      .from(storesTable)
      .where(eq(storesTable.id, storeId))
      .limit(1)

    if (!store) throw new Error('STORE_NOT_FOUND')
    if (store.status === 'archived') throw new Error('STORE_ALREADY_ARCHIVED')
    if (confirmationSubdomain !== store.subdomain) {
      throw new Error('STORE_CONFIRMATION_MISMATCH')
    }

    const activePermissionsBeforeArchive = await tx
      .select({
        userId: userStorePermissionsTable.userId,
        storeId: userStorePermissionsTable.storeId,
        role: userStorePermissionsTable.role,
        isPrimaryResponsible: userStorePermissionsTable.isPrimaryResponsible,
        revokedAt: userStorePermissionsTable.revokedAt,
        revokedReason: userStorePermissionsTable.revokedReason,
        email: usersTable.email,
      })
      .from(userStorePermissionsTable)
      .innerJoin(usersTable, eq(usersTable.id, userStorePermissionsTable.userId))
      .where(
        and(
          eq(userStorePermissionsTable.storeId, storeId),
          sql`${userStorePermissionsTable.revokedAt} is null`
        )
      )

    const revokedPermissions = await tx
      .update(userStorePermissionsTable)
      .set({
        revokedAt: now,
        revokedReason: 'store_archived',
        updatedAt: now,
      })
      .where(
        and(
          eq(userStorePermissionsTable.storeId, storeId),
          sql`${userStorePermissionsTable.revokedAt} is null`
        )
      )
      .returning({
        userId: userStorePermissionsTable.userId,
        storeId: userStorePermissionsTable.storeId,
        role: userStorePermissionsTable.role,
        isPrimaryResponsible: userStorePermissionsTable.isPrimaryResponsible,
        revokedAt: userStorePermissionsTable.revokedAt,
        revokedReason: userStorePermissionsTable.revokedReason,
      })

    const [updatedStore] = await tx
      .update(storesTable)
      .set({
        status: 'archived',
        statusReason: reason,
        statusUpdatedAt: now,
        updatedAt: now,
      })
      .where(and(eq(storesTable.id, storeId), ne(storesTable.status, 'archived')))
      .returning()

    if (!updatedStore) throw new Error('STORE_ALREADY_ARCHIVED')

    await tx.insert(internalOperationAuditLogsTable).values({
      action: 'archive_store',
      actorClerkId: operator.clerkId,
      actorEmail: operator.email,
      actorName: operator.name,
      storeId,
      targetUserEmail: null,
      previousStoreStatus: store.status,
      newStoreStatus: updatedStore.status,
      reason,
    })

    await tx.insert(administrativeAuditLogsTable).values(
      buildAdministrativeAuditLogInput({
        operator,
        storeId,
        scope: 'access',
        action: 'archive',
        entityType: 'store',
        entityId: storeId,
        reason,
        previousValues: {
          storeStatus: store.status,
          activePermissions: activePermissionsBeforeArchive.map(
            serializePermissionSnapshot
          ),
        },
        newValues: {
          storeStatus: updatedStore.status,
          revokedPermissions: revokedPermissions.map(serializePermissionSnapshot),
        },
        metadata: {
          source: 'internal_operations',
          legacyAuditAction: 'archive_store',
        },
      })
    )

    return updatedStore
  })
}
