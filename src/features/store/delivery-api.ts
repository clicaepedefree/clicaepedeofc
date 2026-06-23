'use server'

import { validateUserPermissionsForStore } from '@/features/store/api'
import { db } from '@/services/db'
import {
  storeDeliveryZonesTable,
  storeDigitalMenuSettingsTable,
} from '@/services/db/schema'
import { and, asc, desc, eq } from 'drizzle-orm'
import { z } from 'zod'

const moneySchema = z.coerce.number().min(0).max(99999).transform(value => value.toFixed(4))

const nullableMoneySchema = z
  .union([z.literal(''), z.coerce.number().min(0).max(99999)])
  .transform(value => (value === '' ? null : Number(value).toFixed(4)))

const deliverySettingsSchema = z.object({
  minimumOrderAmount: moneySchema,
  averagePreparationMinutes: z.coerce.number().int().min(1).max(600),
})

const deliveryZoneSchema = z
  .object({
    id: z.number().int().positive().optional(),
    type: z.enum(['FIXED', 'NEIGHBORHOOD', 'RADIUS', 'POSTAL_CODE']),
    name: z.string().min(2).max(120),
    neighborhood: z.string().max(120).optional().nullable(),
    postalCodePrefix: z.string().max(16).optional().nullable(),
    centerLat: z.string().max(24).optional().nullable(),
    centerLng: z.string().max(24).optional().nullable(),
    radiusMeters: z.coerce.number().int().min(1).max(100000).optional().nullable(),
    deliveryFee: moneySchema,
    freeDeliveryMinimum: nullableMoneySchema,
    minimumOrderAmount: nullableMoneySchema,
    estimatedDeliveryMinutes: z.coerce.number().int().min(1).max(600),
    priority: z.coerce.number().int().min(0).max(999),
    isActive: z.boolean(),
  })
  .superRefine((value, ctx) => {
    if (value.type === 'NEIGHBORHOOD' && !value.neighborhood?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['neighborhood'],
        message: 'Informe o bairro atendido.',
      })
    }

    if (value.type === 'POSTAL_CODE' && !value.postalCodePrefix?.replace(/\D/g, '')) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['postalCodePrefix'],
        message: 'Informe o prefixo do CEP.',
      })
    }

    if (value.type === 'RADIUS') {
      const latitude = Number(value.centerLat)
      const longitude = Number(value.centerLng)

      if (!value.centerLat || !value.centerLng || !value.radiusMeters) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['radiusMeters'],
          message: 'Informe latitude, longitude e raio.',
        })
      }

      if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['centerLat'],
          message: 'Informe uma latitude valida.',
        })
      }

      if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['centerLng'],
          message: 'Informe uma longitude valida.',
        })
      }
    }
  })

export type StoreDeliverySettingsInput = z.input<typeof deliverySettingsSchema>
export type StoreDeliveryZoneInput = z.input<typeof deliveryZoneSchema>

export const getStoreDeliveryConfiguration = async (storeId: number) => {
  await validateUserPermissionsForStore(storeId, 'admin')

  const [settings] = await db
    .select({
      minimumOrderAmount: storeDigitalMenuSettingsTable.minimumOrderAmount,
      averagePreparationMinutes:
        storeDigitalMenuSettingsTable.averagePreparationMinutes,
    })
    .from(storeDigitalMenuSettingsTable)
    .where(eq(storeDigitalMenuSettingsTable.storeId, storeId))
    .limit(1)

  const zones = await db
    .select({
      id: storeDeliveryZonesTable.id,
      type: storeDeliveryZonesTable.type,
      name: storeDeliveryZonesTable.name,
      neighborhood: storeDeliveryZonesTable.neighborhood,
      postalCodePrefix: storeDeliveryZonesTable.postalCodePrefix,
      centerLat: storeDeliveryZonesTable.centerLat,
      centerLng: storeDeliveryZonesTable.centerLng,
      radiusMeters: storeDeliveryZonesTable.radiusMeters,
      deliveryFee: storeDeliveryZonesTable.deliveryFee,
      freeDeliveryMinimum: storeDeliveryZonesTable.freeDeliveryMinimum,
      minimumOrderAmount: storeDeliveryZonesTable.minimumOrderAmount,
      estimatedDeliveryMinutes: storeDeliveryZonesTable.estimatedDeliveryMinutes,
      priority: storeDeliveryZonesTable.priority,
      isActive: storeDeliveryZonesTable.isActive,
    })
    .from(storeDeliveryZonesTable)
    .where(eq(storeDeliveryZonesTable.storeId, storeId))
    .orderBy(desc(storeDeliveryZonesTable.priority), asc(storeDeliveryZonesTable.name))

  return {
    settings: settings ?? {
      minimumOrderAmount: '0',
      averagePreparationMinutes: 30,
    },
    zones,
  }
}

export const saveStoreDeliverySettings = async (
  storeId: number,
  input: StoreDeliverySettingsInput
) => {
  await validateUserPermissionsForStore(storeId, 'admin')
  const values = deliverySettingsSchema.parse(input)

  await db
    .insert(storeDigitalMenuSettingsTable)
    .values({ storeId, ...values })
    .onConflictDoUpdate({
      target: storeDigitalMenuSettingsTable.storeId,
      set: values,
    })
}

export const saveStoreDeliveryZone = async (
  storeId: number,
  input: StoreDeliveryZoneInput
) => {
  await validateUserPermissionsForStore(storeId, 'admin')
  const values = deliveryZoneSchema.parse(input)

  const normalizedValues = {
    type: values.type,
    name: values.name.trim(),
    neighborhood:
      values.type === 'NEIGHBORHOOD' ? values.neighborhood?.trim() : null,
    postalCodePrefix:
      values.type === 'POSTAL_CODE'
        ? values.postalCodePrefix?.replace(/\D/g, '')
        : null,
    centerLat: values.type === 'RADIUS' ? values.centerLat : null,
    centerLng: values.type === 'RADIUS' ? values.centerLng : null,
    radiusMeters: values.type === 'RADIUS' ? values.radiusMeters : null,
    deliveryFee: values.deliveryFee,
    freeDeliveryMinimum: values.freeDeliveryMinimum,
    minimumOrderAmount: values.minimumOrderAmount,
    estimatedDeliveryMinutes: values.estimatedDeliveryMinutes,
    priority: values.priority,
    isActive: values.isActive,
  }

  if (values.id) {
    await db
      .update(storeDeliveryZonesTable)
      .set(normalizedValues)
      .where(
        and(
          eq(storeDeliveryZonesTable.id, values.id),
          eq(storeDeliveryZonesTable.storeId, storeId)
        )
      )
    return
  }

  await db.insert(storeDeliveryZonesTable).values({
    storeId,
    ...normalizedValues,
  })
}

export const deleteStoreDeliveryZone = async (storeId: number, zoneId: number) => {
  await validateUserPermissionsForStore(storeId, 'admin')

  await db
    .delete(storeDeliveryZonesTable)
    .where(
      and(
        eq(storeDeliveryZonesTable.id, zoneId),
        eq(storeDeliveryZonesTable.storeId, storeId)
      )
    )
}
