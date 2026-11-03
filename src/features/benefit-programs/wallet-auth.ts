import 'server-only'
import { cookies } from 'next/headers'
import { db } from '@/services/db'
import type { DbTransaction } from '@/services/db/types'
import { readWalletIdentity } from './wallet-auth-db'
import {
  validWalletToken,
  walletBindingCookie,
  walletCookie,
  walletHash,
  walletPhone,
} from './wallet-auth-policy'

export type WalletIdentity = { storeId: number; phone: string }

/** Server-only authority. A supplied phone is an expectation, never proof.
 * Checkout MUST call inside its transaction, before replay and debit. */
export async function requireWalletIdentity(
  storeId: number,
  phone: string,
  tx?: DbTransaction
): Promise<WalletIdentity> {
  const canonical = walletPhone(phone)
  const jar = await cookies()
  const token = jar.get(walletCookie(storeId))?.value
  const binding = jar.get(walletBindingCookie)?.value
  if (
    !Number.isSafeInteger(storeId) ||
    storeId <= 0 ||
    !canonical ||
    !validWalletToken(token) ||
    !validWalletToken(binding)
  )
    throw new Error('WALLET_AUTH_REQUIRED')
  const authorize = (session: DbTransaction) =>
    readWalletIdentity(
      session,
      storeId,
      canonical,
      walletHash(token),
      walletHash(binding)
    )
  return tx ? authorize(tx) : db.transaction(authorize)
}
