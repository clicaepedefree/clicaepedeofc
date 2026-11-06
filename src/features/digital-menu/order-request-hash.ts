import { createHash } from 'node:crypto'

const hash = (value: unknown) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex')

// Optional analytics may arrive late or expire; it is not commercial order identity.
export const createPublicOrderRequestHash = (input: Record<string, unknown>) =>
  hash({ ...input, attribution: null })

const legacyAttribution = (value: unknown) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const a = value as Record<string, unknown>
  // JSONB reorders keys; restore the historical normalizer's serialization order.
  return {
    source: a.source, medium: a.medium, campaign: a.campaign,
    conversationId: a.conversationId,
    ...(a.messageId ? { messageId: a.messageId } : {}),
    ...(a.visitId ? { visitId: a.visitId } : {}),
    ...(a.entryUrl ? { entryUrl: a.entryUrl } : {}),
  }
}

export const matchesPublicOrderRequestHash = ({
  input,
  existingHash,
  existingAttribution,
}: {
  input: Record<string, unknown>
  existingHash: string
  existingAttribution?: unknown
}) =>
  existingHash === createPublicOrderRequestHash(input) ||
  existingHash === hash({ ...input, attribution: legacyAttribution(existingAttribution) })
