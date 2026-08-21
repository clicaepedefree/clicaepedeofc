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
  digitalMenuPromotionItemsTable,
  digitalMenuPromotionsTable,
  itemOfferingsTable,
  itemsTable,
  storeBusinessHoursTable,
  storeDeliveryZonesTable,
  storeDigitalMenuSettingsTable,
  storePaymentMethodsTable,
  storesTable,
} from '@/services/db/schema'
import { and, count, eq, gt, inArray, isNull, min, or, sql } from 'drizzle-orm'
import { z } from 'zod'

const publicationActionSchema = z.object({
  action: z.enum(['PUBLISH', 'PAUSE']),
  reason: z.string().trim().max(180).optional(),
})

const promotionSchema = z.object({
  id: z.number().int().positive().optional(),
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(240).optional(),
  code: z
    .string()
    .trim()
    .max(40)
    .transform(value => value.toUpperCase().replace(/\s+/g, ''))
    .optional(),
  type: z.enum([
    'FIXED_AMOUNT',
    'PERCENTAGE',
    'FREE_DELIVERY',
    'FREE_DELIVERY_THRESHOLD',
    'FEATURED_ITEM',
    'COMBO',
    'ITEM_PRICE',
  ]),
  status: z.enum(['ACTIVE', 'PAUSED']).default('ACTIVE'),
  startsAt: z.string().datetime().optional(),
  endsAt: z.string().datetime().optional(),
  minOrderAmount: z.coerce.number().min(0).optional(),
  discountAmount: z.coerce.number().min(0).optional(),
  discountPercent: z.coerce.number().int().min(1).max(100).optional(),
  maxDiscountAmount: z.coerce.number().min(0).optional(),
  freeDeliveryMinimum: z.coerce.number().min(0).optional(),
  usageLimit: z.coerce.number().int().positive().optional(),
  perCustomerLimit: z.coerce.number().int().positive().optional(),
  priority: z.coerce.number().int().min(0).max(999).default(0),
  promotionalPrice: z.coerce.number().min(0).optional(),
  itemOfferingIds: z.array(z.number().int().positive()).max(80).default([]),
})

const toMoney = (value: number | undefined) =>
  value === undefined || Number.isNaN(value) ? null : value.toFixed(4)

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
  await validateUserPermissionsForStore(storeId, 'store.settings.manage')

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

  const [
    settingsRows,
    productRows,
    hourRows,
    zoneRows,
    paymentRows,
    promotionRows,
    promotionItemRows,
    productOptionRows,
  ] = await Promise.all([
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
    db
      .select()
      .from(digitalMenuPromotionsTable)
      .where(eq(digitalMenuPromotionsTable.storeId, storeId))
      .orderBy(
        sql`${digitalMenuPromotionsTable.status} asc`,
        sql`${digitalMenuPromotionsTable.priority} desc`,
        digitalMenuPromotionsTable.name
      ),
    db
      .select({
        promotionId: digitalMenuPromotionItemsTable.promotionId,
        itemOfferingId: digitalMenuPromotionItemsTable.itemOfferingId,
      })
      .from(digitalMenuPromotionItemsTable)
      .innerJoin(
        digitalMenuPromotionsTable,
        eq(
          digitalMenuPromotionsTable.id,
          digitalMenuPromotionItemsTable.promotionId
        )
      )
      .where(eq(digitalMenuPromotionsTable.storeId, storeId)),
    db
      .select({
        itemOfferingId: itemOfferingsTable.id,
        itemName: itemsTable.name,
        categoryName: categoriesTable.name,
      })
      .from(itemOfferingsTable)
      .innerJoin(
        categoriesTable,
        eq(categoriesTable.id, itemOfferingsTable.categoryId)
      )
      .innerJoin(itemsTable, eq(itemsTable.id, itemOfferingsTable.itemId))
      .where(eq(categoriesTable.storeId, storeId)),
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
    productOptions: productOptionRows.map(option => ({
      id: option.itemOfferingId,
      label: `${option.itemName} (${option.categoryName})`,
    })),
    promotions: promotionRows.map(promotion => ({
      id: promotion.id,
      name: promotion.name,
      description: promotion.description,
      code: promotion.code,
      type: promotion.type,
      status: promotion.status,
      startsAt: promotion.startsAt?.toISOString() ?? null,
      endsAt: promotion.endsAt?.toISOString() ?? null,
      minOrderAmount: promotion.minOrderAmount,
      discountAmount: promotion.discountAmount,
      discountPercent: promotion.discountPercent,
      maxDiscountAmount: promotion.maxDiscountAmount,
      freeDeliveryMinimum: promotion.freeDeliveryMinimum,
      usageLimit: promotion.usageLimit,
      usedCount: promotion.usedCount,
      perCustomerLimit: promotion.perCustomerLimit,
      priority: promotion.priority,
      promotionalPrice:
        typeof (promotion.metadata as { promotionalPrice?: unknown } | null)
          ?.promotionalPrice === 'string'
          ? (promotion.metadata as { promotionalPrice: string })
              .promotionalPrice
          : null,
      itemOfferingIds: promotionItemRows
        .filter(item => item.promotionId === promotion.id)
        .map(item => item.itemOfferingId),
    })),
  }
}

export const saveDigitalMenuPromotion = async (
  storeId: number,
  input: z.input<typeof promotionSchema>
) => {
  await validateUserPermissionsForStore(storeId, 'store.settings.manage')
  const values = promotionSchema.parse(input)
  const code = values.code || null

  if (
    ['FIXED_AMOUNT', 'PERCENTAGE', 'FREE_DELIVERY'].includes(values.type) &&
    !code
  ) {
    throw new Error('Informe um codigo para este tipo de cupom.')
  }

  if (values.type === 'FIXED_AMOUNT' && !values.discountAmount) {
    throw new Error('Informe o valor do desconto fixo.')
  }

  if (values.type === 'PERCENTAGE' && !values.discountPercent) {
    throw new Error('Informe o percentual do cupom.')
  }

  if (
    values.type === 'FREE_DELIVERY_THRESHOLD' &&
    !values.freeDeliveryMinimum
  ) {
    throw new Error('Informe o valor minimo para frete gratis.')
  }

  if (
    ['FEATURED_ITEM', 'COMBO', 'ITEM_PRICE'].includes(values.type) &&
    values.itemOfferingIds.length === 0
  ) {
    throw new Error('Selecione ao menos um produto para esta campanha.')
  }

  if (values.type === 'ITEM_PRICE' && !values.promotionalPrice) {
    throw new Error('Informe o preco promocional.')
  }

  if (
    values.startsAt &&
    values.endsAt &&
    new Date(values.startsAt) > new Date(values.endsAt)
  ) {
    throw new Error('A data inicial precisa vir antes da data final.')
  }

  await db.transaction(async tx => {
    const payload = {
      storeId,
      name: values.name,
      description: values.description || null,
      code,
      type: values.type,
      status: values.status,
      startsAt: values.startsAt ? new Date(values.startsAt) : null,
      endsAt: values.endsAt ? new Date(values.endsAt) : null,
      minOrderAmount: toMoney(values.minOrderAmount),
      discountAmount: toMoney(values.discountAmount),
      discountPercent: values.discountPercent ?? null,
      maxDiscountAmount: toMoney(values.maxDiscountAmount),
      freeDeliveryMinimum: toMoney(values.freeDeliveryMinimum),
      usageLimit: values.usageLimit ?? null,
      perCustomerLimit: values.perCustomerLimit ?? null,
      priority: values.priority,
      isFeatured: values.type === 'FEATURED_ITEM',
      metadata:
        values.type === 'ITEM_PRICE'
          ? { promotionalPrice: toMoney(values.promotionalPrice) }
          : values.type === 'COMBO'
            ? { comboItemOfferingIds: values.itemOfferingIds }
            : null,
    }

    const [promotion] = values.id
      ? await tx
          .update(digitalMenuPromotionsTable)
          .set(payload)
          .where(
            and(
              eq(digitalMenuPromotionsTable.id, values.id),
              eq(digitalMenuPromotionsTable.storeId, storeId)
            )
          )
          .returning({ id: digitalMenuPromotionsTable.id })
      : await tx
          .insert(digitalMenuPromotionsTable)
          .values(payload)
          .returning({ id: digitalMenuPromotionsTable.id })

    if (!promotion) throw new Error('Promocao nao encontrada.')

    await tx
      .delete(digitalMenuPromotionItemsTable)
      .where(eq(digitalMenuPromotionItemsTable.promotionId, promotion.id))

    if (values.itemOfferingIds.length > 0) {
      const eligibleItems = await tx
        .select({ id: itemOfferingsTable.id })
        .from(itemOfferingsTable)
        .innerJoin(
          categoriesTable,
          eq(categoriesTable.id, itemOfferingsTable.categoryId)
        )
        .where(
          and(
            eq(categoriesTable.storeId, storeId),
            inArray(itemOfferingsTable.id, values.itemOfferingIds)
          )
        )

      if (eligibleItems.length !== values.itemOfferingIds.length) {
        throw new Error('Um dos produtos selecionados nao pertence a loja.')
      }

      await tx.insert(digitalMenuPromotionItemsTable).values(
        values.itemOfferingIds.map(itemOfferingId => ({
          promotionId: promotion.id,
          itemOfferingId,
          quantity: 1,
          promotionalPrice: toMoney(values.promotionalPrice),
        }))
      )
    }
  })
}

export const deleteDigitalMenuPromotion = async (
  storeId: number,
  promotionId: number
) => {
  await validateUserPermissionsForStore(storeId, 'store.settings.manage')
  await db
    .delete(digitalMenuPromotionsTable)
    .where(
      and(
        eq(digitalMenuPromotionsTable.id, promotionId),
        eq(digitalMenuPromotionsTable.storeId, storeId)
      )
    )
}

export const updateDigitalMenuPublication = async (
  storeId: number,
  input: z.input<typeof publicationActionSchema>
) => {
  const { user } = await validateUserPermissionsForStore(storeId, 'store.settings.manage')
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
