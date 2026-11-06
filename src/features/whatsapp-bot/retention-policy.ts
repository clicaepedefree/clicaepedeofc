import {
  resolveWhatsappBotRolloutConfig,
  type WhatsappBotRolloutConfig,
} from './rollout-policy'

export type RetentionCounts = {
  expiredQrSessions: number
  deletedDeliveryAttempts: number
  deletedTransactionalEvents: number
  deletedMessages: number
  deletedConversations: number
  deletedContacts: number
  deletedAttributionAccesses: number
}

export const emptyRetentionCounts = (): RetentionCounts => ({
  expiredQrSessions: 0,
  deletedDeliveryAttempts: 0,
  deletedTransactionalEvents: 0,
  deletedMessages: 0,
  deletedConversations: 0,
  deletedContacts: 0,
  deletedAttributionAccesses: 0,
})

export function retentionScope(
  storeIds?: number[],
  rollout: WhatsappBotRolloutConfig = resolveWhatsappBotRolloutConfig()
) {
  if (
    storeIds !== undefined &&
    (!Array.isArray(storeIds) ||
      storeIds.some(
        id => !Number.isSafeInteger(id) || id <= 0 || id > 2147483647
      ))
  )
    throw new Error('Invalid retention scope')
  const requested =
    storeIds === undefined ? null : [...new Set(storeIds)].sort((a, b) => a - b)
  if (rollout.mode === 'off') return []
  if (rollout.mode === 'all') return requested
  return [...rollout.pilotStoreIds]
    .filter(id => requested === null || requested.includes(id))
    .sort((a, b) => a - b)
}

export function retentionUuid(value: string) {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value
    )
  )
    throw new Error('Invalid retention execution identifier')
  return value.toLowerCase()
}
