'use server'

import { validateUserPermissionsForStore } from '@/features/store/api'
import { db } from '@/services/db'
import {
  storeBusinessHoursTable,
  storeDigitalMenuSettingsTable,
  storeSpecialHoursTable,
} from '@/services/db/schema'
import { and, asc, eq } from 'drizzle-orm'
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
export type StoreBusinessHourInput = z.input<typeof businessHourSchema>
export type StoreSpecialHourInput = z.input<typeof specialHourSchema>

export const getStoreOperationConfiguration = async (storeId: number) => {
  await validateUserPermissionsForStore(storeId, 'admin')

  const [settings] = await db
    .select({
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
    .where(eq(storeDigitalMenuSettingsTable.storeId, storeId))
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

export const saveStoreOperationSettings = async (
  storeId: number,
  input: StoreOperationSettingsInput
) => {
  try {
    await validateUserPermissionsForStore(storeId, 'admin')
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
    await validateUserPermissionsForStore(storeId, 'admin')
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
  await validateUserPermissionsForStore(storeId, 'admin')

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
    await validateUserPermissionsForStore(storeId, 'admin')
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
  await validateUserPermissionsForStore(storeId, 'admin')

  await db
    .delete(storeSpecialHoursTable)
    .where(
      and(
        eq(storeSpecialHoursTable.id, id),
        eq(storeSpecialHoursTable.storeId, storeId)
      )
    )
}
