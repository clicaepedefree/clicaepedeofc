'use server'

import 'server-only'
import { cookies, headers } from 'next/headers'
import { and, eq, isNull } from 'drizzle-orm'
import { db } from '@/services/db'
import { storesTable } from '@/services/db/schema/stores'
import {
  walletAuthChallengesTable as challenges,
  walletAuthSessionsTable as sessions,
} from '@/services/db/schema/wallet-auth'
import { getBenefitAccountSummary } from './ledger'
import { listAvailableProductRewards } from './product-rewards'
import type { ProductRewardState } from './product-rewards-policy'
import { requireWalletIdentity } from './wallet-auth'
import {
  consumeWalletRates,
  markWalletDelivery,
  verifyWalletChallenge,
  walletDbNow,
  purgeExpiredWalletAuth,
  supersedeWalletChallenges,
} from './wallet-auth-db'
import { prepareWalletOtpSender } from './wallet-auth-provider'
import {
  assertWalletOrigin,
  newWalletCode,
  newWalletToken,
  validWalletToken,
  walletBindingCookie,
  walletCodeHash,
  walletCookie,
  walletCookieOptions,
  walletHash,
  walletPhone,
  walletPolicy,
  walletPrivateKey,
  walletSecret,
  walletSlug,
} from './wallet-auth-policy'

type Failure = { ok: false; message: string; retryAfterSeconds?: number }
type Input = { storeSlug: string; phone: string }
export type WalletProductReward = {
  id: string
  productName: string
  voucherCode: string
  expiresAt: string
  state: ProductRewardState
  isAvailable: boolean
  unavailableReason?: string
}
const failure = (): Failure => ({
  ok: false,
  message:
    'Nao foi possivel concluir. Solicite um novo codigo ou tente mais tarde.',
})
const accepted = (challengeId: string) => ({ ok: true as const, challengeId })

async function context() {
  const request = await headers()
  assertWalletOrigin(
    request.get('origin'),
    request.get('host'),
    request.get('sec-fetch-site')
  )
  const secret = walletSecret()
  if (process.env.DRIZZLE_DEBUG === 'true')
    throw new Error('Wallet unavailable')
  // Vercel overwrites this header. Other hosts share a conservative bucket until
  // a trusted ingress adapter is configured; never trust arbitrary X-Forwarded-For.
  const ip =
    process.env.VERCEL === '1'
      ? request.get('x-vercel-forwarded-for')?.split(',')[0]?.trim() ||
        'unknown'
      : 'unknown'
  return { secret, ip: walletPrivateKey(secret, `ip:${ip}`) }
}

async function storeFor(slug: string) {
  const [store] = await db
    .select({ id: storesTable.id })
    .from(storesTable)
    .where(
      and(eq(storesTable.subdomain, slug), eq(storesTable.status, 'active'))
    )
    .limit(1)
  return store
}

export async function requestWalletCode(
  input: Input
): Promise<{ ok: true; challengeId: string } | Failure> {
  try {
    const { secret, ip } = await context()
    const slug = walletSlug(input?.storeSlug)
    const phone = walletPhone(input?.phone)
    const challengeId = newWalletToken()
    // Budgets precede store/account lookup, including invalid/nonexistent stores.
    const permitted = await db.transaction(async tx => {
      const result = await consumeWalletRates(tx, [
        { key: 'request:global', seconds: 3600, max: 2000 },
        { key: `request:ip:${ip}`, seconds: 3600, max: 20 },
        {
          key: `request:store:${walletPrivateKey(secret, String(slug))}`,
          seconds: 86400,
          max: 200,
        },
        {
          key: `request:store-ip:${walletPrivateKey(secret, `${slug}:${ip}`)}`,
          seconds: 3600,
          max: 10,
        },
        {
          key: `request:phone:${walletPrivateKey(secret, String(phone))}`,
          seconds: 3600,
          max: 5,
          cooldown: walletPolicy.cooldownSeconds,
        },
      ])
      await purgeExpiredWalletAuth(tx)
      return result
    })
    // Same shape for invalid phone, absent store, rate limit, offline provider,
    // unknown delivery and existing/nonexisting benefit accounts. No account lookup.
    if (!permitted || !slug || !phone) return accepted(challengeId)
    const store = await storeFor(slug)
    if (!store) return accepted(challengeId)
    const jar = await cookies()
    const previous = jar.get(walletBindingCookie)?.value
    const binding = validWalletToken(previous) ? previous : newWalletToken()
    jar.set(walletBindingCookie, binding, {
      ...walletCookieOptions,
      maxAge: walletPolicy.sessionSeconds + walletPolicy.challengeSeconds,
    })
    const bindingHash = walletHash(binding)
    const code = newWalletCode()
    const idHash = walletHash(challengeId)
    // Persist BEFORE even the provider connection probe. No network inside tx.
    await db.transaction(async tx => {
      await supersedeWalletChallenges(tx, store.id, phone, bindingHash)
      const now = await walletDbNow(tx)
      await tx.insert(challenges).values({
        idHash,
        storeId: store.id,
        phone,
        bindingHash,
        codeHash: walletCodeHash(
          secret,
          challengeId,
          store.id,
          phone,
          bindingHash,
          code
        ),
        createdAt: now,
        expiresAt: new Date(
          now.getTime() + walletPolicy.challengeSeconds * 1000
        ),
      })
    })
    try {
      const send = await prepareWalletOtpSender(store.id)
      const acknowledged = await send(phone, code)
      await markWalletDelivery(idHash, acknowledged)
    } catch {
      // Do not persist/log provider exceptions, raw payloads or message bodies.
      // A timeout can mean delivered: keep unusable and NEVER retry this code.
      await markWalletDelivery(idHash, false)
    }
    return accepted(challengeId)
  } catch {
    return failure()
  }
}

export async function verifyWalletCode(
  input: Input & { challengeId: string; code: string }
): Promise<{ ok: true } | Failure> {
  try {
    const { secret, ip } = await context()
    const allowed = await db.transaction(tx =>
      consumeWalletRates(tx, [
        { key: 'verify:global', seconds: 3600, max: 10000 },
        { key: `verify:ip:${ip}`, seconds: 3600, max: 100 },
      ])
    )
    const slug = walletSlug(input?.storeSlug)
    const phone = walletPhone(input?.phone)
    if (!allowed || !slug || !phone || !validWalletToken(input?.challengeId))
      return failure()
    const store = await storeFor(slug)
    const jar = await cookies()
    const binding = jar.get(walletBindingCookie)?.value
    if (!store || !validWalletToken(binding)) return failure()
    const token = newWalletToken()
    const verified = await db.transaction(tx =>
      verifyWalletChallenge(tx, {
        challengeId: input.challengeId,
        storeId: store.id,
        phone,
        bindingHash: walletHash(binding),
        code:
          typeof input.code === 'string' && input.code.length <= 6
            ? input.code
            : '',
        secret,
        sessionHash: walletHash(token),
      })
    )
    if (!verified) return failure()
    jar.set(walletCookie(store.id), token, {
      ...walletCookieOptions,
      maxAge: walletPolicy.sessionSeconds,
    })
    jar.set(walletBindingCookie, binding, {
      ...walletCookieOptions,
      maxAge: walletPolicy.sessionSeconds + walletPolicy.challengeSeconds,
    })
    return { ok: true }
  } catch {
    return failure()
  }
}

export async function getWalletBalance(
  input: Input
): Promise<
  | {
      ok: true
      availableAmount: string
      pendingAmount: string
      productRewards: WalletProductReward[]
    }
  | Failure
> {
  try {
    await context()
    const slug = walletSlug(input?.storeSlug)
    const phone = walletPhone(input?.phone)
    if (!slug || !phone) return failure()
    const store = await storeFor(slug)
    if (!store) return failure()
    return await db.transaction(async tx => {
      const identity = await requireWalletIdentity(store.id, phone, tx)
      const balance = await getBenefitAccountSummary(
        identity.storeId,
        identity.phone,
        tx
      )
      const rewards = await listAvailableProductRewards(
        identity.storeId,
        identity.phone,
        tx
      )
      const unavailableMessages = {
        deleted:
          'Produto retirado do catalogo. Seu direito foi preservado; fale com a loja.',
        out_of_stock: 'Produto sem estoque. Seu direito foi preservado.',
        unavailable:
          'Produto indisponivel para resgate sem adicionais. Fale com a loja.',
      }
      return {
        ok: true as const,
        availableAmount: balance.availableAmount,
        pendingAmount: balance.pendingAmount,
        productRewards: rewards.map(reward => ({
          id: reward.rewardId,
          productName: reward.itemName,
          voucherCode: reward.voucherCode,
          expiresAt: reward.expiresAt?.toISOString() ?? '',
          state: reward.state,
          isAvailable: reward.canReserve,
          ...(reward.availability !== 'available'
            ? { unavailableReason: unavailableMessages[reward.availability] }
            : {}),
        })),
      }
    })
  } catch {
    return failure()
  }
}

export async function clearWalletSession(input: {
  storeSlug: string
}): Promise<{ ok: true } | Failure> {
  try {
    await context()
    const slug = walletSlug(input?.storeSlug)
    if (!slug) return failure()
    const store = await storeFor(slug)
    if (!store) return { ok: true }
    const jar = await cookies()
    const binding = jar.get(walletBindingCookie)?.value
    if (validWalletToken(binding)) {
      await db.transaction(async tx => {
        const now = await walletDbNow(tx)
        // Invalidate pending challenges too: a pre-logout code cannot log in again.
        await tx
          .update(challenges)
          .set({ status: 'locked' })
          .where(
            and(
              eq(challenges.storeId, store.id),
              eq(challenges.bindingHash, walletHash(binding))
            )
          )
        // Revoke all sessions for this browser/store, including a parallel
        // verification that rotated the token while logout was waiting.
        await tx
          .update(sessions)
          .set({ revokedAt: now })
          .where(
            and(
              eq(sessions.storeId, store.id),
              eq(sessions.bindingHash, walletHash(binding)),
              isNull(sessions.revokedAt)
            )
          )
      })
    }
    jar.set(walletCookie(store.id), '', { ...walletCookieOptions, maxAge: 0 })
    return { ok: true }
  } catch {
    return failure()
  }
}
