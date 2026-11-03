import 'server-only'
import { and, desc, eq, inArray } from 'drizzle-orm'
import { db } from '@/services/db'
import { decrypt } from '@/lib/encryption'
import { whatsappBotNumbersTable as numbers } from '@/services/db/schema/whatsapp-bot-numbers'
import { whatsappBotSessionsTable as sessions } from '@/services/db/schema/whatsapp-bot-sessions'
import {
  createEvolutionClient,
  type EvolutionClient,
} from '@/features/whatsapp-bot/evolution-client'
import { buildEvolutionInstanceName } from '@/features/whatsapp-bot/session-policy'

export type WalletOtpTransport = Pick<
  EvolutionClient,
  'getConnectionState' | 'sendTextMessage'
>

/** No bot mutation, assistant check, queue, reconnect, or automatic retry. */
export async function prepareWalletOtpSender(
  storeId: number,
  transport?: WalletOtpTransport
) {
  if (process.env.WALLET_AUTH_ENABLED === 'false')
    throw new Error('Wallet unavailable')
  const endpoint = new URL(process.env.WHATSAPP_EVOLUTION_API_BASE_URL || '')
  if (
    endpoint.protocol !== 'https:' ||
    endpoint.username ||
    endpoint.password ||
    !process.env.WHATSAPP_EVOLUTION_API_KEY?.trim()
  )
    throw new Error('Wallet unavailable')
  const [configured] = await db
    .select({ session: sessions, number: numbers })
    .from(sessions)
    .innerJoin(
      numbers,
      and(
        eq(numbers.id, sessions.numberId),
        eq(numbers.storeId, sessions.storeId)
      )
    )
    .where(
      and(
        eq(sessions.storeId, storeId),
        eq(sessions.provider, 'evolution'),
        eq(numbers.provider, 'evolution'),
        inArray(sessions.status, ['connected', 'paused'])
      )
    )
    .orderBy(desc(sessions.id))
    .limit(1)
  if (!configured) throw new Error('Wallet unavailable')
  const { session, number } = configured
  if (
    session.providerSessionId !==
    buildEvolutionInstanceName({ storeId, numberId: number.id })
  )
    throw new Error('Wallet unavailable')
  const ciphertext = (session.metadata as Record<string, unknown>)
    ?.instanceTokenCiphertext
  if (typeof ciphertext !== 'string' || !ciphertext)
    throw new Error('Wallet unavailable')
  const token = decrypt(ciphertext)
  if (!token.trim()) throw new Error('Wallet unavailable')
  const client = transport ?? createEvolutionClient()
  const connection = await client.getConnectionState({
    instanceName: session.providerSessionId,
    token,
  })
  if (
    connection.state !== 'open' ||
    (connection.instanceName &&
      connection.instanceName !== session.providerSessionId)
  )
    throw new Error('Wallet unavailable')
  return async (phone: string, code: string) => {
    const ack = await client.sendTextMessage({
      instanceName: session.providerSessionId,
      token,
      number: phone,
      text: `Seu codigo de acesso a carteira e ${code}. Valido por 5 minutos. Nao compartilhe este codigo.`,
    })
    return (
      typeof ack.providerMessageId === 'string' &&
      ack.providerMessageId.trim().length > 0
    )
  }
}
