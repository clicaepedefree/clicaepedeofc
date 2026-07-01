'use server'

import {
  buildDigitalMenuPath,
  buildDigitalMenuReadiness,
  canPublishDigitalMenu,
  deriveDigitalMenuPublicationStatus,
} from '@/features/digital-menu/admin'
import { validateUserPermissionsForStore } from '@/features/store/api'
import { db } from '@/services/db'
import {
  categoriesTable,
  itemOfferingsTable,
  itemsTable,
  storeBusinessHoursTable,
  storeDeliveryZonesTable,
  storeDigitalMenuSettingsTable,
  storePaymentMethodsTable,
  storesTable,
} from '@/services/db/schema'
import { and, count, eq, gt, isNull, min, or } from 'drizzle-orm'
import { z } from 'zod'

const publicationActionSchema = z.object({
  action: z.enum(['PUBLISH', 'PAUSE']),
  reason: z.string().trim().max(180).optional(),
})

const paymentMethodLabels: Record<string, string> = {
  CASH: 'Dinheiro',
  PIX: 'Pix',
  CREDIT: 'Credito na entrega',
  DEBIT: 'Debito na entrega',
  MEAL_VOUCHER: 'Vale-refeicao',
  FOOD_VOUCHER: 'Vale-alimentacao',
  ONLINE: 'Pagamento online',
}

export const getDigitalMenuAdminOverview = async (storeId: number) => {
  await validateUserPermissionsForStore(storeId, 'admin')

  const [store] = await db
    .select({
      id: storesTable.id,
      name: storesTable.name,
      slug: storesTable.subdomain,
    })
    .from(storesTable)
    .where(eq(storesTable.id, storeId))
    .limit(1)

  if (!store) throw new Error('Loja nao encontrada.')

  const [settingsRows, productRows, hourRows, zoneRows, paymentRows] =
    await Promise.all([
      db
        .select({
          publicationStatus: storeDigitalMenuSettingsTable.publicationStatus,
          isDigitalMenuEnabled:
            storeDigitalMenuSettingsTable.isDigitalMenuEnabled,
          isAcceptingOrders: storeDigitalMenuSettingsTable.isAcceptingOrders,
          operationalStatus: storeDigitalMenuSettingsTable.operationalStatus,
          operationalStatusMessage:
            storeDigitalMenuSettingsTable.operationalStatusMessage,
          minimumOrderAmount: storeDigitalMenuSettingsTable.minimumOrderAmount,
          logoFileId: storeDigitalMenuSettingsTable.logoFileId,
          bannerFileId: storeDigitalMenuSettingsTable.bannerFileId,
          whatsappPhone: storeDigitalMenuSettingsTable.whatsappPhone,
        })
        .from(storeDigitalMenuSettingsTable)
        .where(eq(storeDigitalMenuSettingsTable.storeId, storeId))
        .limit(1),
      db
        .select({ total: count() })
        .from(itemOfferingsTable)
        .innerJoin(
          categoriesTable,
          eq(categoriesTable.id, itemOfferingsTable.categoryId)
        )
        .innerJoin(itemsTable, eq(itemsTable.id, itemOfferingsTable.itemId))
        .where(
          and(
            eq(categoriesTable.storeId, storeId),
            eq(categoriesTable.isAvailable, true),
            eq(itemOfferingsTable.isAvailable, true),
            or(isNull(itemsTable.inventory), gt(itemsTable.inventory, 0))
          )
        ),
      db
        .select({ total: count() })
        .from(storeBusinessHoursTable)
        .where(
          and(
            eq(storeBusinessHoursTable.storeId, storeId),
            eq(storeBusinessHoursTable.isActive, true)
          )
        ),
      db
        .select({
          total: count(),
          feeFrom: min(storeDeliveryZonesTable.deliveryFee),
        })
        .from(storeDeliveryZonesTable)
        .where(
          and(
            eq(storeDeliveryZonesTable.storeId, storeId),
            eq(storeDeliveryZonesTable.isActive, true)
          )
        ),
      db
        .select({
          method: storePaymentMethodsTable.method,
          allowDelivery: storePaymentMethodsTable.allowDelivery,
          allowTakeout: storePaymentMethodsTable.allowTakeout,
        })
        .from(storePaymentMethodsTable)
        .where(
          and(
            eq(storePaymentMethodsTable.storeId, storeId),
            eq(storePaymentMethodsTable.isActive, true),
            isNull(storePaymentMethodsTable.cardBrand),
            or(
              eq(storePaymentMethodsTable.allowDelivery, true),
              eq(storePaymentMethodsTable.allowTakeout, true)
            )
          )
        ),
    ])

  const settings = settingsRows[0] ?? {
    publicationStatus: 'DRAFT' as const,
    isDigitalMenuEnabled: false,
    isAcceptingOrders: true,
    operationalStatus: 'OPEN',
    operationalStatusMessage: null,
    minimumOrderAmount: '0',
    logoFileId: null,
    bannerFileId: null,
    whatsappPhone: null,
  }
  const availableProducts = productRows[0]?.total ?? 0
  const activeBusinessHours = hourRows[0]?.total ?? 0
  const activeDeliveryZones = zoneRows[0]?.total ?? 0
  const allowsTakeout =
    settings.operationalStatus !== 'DELIVERY_ONLY' &&
    paymentRows.some(method => method.allowTakeout)
  const readiness = buildDigitalMenuReadiness({
    availableProducts,
    activeBusinessHours,
    activePaymentMethods: paymentRows.length,
    activeDeliveryZones,
    allowsTakeout,
    hasPublicIdentity: Boolean(
      settings.logoFileId || settings.bannerFileId || settings.whatsappPhone
    ),
  })

  return {
    store,
    publicPath: buildDigitalMenuPath(store.slug),
    previewPath: `/digital-menu/preview/${encodeURIComponent(store.slug)}`,
    publicationStatus: deriveDigitalMenuPublicationStatus(settings),
    canPublish: canPublishDigitalMenu(readiness),
    readiness,
    summary: {
      availableProducts,
      activeBusinessHours,
      activeDeliveryZones,
      deliveryEnabled:
        settings.operationalStatus !== 'TAKEOUT_ONLY' &&
        activeDeliveryZones > 0,
      takeoutEnabled: allowsTakeout,
      minimumOrderAmount: settings.minimumOrderAmount,
      deliveryFeeFrom: zoneRows[0]?.feeFrom ?? null,
      paymentMethods: paymentRows.map(method => ({
        id: method.method,
        label: paymentMethodLabels[method.method] ?? method.method,
      })),
    },
  }
}

export const updateDigitalMenuPublication = async (
  storeId: number,
  input: z.input<typeof publicationActionSchema>
) => {
  const { user } = await validateUserPermissionsForStore(storeId, 'admin')
  const values = publicationActionSchema.parse(input)

  if (values.action === 'PUBLISH') {
    const overview = await getDigitalMenuAdminOverview(storeId)
    if (!overview.canPublish) {
      const missing = overview.readiness
        .filter(item => item.blocking && !item.ready)
        .map(item => item.label.toLowerCase())
        .join(', ')
      throw new Error(`Complete antes de publicar: ${missing}.`)
    }

    await db
      .insert(storeDigitalMenuSettingsTable)
      .values({
        storeId,
        isDigitalMenuEnabled: true,
        publicationStatus: 'PUBLISHED',
        publishedAt: new Date(),
        publicationUpdatedAt: new Date(),
        publicationUpdatedByUserId: user.id,
      })
      .onConflictDoUpdate({
        target: storeDigitalMenuSettingsTable.storeId,
        set: {
          isDigitalMenuEnabled: true,
          publicationStatus: 'PUBLISHED',
          publishedAt: new Date(),
          publicationUpdatedAt: new Date(),
          publicationUpdatedByUserId: user.id,
        },
      })
    return
  }

  await db
    .insert(storeDigitalMenuSettingsTable)
    .values({
      storeId,
      isDigitalMenuEnabled: true,
      publicationStatus: 'PAUSED',
      publicationUpdatedAt: new Date(),
      publicationUpdatedByUserId: user.id,
    })
    .onConflictDoUpdate({
      target: storeDigitalMenuSettingsTable.storeId,
      set: {
        isDigitalMenuEnabled: true,
        publicationStatus: 'PAUSED',
        publicationUpdatedAt: new Date(),
        publicationUpdatedByUserId: user.id,
      },
    })
}
