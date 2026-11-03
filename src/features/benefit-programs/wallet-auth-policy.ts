import 'server-only'
import {
  createHash,
  createHmac,
  randomBytes,
  randomInt,
  timingSafeEqual,
} from 'node:crypto'
import { normalizeBenefitPhone } from './ledger-policy'

export const walletPolicy = {
  challengeSeconds: 300,
  sessionSeconds: 900,
  cooldownSeconds: 60,
  maxAttempts: 5,
} as const

export const walletCookie = (storeId: number) => `__Host-wallet-${storeId}`
export const walletBindingCookie = '__Host-wallet-browser'
export const walletCookieOptions = {
  httpOnly: true,
  secure: true,
  sameSite: 'strict' as const,
  path: '/',
}
export const newWalletToken = () => randomBytes(32).toString('hex')
export const validWalletToken = (value: unknown): value is string =>
  typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)
export const walletHash = (value: string) =>
  createHash('sha256').update(value).digest('hex')
export const newWalletCode = () =>
  randomInt(0, 1_000_000).toString().padStart(6, '0')

export function walletSecret() {
  const key = process.env.WALLET_AUTH_HMAC_KEY
  if (!key || !/^[a-fA-F0-9]{64,}$/.test(key))
    throw new Error('Wallet unavailable')
  return key
}

export function walletCodeHash(
  secret: string,
  challenge: string,
  storeId: number,
  phone: string,
  binding: string,
  code: string
) {
  return createHmac('sha256', secret)
    .update(
      JSON.stringify([
        'wallet-otp-v1',
        challenge,
        storeId,
        phone,
        binding,
        code,
      ])
    )
    .digest('hex')
}

export function walletPrivateKey(secret: string, value: string) {
  return createHmac('sha256', secret).update(value).digest('hex')
}

export function walletEqual(a: string, b: string) {
  return (
    /^[a-f0-9]{64}$/.test(a) &&
    /^[a-f0-9]{64}$/.test(b) &&
    timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'))
  )
}

export function walletPhone(value: unknown) {
  return typeof value === 'string' && value.length <= 40
    ? normalizeBenefitPhone(value)
    : null
}

export function walletSlug(value: unknown) {
  return typeof value === 'string' && /^[a-z0-9][a-z0-9-]{0,62}$/.test(value)
    ? value
    : null
}

export function assertWalletOrigin(
  origin: string | null,
  host: string | null,
  fetchSite: string | null
) {
  if (!origin || !host || (fetchSite && fetchSite !== 'same-origin'))
    throw new Error('Wallet unavailable')
  const url = new URL(origin)
  if (url.protocol !== 'https:' || url.host !== host || url.origin !== origin)
    throw new Error('Wallet unavailable')
}
