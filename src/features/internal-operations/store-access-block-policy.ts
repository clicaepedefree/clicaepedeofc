import { z } from 'zod'

export type StoreAccessBlockSnapshot = {
  id: number | null
  unblockedAt: Date | null
  scheduledUnblockAt: Date | null
}

export const storeAccessBlockActionSchema = z.object({
  storeId: z.coerce.number().int().positive(),
  reason: z.string().trim().min(8).max(500),
  notifyStoreOwner: z.coerce.boolean().default(false),
  notificationNote: z.string().trim().max(500).optional().default(''),
  scheduledUnblockAt: z
    .string()
    .trim()
    .optional()
    .default('')
    .transform(value => (value ? new Date(value) : null))
    .refine(value => value === null || !Number.isNaN(value.getTime()), {
      message: 'Data de desbloqueio invalida.',
    }),
})

export const storeAccessUnblockActionSchema = z.object({
  storeId: z.coerce.number().int().positive(),
  reason: z.string().trim().min(8).max(500),
})

export type StoreAccessBlockActionValues = z.infer<
  typeof storeAccessBlockActionSchema
>

export type StoreAccessUnblockActionValues = z.infer<
  typeof storeAccessUnblockActionSchema
>

export function isStoreAccessBlockActive(
  block: StoreAccessBlockSnapshot | null,
  now = new Date()
) {
  if (!block?.id) return false
  if (block.unblockedAt) return false
  if (block.scheduledUnblockAt && block.scheduledUnblockAt <= now) {
    return false
  }

  return true
}

export function validateStoreAccessBlockSchedule({
  scheduledUnblockAt,
  now = new Date(),
}: {
  scheduledUnblockAt: Date | null
  now?: Date
}) {
  if (!scheduledUnblockAt) return null

  if (scheduledUnblockAt <= now) {
    return 'STORE_ACCESS_BLOCK_SCHEDULE_IN_PAST'
  }

  return null
}
