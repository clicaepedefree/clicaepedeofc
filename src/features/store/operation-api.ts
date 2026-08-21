'use server'

import { validateUserPermissionsForStore } from '@/features/store/api'
import { db } from '@/services/db'
import {
  storeFilesTable,
  storesTable,
  storeBusinessHoursTable,
  storeDigitalMenuSettingsTable,
  storeSpecialHoursTable,
} from '@/services/db/schema'
import { and, asc, eq } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { z } from 'zod'

const timeSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Horario invalido.')

const serviceTypeSchema = z.enum(['ALL', 'DELIVERY', 'TAKEOUT'])

const operationSettingsSchema = z.object({
  isDigitalMenuEnabled: z.boolean(),
  isAcceptingOrders: z.boolean(),
  operationalStatus: z.enum([
    'OPEN',
    'CLOSED',
    'PAUSED',
    'TAKEOUT_ONLY',
    'DELIVERY_ONLY',
  ]),
  operationalStatusMessage: z.string().max(180).optional().nullable(),
  allowScheduledOrders: z.boolean(),
  scheduleMinLeadMinutes: z.coerce.number().int().min(0).max(10080),
  scheduleMaxDaysAhead: z.coerce.number().int().min(0).max(90),
  allowItemObservations: z.boolean(),
})

const publicProfileSchema = z.object({
  storeName: z.string().trim().min(2).max(120),
  whatsappPhone: z
    .string()
    .trim()
    .max(30)
    .optional()
    .nullable()
    .refine(value => !value || value.replace(/\D/g, '').length >= 10, {
      message: 'Informe um WhatsApp valido com DDD.',
    }),
  logoFileId: z.number().int().positive().optional().nullable(),
  bannerFileId: z.number().int().positive().optional().nullable(),
})

const businessHourSchema = z
  .object({
    id: z.number().int().positive().optional(),
    weekday: z.coerce.number().int().min(0).max(6),
    opensAt: timeSchema,
    closesAt: timeSchema,
    serviceType: serviceTypeSchema,
    isActive: z.boolean(),
  })
  .refine(value => value.opensAt < value.closesAt, {
    path: ['closesAt'],
    message: 'O fechamento precisa ser depois da abertura.',
  })

const specialHourSchema = z
  .object({
    id: z.number().int().positive().optional(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data invalida.'),
    reason: z.string().max(160).optional().nullable(),
    isClosed: z.boolean(),
    opensAt: timeSchema.optional().nullable(),
    closesAt: timeSchema.optional().nullable(),
    serviceType: serviceTypeSchema,
  })
  .superRefine((value, ctx) => {
    if (value.isClosed) return
    if (!value.opensAt || !value.closesAt) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['opensAt'],
        message: 'Informe abertura e fechamento.',
      })
      return
    }
    if (value.opensAt >= value.closesAt) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['closesAt'],
        message: 'O fechamento precisa ser depois da abertura.',
      })
    }
  })

export type StoreOperationSettingsInput = z.input<typeof operationSettingsSchema>
export type StorePublicProfileInput = z.input<typeof publicProfileSchema>
export type StoreBusinessHourInput = z.input<typeof businessHourSchema>
export type StoreSpecialHourInput = z.input<typeof specialHourSchema>

export const getStoreOperationConfiguration = async (storeId: number) => {
  await validateUserPermissionsForStore(storeId, 'store.settings.manage')
  const logoFilesTable = alias(storeFilesTable, 'digitalMenuLogoFiles')
  const bannerFilesTable = alias(storeFilesTable, 'digitalMenuBannerFiles')

  const [settings] = await db
    .select({
      storeName: storesTable.name,
      whatsappPhone: storeDigitalMenuSettingsTable.whatsappPhone,
      logoFileId: storeDigitalMenuSettingsTable.logoFileId,
      bannerFileId: storeDigitalMenuSettingsTable.bannerFileId,
      logoUrl: logoFilesTable.url,
      bannerUrl: bannerFilesTable.url,
      isDigitalMenuEnabled: storeDigitalMenuSettingsTable.isDigitalMenuEnabled,
      isAcceptingOrders: storeDigitalMenuSettingsTable.isAcceptingOrders,
      operationalStatus: storeDigitalMenuSettingsTable.operationalStatus,
      operationalStatusMessage:
        storeDigitalMenuSettingsTable.operationalStatusMessage,
      manualPauseReason: storeDigitalMenuSettingsTable.manualPauseReason,
      allowScheduledOrders: storeDigitalMenuSettingsTable.allowScheduledOrders,
      scheduleMinLeadMinutes:
        storeDigitalMenuSettingsTable.scheduleMinLeadMinutes,
      scheduleMaxDaysAhead: storeDigitalMenuSettingsTable.scheduleMaxDaysAhead,
      allowItemObservations: storeDigitalMenuSettingsTable.allowItemObservations,
    })
    .from(storeDigitalMenuSettingsTable)
    .innerJoin(storesTable, eq(storesTable.id, storeDigitalMenuSettingsTable.storeId))
    .leftJoin(
      logoFilesTable,
      and(
        eq(logoFilesTable.id, storeDigitalMenuSettingsTable.logoFileId),
        eq(logoFilesTable.storeId, storeDigitalMenuSettingsTable.storeId)
      )
    )
    .leftJoin(
      bannerFilesTable,
      and(
        eq(bannerFilesTable.id, storeDigitalMenuSettingsTable.bannerFileId),
        eq(bannerFilesTable.storeId, storeDigitalMenuSettingsTable.storeId)
      )
    )
    .where(eq(storeDigitalMenuSettingsTable.storeId, storeId))
    .limit(1)

  const [store] = settings
    ? [null]
    : await db
        .select({ storeName: storesTable.name })
        .from(storesTable)
        .where(eq(storesTable.id, storeId))
        .limit(1)

  const businessHours = await db
    .select({
      id: storeBusinessHoursTable.id,
      weekday: storeBusinessHoursTable.weekday,
      opensAt: storeBusinessHoursTable.opensAt,
      closesAt: storeBusinessHoursTable.closesAt,
      serviceType: storeBusinessHoursTable.serviceType,
      isActive: storeBusinessHoursTable.isActive,
    })
    .from(storeBusinessHoursTable)
    .where(eq(storeBusinessHoursTable.storeId, storeId))
    .orderBy(asc(storeBusinessHoursTable.weekday), asc(storeBusinessHoursTable.opensAt))

  const specialHours = await db
    .select({
      id: storeSpecialHoursTable.id,
      date: storeSpecialHoursTable.date,
      reason: storeSpecialHoursTable.reason,
      isClosed: storeSpecialHoursTable.isClosed,
      opensAt: storeSpecialHoursTable.opensAt,
      closesAt: storeSpecialHoursTable.closesAt,
      serviceType: storeSpecialHoursTable.serviceType,
    })
    .from(storeSpecialHoursTable)
    .where(eq(storeSpecialHoursTable.storeId, storeId))
    .orderBy(asc(storeSpecialHoursTable.date), asc(storeSpecialHoursTable.opensAt))

  return {
    settings: settings ?? {
      storeName: store?.storeName ?? '',
      whatsappPhone: null,
      logoFileId: null,
      bannerFileId: null,
      logoUrl: null,
      bannerUrl: null,
      isDigitalMenuEnabled: true,
      isAcceptingOrders: true,
      operationalStatus: 'OPEN' as const,
      operationalStatusMessage: null,
      manualPauseReason: null,
      allowScheduledOrders: false,
      scheduleMinLeadMinutes: 30,
      scheduleMaxDaysAhead: 7,
      allowItemObservations: true,
    },
    businessHours,
    specialHours,
  }
}

const assertStoreFileBelongsToStore = async ({
  fileId,
  storeId,
}: {
  fileId: number | null | undefined
  storeId: number
}) => {
  if (!fileId) return

  const [file] = await db
    .select({ id: storeFilesTable.id })
    .from(storeFilesTable)
    .where(and(eq(storeFilesTable.id, fileId), eq(storeFilesTable.storeId, storeId)))
    .limit(1)

  if (!file) throw new Error('Arquivo nao pertence a loja validada.')
}

export const saveStorePublicProfile = async (
  storeId: number,
  input: StorePublicProfileInput
) => {
  try {
    await validateUserPermissionsForStore(storeId, 'store.settings.manage')
    const values = publicProfileSchema.parse(input)

    await assertStoreFileBelongsToStore({ fileId: values.logoFileId, storeId })
    await assertStoreFileBelongsToStore({ fileId: values.bannerFileId, storeId })

    await db.transaction(async tx => {
      await tx
        .update(storesTable)
        .set({ name: values.storeName })
        .where(eq(storesTable.id, storeId))

      await tx
        .insert(storeDigitalMenuSettingsTable)
        .values({
          storeId,
          whatsappPhone: values.whatsappPhone?.trim() || null,
          logoFileId: values.logoFileId ?? null,
          bannerFileId: values.bannerFileId ?? null,
        })
        .onConflictDoUpdate({
          target: storeDigitalMenuSettingsTable.storeId,
          set: {
            whatsappPhone: values.whatsappPhone?.trim() || null,
            logoFileId: values.logoFileId ?? null,
            bannerFileId: values.bannerFileId ?? null,
          },
        })
    })
  } catch (error) {
    console.error('[store-operation] Failed to save public profile', {
      storeId,
      error: error instanceof Error ? error.message : String(error),
    })
    throw error
  }
}

export const saveStoreOperationSettings = async (
  storeId: number,
  input: StoreOperationSettingsInput
) => {
  try {
    await validateUserPermissionsForStore(storeId, 'store.settings.manage')
    const values = operationSettingsSchema.parse(input)
    const message = values.operationalStatusMessage?.trim() || null

    await db
      .insert(storeDigitalMenuSettingsTable)
      .values({
        storeId,
        ...values,
        operationalStatusMessage: message,
        manualPauseReason: message,
      })
      .onConflictDoUpdate({
        target: storeDigitalMenuSettingsTable.storeId,
        set: {
          ...values,
          operationalStatusMessage: message,
          manualPauseReason: message,
        },
      })
  } catch (error) {
    console.error('[store-operation] Failed to save operation settings', {
      storeId,
      error: error instanceof Error ? error.message : String(error),
    })
    throw error
  }
}

export const saveStoreBusinessHour = async (
  storeId: number,
  input: StoreBusinessHourInput
) => {
  try {
    await validateUserPermissionsForStore(storeId, 'store.settings.manage')
    const values = businessHourSchema.parse(input)
    const { id, ...hourValues } = values

    if (id) {
      await db
        .update(storeBusinessHoursTable)
        .set(hourValues)
        .where(
          and(
            eq(storeBusinessHoursTable.id, id),
            eq(storeBusinessHoursTable.storeId, storeId)
          )
        )
      return
    }

    await db.insert(storeBusinessHoursTable).values({ storeId, ...hourValues })
  } catch (error) {
    console.error('[store-operation] Failed to save business hour', {
      storeId,
      error: error instanceof Error ? error.message : String(error),
    })
    throw error
  }
}

export const deleteStoreBusinessHour = async (storeId: number, id: number) => {
  await validateUserPermissionsForStore(storeId, 'store.settings.manage')

  await db
    .delete(storeBusinessHoursTable)
    .where(
      and(
        eq(storeBusinessHoursTable.id, id),
        eq(storeBusinessHoursTable.storeId, storeId)
      )
    )
}

export const saveStoreSpecialHour = async (
  storeId: number,
  input: StoreSpecialHourInput
) => {
  try {
    await validateUserPermissionsForStore(storeId, 'store.settings.manage')
    const values = specialHourSchema.parse(input)
    const normalized = {
      date: values.date,
      reason: values.reason?.trim() || null,
      isClosed: values.isClosed,
      opensAt: values.isClosed ? null : values.opensAt,
      closesAt: values.isClosed ? null : values.closesAt,
      serviceType: values.serviceType,
    }

    if (values.id) {
      await db
        .update(storeSpecialHoursTable)
        .set(normalized)
        .where(
          and(
            eq(storeSpecialHoursTable.id, values.id),
            eq(storeSpecialHoursTable.storeId, storeId)
          )
        )
      return
    }

    await db.insert(storeSpecialHoursTable).values({ storeId, ...normalized })
  } catch (error) {
    console.error('[store-operation] Failed to save special hour', {
      storeId,
      error: error instanceof Error ? error.message : String(error),
    })
    throw error
  }
}

export const deleteStoreSpecialHour = async (storeId: number, id: number) => {
  await validateUserPermissionsForStore(storeId, 'store.settings.manage')

  await db
    .delete(storeSpecialHoursTable)
    .where(
      and(
        eq(storeSpecialHoursTable.id, id),
        eq(storeSpecialHoursTable.storeId, storeId)
      )
    )
}
