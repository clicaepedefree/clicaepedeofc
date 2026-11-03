import 'server-only'
import { and, eq, gt, isNull, sql } from 'drizzle-orm'
import { db } from '@/services/db'
import type { DbTransaction } from '@/services/db/types'
import {
  walletAuthChallengesTable as challenges,
  walletAuthSessionsTable as sessions,
  walletAuthRatesTable as rates,
} from '@/services/db/schema/wallet-auth'
import {
  walletCodeHash,
  walletEqual,
  walletHash,
  walletPolicy,
} from './wallet-auth-policy'

export async function walletDbNow(tx: DbTransaction) {
  const rows = await tx.execute(sql`select clock_timestamp() as instant`)
  return new Date(rows[0].instant as string | Date)
}

export type WalletRate = {
  key: string
  seconds: number
  max: number
  cooldown?: number
}

/** All buckets are locked in stable order, including absent first-use rows.
 * Rejected calls still consume global budgets: no rollback-based rate bypass. */
export async function consumeWalletRates(
  tx: DbTransaction,
  buckets: WalletRate[]
) {
  const ordered = [...buckets].sort((a, b) => a.key.localeCompare(b.key))
  for (const bucket of ordered)
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${`wallet-rate:${bucket.key}`}, 0))`
    )
  const now = await walletDbNow(tx)
  let allowed = true
  for (const bucket of ordered) {
    const [row] = await tx
      .select()
      .from(rates)
      .where(eq(rates.key, bucket.key))
      .for('update')
    const reset =
      !row || now.getTime() - row.windowStart.getTime() >= bucket.seconds * 1000
    const count = reset ? 0 : row.count
    if (
      count >= bucket.max ||
      (row &&
        bucket.cooldown &&
        now.getTime() - row.lastAt.getTime() < bucket.cooldown * 1000)
    )
      allowed = false
    await tx
      .insert(rates)
      .values({
        key: bucket.key,
        count: Math.min(count + 1, bucket.max + 1),
        windowStart: reset ? now : row.windowStart,
        lastAt: now,
      })
      .onConflictDoUpdate({
        target: rates.key,
        set: {
          count: Math.min(count + 1, bucket.max + 1),
          windowStart: reset ? now : row.windowStart,
          lastAt: now,
        },
      })
    // Global buckets sort first. Do not allocate attacker-controlled secondary
    // keys after an earlier budget rejects; the rejection still commits counts.
    if (!allowed) return false
  }
  return allowed
}

/** Bounded opportunistic retention; never removes an active budget or token.
 * SKIP LOCKED avoids waiting on checkout, verification, or another cleanup. */
export async function purgeExpiredWalletAuth(tx: DbTransaction) {
  await tx.execute(sql`delete from wallet_auth_challenges where id_hash in (
    select id_hash from wallet_auth_challenges
    where expires_at < clock_timestamp() - interval '1 day'
    order by expires_at limit 100 for update skip locked
  )`)
  await tx.execute(sql`delete from wallet_auth_sessions where token_hash in (
    select token_hash from wallet_auth_sessions
    where expires_at < clock_timestamp() - interval '1 day'
    order by expires_at limit 100 for update skip locked
  )`)
  await tx.execute(sql`delete from wallet_auth_rates where key in (
    select key from wallet_auth_rates
    where last_at < clock_timestamp() - interval '2 days'
    order by last_at limit 100 for update skip locked
  )`)
}

export async function supersedeWalletChallenges(tx: DbTransaction, storeId: number, phone: string, bindingHash: string) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`wallet-challenge:${storeId}:${phone}:${bindingHash}`}, 0))`)
  await tx.update(challenges).set({ status: 'locked' }).where(and(
    eq(challenges.storeId, storeId), eq(challenges.phone, phone), eq(challenges.bindingHash, bindingHash),
    sql`${challenges.status} in ('pending', 'sent', 'unknown')`
  ))
}

export async function markWalletDelivery(
  idHash: string,
  acknowledged: boolean
) {
  const rows = await db
    .update(challenges)
    .set({ status: acknowledged ? 'sent' : 'unknown' })
    .where(
      and(
        eq(challenges.idHash, idHash),
        eq(challenges.status, 'pending'),
        gt(challenges.expiresAt, sql`clock_timestamp()`)
      )
    )
    .returning({ idHash: challenges.idHash })
  return rows.length === 1
}

export async function verifyWalletChallenge(
  tx: DbTransaction,
  input: {
    challengeId: string
    storeId: number
    phone: string
    bindingHash: string
    code: string
    secret: string
    sessionHash: string
  }
) {
  const [row] = await tx
    .select()
    .from(challenges)
    .where(eq(challenges.idHash, walletHash(input.challengeId)))
    .for('update')
  const now = await walletDbNow(tx)
  if (
    !row ||
    row.storeId !== input.storeId ||
    row.phone !== input.phone ||
    row.bindingHash !== input.bindingHash ||
    row.status !== 'sent' ||
    row.attempts >= walletPolicy.maxAttempts ||
    row.expiresAt <= now
  )
    return false
  const attempts = row.attempts + 1
  const correct =
    /^\d{6}$/.test(input.code) &&
    walletEqual(
      row.codeHash,
      walletCodeHash(
        input.secret,
        input.challengeId,
        input.storeId,
        input.phone,
        input.bindingHash,
        input.code
      )
    )
  await tx
    .update(challenges)
    .set({
      attempts,
      status: correct
        ? 'consumed'
        : attempts >= walletPolicy.maxAttempts
          ? 'locked'
          : 'sent',
    })
    .where(eq(challenges.idHash, row.idHash))
  if (!correct) return false
  // Re-authentication rotates every session for this store/phone/browser.
  await tx
    .update(sessions)
    .set({ revokedAt: now })
    .where(
      and(
        eq(sessions.storeId, input.storeId),
        eq(sessions.phone, input.phone),
        eq(sessions.bindingHash, input.bindingHash),
        isNull(sessions.revokedAt)
      )
    )
  await tx
    .insert(sessions)
    .values({
      tokenHash: input.sessionHash,
      storeId: input.storeId,
      phone: input.phone,
      bindingHash: input.bindingHash,
      createdAt: now,
      expiresAt: new Date(now.getTime() + walletPolicy.sessionSeconds * 1000),
    })
  return true
}

export async function readWalletIdentity(
  tx: DbTransaction,
  storeId: number,
  phone: string,
  tokenHash: string,
  bindingHash: string
) {
  // Hold the session row through checkout commit; logout serializes against use.
  const [row] = await tx
    .select()
    .from(sessions)
    .where(
      and(
        eq(sessions.tokenHash, tokenHash),
        eq(sessions.storeId, storeId),
        eq(sessions.phone, phone),
        eq(sessions.bindingHash, bindingHash),
        isNull(sessions.revokedAt),
        gt(sessions.expiresAt, sql`clock_timestamp()`)
      )
    )
    .for('update')
  if (!row || row.expiresAt <= (await walletDbNow(tx)))
    throw new Error('WALLET_AUTH_REQUIRED')
  return { storeId: row.storeId, phone: row.phone }
}
