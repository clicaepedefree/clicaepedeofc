'use server'

import { normalizeUserEmail } from '@/features/user/user-policy'
import { db } from '@/services/db'
import {
  internalOperationAuditLogsTable,
  storeAccessInvitesTable,
  storesTable,
  userStorePermissionsTable,
  usersTable,
} from '@/services/db/schema'
import { and, eq, gt, isNull, sql } from 'drizzle-orm'
import type { User as ClerkUser } from '@clerk/nextjs/server'
import {
  getStoreAccessInviteSecret,
  hashStoreAccessInviteToken,
  isStoreAccessInviteToken,
  validateStoreAccessInviteState,
} from './invite-policy'

export type StoreAccessInvitePreview =
  | {
      status: 'valid'
      storeName: string
      targetEmail: string
      expiresAt: Date
    }
  | { status: 'invalid' | 'expired' | 'used' | 'revoked' | 'malformed' }

const getPrimaryEmail = (clerkUser: ClerkUser) => {
  const primaryEmailAddress = clerkUser.emailAddresses.find(
    emailAddress => emailAddress.id === clerkUser.primaryEmailAddressId
  )

  return primaryEmailAddress?.emailAddress
    ? normalizeUserEmail(primaryEmailAddress.emailAddress)
    : null
}

const isPrimaryEmailVerified = (clerkUser: ClerkUser) => {
  const primaryEmailAddress = clerkUser.emailAddresses.find(
    emailAddress => emailAddress.id === clerkUser.primaryEmailAddressId
  )

  return primaryEmailAddress?.verification?.status === 'verified'
}

export async function getStoreAccessInvitePreview(
  token: string
): Promise<StoreAccessInvitePreview> {
  if (!isStoreAccessInviteToken(token)) return { status: 'malformed' }

  const tokenHash = hashStoreAccessInviteToken(
    token,
    getStoreAccessInviteSecret()
  )
  const [invite] = await db
    .select({
      status: storeAccessInvitesTable.status,
      expiresAt: storeAccessInvitesTable.expiresAt,
      usedAt: storeAccessInvitesTable.usedAt,
      revokedAt: storeAccessInvitesTable.revokedAt,
      targetEmail: storeAccessInvitesTable.targetEmail,
      storeName: storesTable.name,
    })
    .from(storeAccessInvitesTable)
    .innerJoin(storesTable, eq(storesTable.id, storeAccessInvitesTable.storeId))
    .where(eq(storeAccessInvitesTable.tokenHash, tokenHash))
    .limit(1)

  if (!invite) return { status: 'invalid' }

  const validation = validateStoreAccessInviteState(invite)
  if (!validation.valid) return { status: validation.reason }

  return {
    status: 'valid',
    storeName: invite.storeName,
    targetEmail: invite.targetEmail,
    expiresAt: invite.expiresAt,
  }
}

export async function acceptStoreAccessInvite({
  token,
  clerkUser,
}: {
  token: string
  clerkUser: ClerkUser
}) {
  if (!isStoreAccessInviteToken(token)) {
    throw new Error('INVITE_MALFORMED')
  }

  const primaryEmail = getPrimaryEmail(clerkUser)
  if (!primaryEmail) throw new Error('INVITE_EMAIL_REQUIRED')
  if (!isPrimaryEmailVerified(clerkUser)) {
    throw new Error('INVITE_EMAIL_NOT_VERIFIED')
  }

  const tokenHash = hashStoreAccessInviteToken(
    token,
    getStoreAccessInviteSecret()
  )
  const now = new Date()

  return await db.transaction(async tx => {
    const [invite] = await tx
      .select()
      .from(storeAccessInvitesTable)
      .where(eq(storeAccessInvitesTable.tokenHash, tokenHash))
      .limit(1)

    if (!invite) throw new Error('INVITE_NOT_FOUND')

    const validation = validateStoreAccessInviteState(invite, now)
    if (!validation.valid) {
      throw new Error(`INVITE_${validation.reason.toUpperCase()}`)
    }

    const invitedEmail = normalizeUserEmail(invite.targetEmail)
    if (invitedEmail !== primaryEmail) {
      throw new Error('INVITE_EMAIL_MISMATCH')
    }

    const [targetUser] = invite.targetUserId
      ? await tx
          .select()
          .from(usersTable)
          .where(eq(usersTable.id, invite.targetUserId))
          .limit(1)
      : await tx
          .select()
          .from(usersTable)
          .where(
            and(
              eq(usersTable.status, 'active'),
              sql`lower(${usersTable.email}) = ${invitedEmail}`
            )
          )
          .limit(1)

    if (!targetUser) throw new Error('INVITE_TARGET_USER_NOT_FOUND')
    if (normalizeUserEmail(targetUser.email) !== invitedEmail) {
      throw new Error('INVITE_TARGET_EMAIL_MISMATCH')
    }
    if (targetUser.clerkId && targetUser.clerkId !== clerkUser.id) {
      throw new Error('INVITE_USER_ALREADY_LINKED')
    }

    const [consumedInvite] = await tx
      .update(storeAccessInvitesTable)
      .set({
        status: 'used',
        usedAt: now,
        acceptedByClerkId: clerkUser.id,
        acceptedByEmail: primaryEmail,
        updatedAt: now,
      })
      .where(
        and(
          eq(storeAccessInvitesTable.id, invite.id),
          eq(storeAccessInvitesTable.status, 'pending'),
          isNull(storeAccessInvitesTable.usedAt),
          isNull(storeAccessInvitesTable.revokedAt),
          gt(storeAccessInvitesTable.expiresAt, now)
        )
      )
      .returning()

    if (!consumedInvite) throw new Error('INVITE_NOT_AVAILABLE')

    const [linkedUser] = await tx
      .update(usersTable)
      .set({
        clerkId: clerkUser.id,
        email: primaryEmail,
        name: clerkUser.fullName ?? targetUser.name,
        status: 'active',
        deletedAt: null,
        lastLoginAt: now,
        updatedAt: now,
      })
      .where(eq(usersTable.id, targetUser.id))
      .returning()

    await tx
      .insert(userStorePermissionsTable)
      .values({
        userId: linkedUser.id,
        storeId: invite.storeId,
        role: invite.role,
        isPrimaryResponsible: false,
        assignedPrimaryAt: null,
        revokedAt: null,
        revokedReason: null,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [
          userStorePermissionsTable.userId,
          userStorePermissionsTable.storeId,
        ],
        set: {
          role: sql`case
            when ${userStorePermissionsTable.revokedAt} is null then ${userStorePermissionsTable.role}
            else ${invite.role}
          end`,
          isPrimaryResponsible: sql`case
            when ${userStorePermissionsTable.revokedAt} is null then ${userStorePermissionsTable.isPrimaryResponsible}
            else false
          end`,
          assignedPrimaryAt: sql`case
            when ${userStorePermissionsTable.revokedAt} is null then ${userStorePermissionsTable.assignedPrimaryAt}
            else null
          end`,
          revokedAt: null,
          revokedReason: null,
          updatedAt: now,
        },
      })

    await tx.insert(internalOperationAuditLogsTable).values({
      action: 'accept_store_access_invite',
      actorClerkId: clerkUser.id,
      actorEmail: primaryEmail,
      actorName: clerkUser.fullName,
      storeId: invite.storeId,
      targetUserId: linkedUser.id,
      targetUserEmail: primaryEmail,
      previousStoreStatus: 'invite_pending',
      newStoreStatus: 'invite_accepted',
      reason: 'Responsavel aceitou convite seguro e definiu acesso pelo Clerk.',
    })

    return { storeId: invite.storeId, userId: linkedUser.id }
  })
}
