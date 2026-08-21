'use server'

import { getOptionGroupsByItemOfferingIds } from '@/features/option-groups/db'
import { validateUserPermissionsForStore } from '@/features/store/api'
import {
  createOrderItemOnDb,
  createOrderItemOptionsOnDb,
  createOrderAuditEventOnDb,
  createOrderOnDb,
  createOrderPaymentOnDb,
  getNextOrderDisplayIdForStore,
  updateOrderItemInventoryOnDb,
} from '@/features/order/db'
import { db } from '@/services/db'
import {
  categoriesTable,
  digitalMenuPromotionItemsTable,
  digitalMenuPromotionRedemptionsTable,
  digitalMenuPromotionsTable,
  itemOfferingsTable,
  itemsTable,
  ordersTable,
  publicOrderDeliveryAttemptsTable,
  publicOrderEventsTable,
  publicOrderSecurityEventsTable,
  publicOrderSubmissionsTable,
  storeBusinessHoursTable,
  storeCompanyProfilesTable,
  storeDeliveryZonesTable,
  storeDigitalMenuSettingsTable,
  storeFilesTable,
  storePaymentMethodsTable,
  storeSpecialHoursTable,
  storesTable,
} from '@/services/db/schema'
import { getValueFromCurrencyString } from '@/shared/formatters/currency'
import Decimal from 'decimal.js'
import { and, asc, count, desc, eq, gt, isNull, or, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { unstable_noStore as noStore } from 'next/cache'
import { createHash, createHmac } from 'node:crypto'
import { headers } from 'next/headers'
import { z } from 'zod'
import {
  evaluateDigitalMenuAvailability,
  DigitalMenuAvailabilitySettings,
} from './availability'
import { validateAndPriceDigitalMenuCart } from './cart'
import { quoteDigitalMenuDelivery } from './delivery'
import {
  DigitalMenuCategory,
  DigitalMenuData,
  DigitalMenuDeliveryZone,
  DigitalMenuCartItemInput,
  DigitalMenuItem,
  DigitalMenuPaymentMethod,
  DigitalMenuSettings,
  DigitalMenuSubmissionResult,
  DigitalMenuSubmitInput,
  PublicOrderTrackingDto,
} from './types'
import {
  buildPublicOrderTrackingDto,
  createPublicTrackingToken,
  encryptPublicTrackingToken,
  hashPublicIdentifier,
  isPublicTrackingToken,
  PUBLIC_ORDER_RATE_LIMIT,
  PUBLIC_ORDER_RISK,
  PUBLIC_ORDER_TRACKING_TTL_MS,
  calculatePublicOrderRiskScore,
  publicTrackingTokenMatches,
  recoverActivePublicTrackingToken,
} from './public-order-security'
import {
  normalizeStoreSlug,
  sanitizePublicText,
  submitDigitalMenuOrderSchema,
} from './validation'
import { getTurnstileSiteKey, verifyTurnstileToken } from './turnstile'
import { mapDbPromotionToPublic, normalizeCouponCode } from './promotions'
import {
  DigitalMenuOrderDomainError,
  getDigitalMenuOrderDomainFailure,
} from './submission-errors'

const DEFAULT_DIGITAL_MENU_SETTINGS = {
  logoImageUrl: null,
  bannerImageUrl: null,
  whatsappPhone: null,
  pickupAddress: null,
  pickupStreet: null,
  pickupNumber: null,
  pickupDistrict: null,
  pickupCity: null,
  pickupStateCode: null,
  isDigitalMenuEnabled: true,
  isAcceptingOrders: true,
  publicationStatus: 'DRAFT' as const,
  manualPauseReason: null,
  manualPauseUntil: null,
  operationalStatus: 'OPEN' as const,
  operationalStatusMessage: null,
  minimumOrderAmount: '0',
  averagePreparationMinutes: 30,
  allowScheduledOrders: false,
  scheduleMinLeadMinutes: 30,
  scheduleMaxDaysAhead: 7,
  allowItemObservations: true,
}

const hashRequestIdentifier = (value: string | null) => {
  if (!value) return null
  const pepper = process.env.CLERK_SECRET_KEY
  if (!pepper) throw new Error('Missing server-side audit hash pepper.')
  return createHmac('sha256', pepper).update(value).digest('hex')
}

const getPublicOrderSecuritySecret = () => {
  const secret =
    process.env.PUBLIC_ORDER_SECURITY_SECRET ?? process.env.CLERK_SECRET_KEY
  if (!secret)
    throw new Error('Missing server-side public order security secret.')
  return secret
}

const getPublicRequestHashes = async () => {
  const requestHeaders = await headers()
  const forwardedFor = requestHeaders.get('x-forwarded-for')
  const ip =
    forwardedFor?.split(',')[0]?.trim() || requestHeaders.get('x-real-ip')
  return {
    remoteIp: ip,
    ipHash: hashRequestIdentifier(ip),
    userAgentHash: hashRequestIdentifier(requestHeaders.get('user-agent')),
  }
}

type PublicSecurityContext = {
  ipHash: string | null
  deviceHash: string | null
  phoneHash: string | null
  userAgentHash: string | null
}

const getPublicOrderRisk = async (
  storeId: number,
  context: PublicSecurityContext
) => {
  const since = new Date(
    Date.now() - PUBLIC_ORDER_RISK.lookbackMinutes * 60 * 1000
  )
  const sinceIso = since.toISOString()
  const [row] = await db.execute<{
    invalidPayloads: number
    captchaFailures: number
    rateLimits: number
  }>(sql`
    select
      count(*) filter (where event_type = 'INVALID_PAYLOAD')::integer as "invalidPayloads",
      count(*) filter (where event_type = 'CAPTCHA_FAILED')::integer as "captchaFailures",
      count(*) filter (where event_type in ('RATE_LIMITED', 'TEMPORARILY_BLOCKED'))::integer as "rateLimits"
    from public.public_order_security_events
    where store_id = ${storeId}
      and created_at >= ${sinceIso}::timestamptz
      and (
        (${context.ipHash}::text is not null and ip_hash = ${context.ipHash})
        or (${context.deviceHash}::text is not null and device_hash = ${context.deviceHash})
        or (${context.phoneHash}::text is not null and phone_hash = ${context.phoneHash})
      )
  `)

  return calculatePublicOrderRiskScore({
    invalidPayloads: row?.invalidPayloads ?? 0,
    captchaFailures: row?.captchaFailures ?? 0,
    rateLimits: row?.rateLimits ?? 0,
  })
}

const recordPublicSecurityEvent = async ({
  storeId,
  eventType,
  context,
  riskScore,
  captchaStatus = 'not_required',
  retryAfterSeconds,
  metadata = {},
}: {
  storeId: number
  eventType:
    | 'INVALID_PAYLOAD'
    | 'CAPTCHA_REQUIRED'
    | 'CAPTCHA_PASSED'
    | 'CAPTCHA_FAILED'
    | 'RATE_LIMITED'
    | 'TEMPORARILY_BLOCKED'
  context: PublicSecurityContext
  riskScore: number
  captchaStatus?: 'not_required' | 'required' | 'passed' | 'failed'
  retryAfterSeconds?: number
  metadata?: Record<string, string | number | boolean>
}) => {
  await db.insert(publicOrderSecurityEventsTable).values({
    storeId,
    eventType,
    ...context,
    riskScore,
    captchaStatus,
    retryAfterSeconds,
    metadata,
  })
}

const paymentMethodLabels: Record<DigitalMenuPaymentMethod['method'], string> =
  {
    CASH: 'Dinheiro',
    PIX: 'Pix',
    CREDIT: 'Cartao de credito',
    DEBIT: 'Cartao de debito',
    MEAL_VOUCHER: 'Vale-refeicao',
    FOOD_VOUCHER: 'Vale-alimentacao',
    ONLINE: 'Pagamento online',
  }

const createRequestHash = (value: unknown) => {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

const toJsonSnapshot = <T>(value: T): T =>
  JSON.parse(JSON.stringify(value)) as T

const normalizeOptionalMoney = (value: string | undefined) => {
  const sanitized = sanitizePublicText(value, 40)
  if (!sanitized) return null

  const numericValue = getValueFromCurrencyString(sanitized)
  if (!Number.isFinite(numericValue) || numericValue <= 0) return null

  return new Decimal(numericValue).toFixed(4)
}

const digitalMenuCouponQuoteSchema = z.object({
  storeSlug: z.string().min(1).max(80).transform(normalizeStoreSlug),
  couponCode: z
    .string()
    .trim()
    .min(1)
    .max(40)
    .transform(value => value.toUpperCase().replace(/\s+/g, '')),
  orderType: z.enum(['DELIVERY', 'TAKEOUT']),
  address: z
    .object({
      postalCode: z.string().max(16).optional(),
      neighborhood: z.string().max(120).optional(),
      latitude: z.coerce.number().min(-90).max(90).optional(),
      longitude: z.coerce.number().min(-180).max(180).optional(),
    })
    .optional(),
  items: z
    .array(
      z.object({
        itemOfferingId: z.coerce.number().int().positive(),
        quantity: z.coerce.number().int().min(1).max(99),
        comment: z.string().max(240).optional(),
        options: z
          .array(
            z.object({
              optionId: z.coerce.number().int().positive(),
              quantity: z.coerce.number().int().min(1).max(99),
            })
          )
          .max(80)
          .default([]),
      })
    )
    .min(1)
    .max(80),
})

const getUnavailableReason = (status: string, statusReason: string | null) => {
  if (status === 'pending_recovery') {
    return 'Esta loja esta aguardando recuperacao de acesso.'
  }

  if (status === 'archived') {
    return 'Esta loja foi arquivada pela Clica e Pede.'
  }

  if (status !== 'active') {
    return statusReason || 'Esta loja esta indisponivel no momento.'
  }

  return null
}

const getDigitalMenuSettings = async (storeId: number) => {
  const logoFilesTable = alias(storeFilesTable, 'digitalMenuLogoFiles')
  const bannerFilesTable = alias(storeFilesTable, 'digitalMenuBannerFiles')

  const [settings] = await db
    .select({
      logoImageUrl: logoFilesTable.url,
      bannerImageUrl: bannerFilesTable.url,
      whatsappPhone: storeDigitalMenuSettingsTable.whatsappPhone,
      pickupStreet: storeCompanyProfilesTable.street,
      pickupNumber: storeCompanyProfilesTable.number,
      pickupDistrict: storeCompanyProfilesTable.district,
      pickupCity: storeCompanyProfilesTable.city,
      pickupStateCode: storeCompanyProfilesTable.stateCode,
      isDigitalMenuEnabled: storeDigitalMenuSettingsTable.isDigitalMenuEnabled,
      isAcceptingOrders: storeDigitalMenuSettingsTable.isAcceptingOrders,
      publicationStatus: storeDigitalMenuSettingsTable.publicationStatus,
      operationalStatus: storeDigitalMenuSettingsTable.operationalStatus,
      operationalStatusMessage:
        storeDigitalMenuSettingsTable.operationalStatusMessage,
      manualPauseReason: storeDigitalMenuSettingsTable.manualPauseReason,
      manualPauseUntil: storeDigitalMenuSettingsTable.manualPauseUntil,
      minimumOrderAmount: storeDigitalMenuSettingsTable.minimumOrderAmount,
      averagePreparationMinutes:
        storeDigitalMenuSettingsTable.averagePreparationMinutes,
      allowScheduledOrders: storeDigitalMenuSettingsTable.allowScheduledOrders,
      scheduleMinLeadMinutes:
        storeDigitalMenuSettingsTable.scheduleMinLeadMinutes,
      scheduleMaxDaysAhead: storeDigitalMenuSettingsTable.scheduleMaxDaysAhead,
      allowItemObservations:
        storeDigitalMenuSettingsTable.allowItemObservations,
    })
    .from(storeDigitalMenuSettingsTable)
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
    .leftJoin(
      storeCompanyProfilesTable,
      eq(
        storeCompanyProfilesTable.storeId,
        storeDigitalMenuSettingsTable.storeId
      )
    )
    .where(eq(storeDigitalMenuSettingsTable.storeId, storeId))
    .limit(1)

  if (settings) return settings

  const [pickupProfile] = await db
    .select({
      pickupStreet: storeCompanyProfilesTable.street,
      pickupNumber: storeCompanyProfilesTable.number,
      pickupDistrict: storeCompanyProfilesTable.district,
      pickupCity: storeCompanyProfilesTable.city,
      pickupStateCode: storeCompanyProfilesTable.stateCode,
    })
    .from(storeCompanyProfilesTable)
    .where(eq(storeCompanyProfilesTable.storeId, storeId))
    .limit(1)

  return {
    ...DEFAULT_DIGITAL_MENU_SETTINGS,
    pickupStreet: pickupProfile?.pickupStreet ?? null,
    pickupNumber: pickupProfile?.pickupNumber ?? null,
    pickupDistrict: pickupProfile?.pickupDistrict ?? null,
    pickupCity: pickupProfile?.pickupCity ?? null,
    pickupStateCode: pickupProfile?.pickupStateCode ?? null,
  }
}

const toPublicSettings = (
  settings: Awaited<ReturnType<typeof getDigitalMenuSettings>>
): DigitalMenuSettings => ({
  logoImageUrl: settings.logoImageUrl,
  bannerImageUrl: settings.bannerImageUrl,
  whatsappPhone: settings.whatsappPhone,
  pickupAddress:
    settings.pickupStreet ||
    settings.pickupNumber ||
    settings.pickupDistrict ||
    settings.pickupCity ||
    settings.pickupStateCode
      ? {
          street: settings.pickupStreet,
          number: settings.pickupNumber,
          district: settings.pickupDistrict,
          city: settings.pickupCity,
          stateCode: settings.pickupStateCode,
        }
      : null,
  isDigitalMenuEnabled: settings.isDigitalMenuEnabled,
  isAcceptingOrders: settings.isAcceptingOrders,
  operationalStatus: settings.operationalStatus,
  operationalStatusMessage: settings.operationalStatusMessage,
  manualPauseReason: settings.manualPauseReason,
  minimumOrderAmount: settings.minimumOrderAmount,
  averagePreparationMinutes: settings.averagePreparationMinutes,
  allowScheduledOrders: settings.allowScheduledOrders,
  scheduleMinLeadMinutes: settings.scheduleMinLeadMinutes,
  scheduleMaxDaysAhead: settings.scheduleMaxDaysAhead,
  allowItemObservations: settings.allowItemObservations,
})

const getPaymentMethodsForPublicMenu = async (storeId: number) => {
  const methods = await db
    .select({
      method: storePaymentMethodsTable.method,
      instructions: storePaymentMethodsTable.instructions,
      proofInstructions: storePaymentMethodsTable.proofInstructions,
      pixKey: storePaymentMethodsTable.pixKey,
      allowDelivery: storePaymentMethodsTable.allowDelivery,
      allowTakeout: storePaymentMethodsTable.allowTakeout,
      integrationProvider: storePaymentMethodsTable.integrationProvider,
      requiresChangeFor: storePaymentMethodsTable.requiresChangeFor,
      isActive: storePaymentMethodsTable.isActive,
    })
    .from(storePaymentMethodsTable)
    .where(
      and(
        eq(storePaymentMethodsTable.storeId, storeId),
        isNull(storePaymentMethodsTable.cardBrand)
      )
    )
    .orderBy(asc(storePaymentMethodsTable.method))

  if (methods.length === 0) return []

  return methods
    .filter(
      method => method.isActive && (method.allowDelivery || method.allowTakeout)
    )
    .map(method => ({
      method: method.method as DigitalMenuPaymentMethod['method'],
      label:
        paymentMethodLabels[
          method.method as DigitalMenuPaymentMethod['method']
        ],
      instructions: method.instructions,
      proofInstructions: method.proofInstructions,
      pixKey: method.pixKey,
      integrationProvider: method.integrationProvider,
      requiresChangeFor: method.requiresChangeFor,
      availableFor: [
        ...(method.allowDelivery ? ['DELIVERY' as const] : []),
        ...(method.allowTakeout ? ['TAKEOUT' as const] : []),
      ],
    }))
}

const getDeliveryZonesForPublicMenu = async (storeId: number) => {
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
      estimatedDeliveryMinutes:
        storeDeliveryZonesTable.estimatedDeliveryMinutes,
      priority: storeDeliveryZonesTable.priority,
      isActive: storeDeliveryZonesTable.isActive,
    })
    .from(storeDeliveryZonesTable)
    .where(
      and(
        eq(storeDeliveryZonesTable.storeId, storeId),
        eq(storeDeliveryZonesTable.isActive, true)
      )
    )
    .orderBy(
      desc(storeDeliveryZonesTable.priority),
      asc(storeDeliveryZonesTable.name)
    )

  return zones
}

const getPublicPromotionsForStore = async (storeId: number) => {
  const promotionRows = await db
    .select()
    .from(digitalMenuPromotionsTable)
    .where(
      and(
        eq(digitalMenuPromotionsTable.storeId, storeId),
        eq(digitalMenuPromotionsTable.status, 'ACTIVE')
      )
    )
    .orderBy(
      desc(digitalMenuPromotionsTable.priority),
      asc(digitalMenuPromotionsTable.name)
    )

  if (promotionRows.length === 0) return []

  const itemRows = await db
    .select({
      promotionId: digitalMenuPromotionItemsTable.promotionId,
      itemOfferingId: digitalMenuPromotionItemsTable.itemOfferingId,
      promotionalPrice: digitalMenuPromotionItemsTable.promotionalPrice,
    })
    .from(digitalMenuPromotionItemsTable)
    .innerJoin(
      digitalMenuPromotionsTable,
      eq(
        digitalMenuPromotionsTable.id,
        digitalMenuPromotionItemsTable.promotionId
      )
    )
    .where(eq(digitalMenuPromotionsTable.storeId, storeId))

  const itemIdsByPromotion = new Map<number, number[]>()
  for (const row of itemRows) {
    itemIdsByPromotion.set(row.promotionId, [
      ...(itemIdsByPromotion.get(row.promotionId) ?? []),
      row.itemOfferingId,
    ])
  }

  return promotionRows.map(promotion =>
    mapDbPromotionToPublic(
      promotion,
      itemIdsByPromotion.get(promotion.id) ?? []
    )
  )
}

const isPromotionCurrentlyActive = (
  promotion: {
    startsAt: Date | null
    endsAt: Date | null
    usageLimit: number | null
    usedCount: number
  },
  now = new Date()
) => {
  if (promotion.startsAt && promotion.startsAt > now) return false
  if (promotion.endsAt && promotion.endsAt < now) return false
  if (promotion.usageLimit && promotion.usedCount >= promotion.usageLimit)
    return false
  return true
}

const getAvailabilityForStore = async ({
  storeId,
  settings,
  serviceType,
  now = new Date(),
}: {
  storeId: number
  settings: Awaited<ReturnType<typeof getDigitalMenuSettings>>
  serviceType: 'DELIVERY' | 'TAKEOUT'
  now?: Date
}) => {
  const specialHours = await db
    .select({
      date: storeSpecialHoursTable.date,
      reason: storeSpecialHoursTable.reason,
      isClosed: storeSpecialHoursTable.isClosed,
      opensAt: storeSpecialHoursTable.opensAt,
      closesAt: storeSpecialHoursTable.closesAt,
      serviceType: storeSpecialHoursTable.serviceType,
    })
    .from(storeSpecialHoursTable)
    .where(eq(storeSpecialHoursTable.storeId, storeId))

  const businessHours = await db
    .select({
      weekday: storeBusinessHoursTable.weekday,
      opensAt: storeBusinessHoursTable.opensAt,
      closesAt: storeBusinessHoursTable.closesAt,
      serviceType: storeBusinessHoursTable.serviceType,
      isActive: storeBusinessHoursTable.isActive,
    })
    .from(storeBusinessHoursTable)
    .where(eq(storeBusinessHoursTable.storeId, storeId))
    .orderBy(asc(storeBusinessHoursTable.opensAt))

  return evaluateDigitalMenuAvailability({
    settings: {
      ...settings,
      isDigitalMenuEnabled:
        settings.publicationStatus === 'PUBLISHED' &&
        settings.isDigitalMenuEnabled,
    } as DigitalMenuAvailabilitySettings,
    businessHours,
    specialHours,
    serviceType,
    now,
  })
}

const getAvailabilitiesForStore = async ({
  storeId,
  settings,
  now,
}: {
  storeId: number
  settings: Awaited<ReturnType<typeof getDigitalMenuSettings>>
  now?: Date
}) => {
  const [delivery, takeout] = await Promise.all([
    getAvailabilityForStore({
      storeId,
      settings,
      serviceType: 'DELIVERY',
      now,
    }),
    getAvailabilityForStore({ storeId, settings, serviceType: 'TAKEOUT', now }),
  ])

  return { delivery, takeout }
}

const mapOptionGroups = (
  optionGroupsByOffering: Awaited<
    ReturnType<typeof getOptionGroupsByItemOfferingIds>
  >,
  itemOfferingId: number
) => {
  return (optionGroupsByOffering[itemOfferingId] ?? []).map(group => ({
    id: group.id,
    name: group.name,
    minQuantity: group.minQuantity,
    maxQuantity: group.maxQuantity,
    options: group.options.map(option => ({
      id: option.id,
      itemId: option.itemId,
      name: option.item.name,
      price: option.price,
      originalPrice: option.originalPrice,
      minQuantity: option.minQuantity,
      maxQuantity: option.maxQuantity,
      index: option.index,
    })),
  }))
}

const getDigitalMenuBySlugInternal = async (
  rawStoreSlug: string,
  preview = false
): Promise<DigitalMenuData | null> => {
  noStore()

  const storeSlug = normalizeStoreSlug(rawStoreSlug)
  if (!storeSlug) return null

  const store = await db.query.storesTable.findFirst({
    where: eq(storesTable.subdomain, storeSlug),
    columns: {
      id: true,
      name: true,
      subdomain: true,
      status: true,
      statusReason: true,
    },
  })

  if (!store) return null

  const unavailableReason = getUnavailableReason(
    store.status,
    store.statusReason
  )

  if (unavailableReason) {
    const settings = DEFAULT_DIGITAL_MENU_SETTINGS
    return {
      store,
      settings,
      availability: {
        isOpen: false,
        reason: unavailableReason,
        nextOpeningLabel: null,
        canSchedule: false,
        statusLabel: 'Indisponivel',
      },
      availabilities: {
        delivery: {
          isOpen: false,
          reason: unavailableReason,
          nextOpeningLabel: null,
          canSchedule: false,
          statusLabel: 'Indisponivel',
        },
        takeout: {
          isOpen: false,
          reason: unavailableReason,
          nextOpeningLabel: null,
          canSchedule: false,
          statusLabel: 'Indisponivel',
        },
      },
      paymentMethods: [],
      deliveryZones: [],
      promotions: [],
      categories: [],
      unavailableReason,
    }
  }

  const settings = await getDigitalMenuSettings(store.id)
  const effectiveSettings = preview
    ? {
        ...settings,
        publicationStatus: 'PUBLISHED' as const,
        isDigitalMenuEnabled: true,
        isAcceptingOrders: true,
        operationalStatus: 'OPEN' as const,
        manualPauseUntil: null,
      }
    : settings
  const [paymentMethods, deliveryZones, promotions, availabilities] =
    await Promise.all([
      getPaymentMethodsForPublicMenu(store.id),
      getDeliveryZonesForPublicMenu(store.id),
      getPublicPromotionsForStore(store.id),
      preview
        ? Promise.resolve({
            delivery: {
              isOpen: true,
              reason: null,
              nextOpeningLabel: null,
              canSchedule: false,
              statusLabel: 'Previa',
            },
            takeout: {
              isOpen: true,
              reason: null,
              nextOpeningLabel: null,
              canSchedule: false,
              statusLabel: 'Previa',
            },
          })
        : getAvailabilitiesForStore({
            storeId: store.id,
            settings: effectiveSettings,
          }),
    ])
  const availability =
    availabilities.delivery.isOpen || availabilities.delivery.canSchedule
      ? availabilities.delivery
      : availabilities.takeout

  if (
    !availabilities.delivery.isOpen &&
    !availabilities.takeout.isOpen &&
    !availability.canSchedule
  ) {
    return {
      store,
      settings: toPublicSettings(effectiveSettings),
      availability,
      availabilities,
      paymentMethods,
      deliveryZones,
      promotions,
      categories: [],
      unavailableReason: availability.reason ?? undefined,
    }
  }

  const categoryRows = await db
    .select({
      id: categoriesTable.id,
      name: categoriesTable.name,
      description: categoriesTable.description,
      imageUrl: storeFilesTable.url,
    })
    .from(categoriesTable)
    .leftJoin(storeFilesTable, eq(categoriesTable.imageId, storeFilesTable.id))
    .where(
      and(
        eq(categoriesTable.storeId, store.id),
        eq(categoriesTable.isAvailable, true)
      )
    )
    .orderBy(asc(categoriesTable.index), asc(categoriesTable.name))

  const itemRows = await db
    .select({
      itemOfferingId: itemOfferingsTable.id,
      itemId: itemsTable.id,
      categoryId: categoriesTable.id,
      name: itemsTable.name,
      description: itemsTable.description,
      imageUrl: storeFilesTable.url,
      price: itemOfferingsTable.price,
      originalPrice: itemOfferingsTable.originalPrice,
      inventory: itemsTable.inventory,
      externalCode: itemOfferingsTable.externalCode,
      ean: itemsTable.ean,
    })
    .from(itemOfferingsTable)
    .innerJoin(
      categoriesTable,
      eq(itemOfferingsTable.categoryId, categoriesTable.id)
    )
    .innerJoin(itemsTable, eq(itemOfferingsTable.itemId, itemsTable.id))
    .leftJoin(storeFilesTable, eq(itemsTable.imageId, storeFilesTable.id))
    .where(
      and(
        eq(categoriesTable.storeId, store.id),
        eq(categoriesTable.isAvailable, true),
        eq(itemOfferingsTable.isAvailable, true),
        or(isNull(itemsTable.inventory), gt(itemsTable.inventory, 0))
      )
    )
    .orderBy(asc(categoriesTable.index), asc(itemOfferingsTable.index))

  const itemOfferingIds = itemRows.map(item => item.itemOfferingId)
  const activeItemPromotions = promotions.filter(
    promotion =>
      isPromotionCurrentlyActive(promotion) &&
      ['FEATURED_ITEM', 'ITEM_PRICE', 'COMBO'].includes(promotion.type)
  )
  const optionGroupsByOffering =
    itemOfferingIds.length > 0
      ? await getOptionGroupsByItemOfferingIds({
          itemOfferingIds,
          storeId: store.id,
        })
      : {}

  const categoriesById = new Map<number, DigitalMenuCategory>()
  for (const category of categoryRows) {
    categoriesById.set(category.id, {
      id: category.id,
      name: category.name,
      description: category.description,
      imageUrl: category.imageUrl,
      items: [],
    })
  }

  for (const item of itemRows) {
    const category = categoriesById.get(item.categoryId)
    if (!category) continue

    const itemPromotions = activeItemPromotions.filter(promotion =>
      promotion.itemOfferingIds.includes(item.itemOfferingId)
    )
    const itemPricePromotion = itemPromotions.find(
      promotion =>
        promotion.type === 'ITEM_PRICE' &&
        typeof (promotion.metadata as { promotionalPrice?: unknown } | null)
          ?.promotionalPrice === 'string'
    )
    const promotionalPrice =
      (itemPricePromotion?.metadata as { promotionalPrice?: string } | null)
        ?.promotionalPrice ?? null

    const menuItem: DigitalMenuItem = {
      itemOfferingId: item.itemOfferingId,
      itemId: item.itemId,
      categoryId: item.categoryId,
      name: item.name,
      description: item.description,
      imageUrl: item.imageUrl,
      price: promotionalPrice ?? item.price,
      originalPrice: promotionalPrice ? item.price : item.originalPrice,
      promotionalStartsAt: itemPricePromotion?.startsAt?.toISOString() ?? null,
      promotionalEndsAt: itemPricePromotion?.endsAt?.toISOString() ?? null,
      isFeatured: itemPromotions.some(
        promotion => promotion.type === 'FEATURED_ITEM' || promotion.isFeatured
      ),
      promotionBadges: itemPromotions
        .filter(promotion => promotion.type !== 'ITEM_PRICE')
        .map(promotion => promotion.name),
      inventory: item.inventory,
      externalCode: item.externalCode,
      ean: item.ean,
      optionGroups: mapOptionGroups(
        optionGroupsByOffering,
        item.itemOfferingId
      ),
    }

    category.items.push(menuItem)
  }

  return {
    store,
    settings: toPublicSettings(effectiveSettings),
    availability,
    availabilities,
    paymentMethods,
    deliveryZones,
    promotions: promotions.map(promotion => ({
      id: promotion.id,
      code: null,
      name: promotion.name,
      description: promotion.description,
      type: promotion.type,
      minOrderAmount: promotion.minOrderAmount,
      discountAmount: promotion.discountAmount,
      discountPercent: promotion.discountPercent,
      maxDiscountAmount: promotion.maxDiscountAmount,
      freeDeliveryMinimum: promotion.freeDeliveryMinimum,
      itemOfferingIds: promotion.itemOfferingIds,
    })),
    categories: Array.from(categoriesById.values()).filter(
      category => category.items.length > 0
    ),
  }
}

export const submitDigitalMenuOrder = async (
  input: DigitalMenuSubmitInput
): Promise<DigitalMenuSubmissionResult> => {
  noStore()
  const rawInput =
    input && typeof input === 'object' ? input : ({} as DigitalMenuSubmitInput)
  const presentedTrackingToken =
    typeof rawInput.trackingToken === 'string'
      ? rawInput.trackingToken
      : undefined
  const rawStoreSlug =
    typeof rawInput.storeSlug === 'string'
      ? normalizeStoreSlug(rawInput.storeSlug)
      : ''
  const { remoteIp, ipHash, userAgentHash } = await getPublicRequestHashes()
  const securitySecret = getPublicOrderSecuritySecret()
  const rawDeviceId =
    typeof rawInput.deviceId === 'string' ? rawInput.deviceId.trim() : ''
  const rawPhone =
    typeof rawInput.customerPhone === 'string'
      ? rawInput.customerPhone.replace(/\D/g, '').slice(0, 13)
      : ''
  const baseSecurityContext: PublicSecurityContext = {
    ipHash,
    deviceHash: rawDeviceId
      ? hashPublicIdentifier(rawDeviceId, securitySecret)
      : null,
    phoneHash: rawPhone ? hashPublicIdentifier(rawPhone, securitySecret) : null,
    userAgentHash,
  }

  const parsed = submitDigitalMenuOrderSchema.safeParse(rawInput)
  if (!parsed.success) {
    if (rawStoreSlug) {
      const invalidMenu = await getDigitalMenuBySlug(rawStoreSlug)
      if (invalidMenu?.store) {
        const currentRisk = await getPublicOrderRisk(
          invalidMenu.store.id,
          baseSecurityContext
        )
        const riskScore = currentRisk + 20
        await recordPublicSecurityEvent({
          storeId: invalidMenu.store.id,
          eventType: 'INVALID_PAYLOAD',
          context: baseSecurityContext,
          riskScore,
          metadata: { issueCount: parsed.error.issues.length },
        })

        if (riskScore >= PUBLIC_ORDER_RISK.blockScore) {
          await recordPublicSecurityEvent({
            storeId: invalidMenu.store.id,
            eventType: 'TEMPORARILY_BLOCKED',
            context: baseSecurityContext,
            riskScore,
            retryAfterSeconds: PUBLIC_ORDER_RISK.temporaryBlockSeconds,
          })
          return {
            ok: false,
            code: 'TEMPORARILY_BLOCKED',
            message:
              'Recebemos varias tentativas em sequencia. Seu carrinho esta salvo e voce podera tentar novamente em alguns minutos.',
            retryAfterSeconds: PUBLIC_ORDER_RISK.temporaryBlockSeconds,
          }
        }
      }
    }
    return {
      ok: false,
      code: 'VALIDATION_ERROR',
      message: 'Revise os dados do pedido.',
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string>,
    }
  }

  const payload = parsed.data
  const menu = await getDigitalMenuBySlug(payload.storeSlug)

  if (!menu?.store) {
    return { ok: false, message: 'Loja nao encontrada.' }
  }

  const phoneHash = hashPublicIdentifier(payload.customerPhone, securitySecret)
  const securityContext: PublicSecurityContext = {
    ...baseSecurityContext,
    phoneHash,
  }
  const riskScore = await getPublicOrderRisk(menu.store.id, securityContext)
  let captchaStatus: 'not_required' | 'passed' = 'not_required'

  if (riskScore >= PUBLIC_ORDER_RISK.blockScore) {
    await recordPublicSecurityEvent({
      storeId: menu.store.id,
      eventType: 'TEMPORARILY_BLOCKED',
      context: securityContext,
      riskScore,
      retryAfterSeconds: PUBLIC_ORDER_RISK.temporaryBlockSeconds,
    })
    return {
      ok: false,
      code: 'TEMPORARILY_BLOCKED',
      message:
        'Recebemos varias tentativas em sequencia. Seu carrinho esta salvo e voce podera tentar novamente em alguns minutos.',
      retryAfterSeconds: PUBLIC_ORDER_RISK.temporaryBlockSeconds,
    }
  }

  if (riskScore >= PUBLIC_ORDER_RISK.challengeScore) {
    const siteKey = getTurnstileSiteKey()
    if (!payload.captchaToken || !siteKey) {
      await recordPublicSecurityEvent({
        storeId: menu.store.id,
        eventType: 'CAPTCHA_REQUIRED',
        context: securityContext,
        riskScore,
        captchaStatus: 'required',
        metadata: { providerConfigured: !!siteKey },
      })
      return siteKey
        ? {
            ok: false,
            code: 'CAPTCHA_REQUIRED',
            message:
              'Precisamos de uma verificacao rapida antes de enviar seu pedido.',
            challengeSiteKey: siteKey,
          }
        : {
            ok: false,
            code: 'TEMPORARILY_BLOCKED',
            message:
              'A verificacao esta temporariamente indisponivel. Seu carrinho esta salvo; tente novamente em alguns minutos.',
            retryAfterSeconds: PUBLIC_ORDER_RISK.temporaryBlockSeconds,
          }
    }

    const captcha = await verifyTurnstileToken({
      token: payload.captchaToken,
      remoteIp,
    })
    if (!captcha.ok) {
      await recordPublicSecurityEvent({
        storeId: menu.store.id,
        eventType: 'CAPTCHA_FAILED',
        context: securityContext,
        riskScore,
        captchaStatus: 'failed',
        metadata: { reason: captcha.reason },
      })
      return {
        ok: false,
        code: 'CAPTCHA_FAILED',
        message:
          captcha.reason === 'provider_error'
            ? 'Nao foi possivel carregar a verificacao. Confira sua conexao e tente novamente.'
            : 'A verificacao expirou. Faca novamente para enviar o pedido.',
        challengeSiteKey: siteKey,
      }
    }

    captchaStatus = 'passed'
    await recordPublicSecurityEvent({
      storeId: menu.store.id,
      eventType: 'CAPTCHA_PASSED',
      context: securityContext,
      riskScore,
      captchaStatus: 'passed',
    })
  }

  if (menu.unavailableReason) {
    return { ok: false, message: menu.unavailableReason }
  }

  const paymentMethod = menu.paymentMethods.find(
    method =>
      method.method === payload.payment.method &&
      method.availableFor.includes(payload.orderType)
  )

  if (!paymentMethod) {
    return {
      ok: false,
      message: 'Forma de pagamento indisponivel para esta loja.',
    }
  }

  const currentSettings = await getDigitalMenuSettings(menu.store.id)
  const currentPublicSettings = toPublicSettings(currentSettings)
  const orderAvailability = await getAvailabilityForStore({
    storeId: menu.store.id,
    settings: currentSettings,
    serviceType: payload.orderType,
  })
  const scheduledFor = payload.scheduledFor
    ? new Date(payload.scheduledFor)
    : null

  if (scheduledFor) {
    if (!currentSettings.allowScheduledOrders) {
      return {
        ok: false,
        message: 'Esta loja nao aceita pedidos agendados.',
      }
    }

    const now = new Date()
    const minDate = new Date(
      now.getTime() + currentSettings.scheduleMinLeadMinutes * 60 * 1000
    )
    const maxDate = new Date(
      now.getTime() + currentSettings.scheduleMaxDaysAhead * 24 * 60 * 60 * 1000
    )

    if (
      Number.isNaN(scheduledFor.getTime()) ||
      scheduledFor < minDate ||
      scheduledFor > maxDate
    ) {
      return {
        ok: false,
        message: `Escolha um horario entre ${currentSettings.scheduleMinLeadMinutes} minutos e ${currentSettings.scheduleMaxDaysAhead} dias a partir de agora.`,
      }
    }

    const scheduledAvailability = await getAvailabilityForStore({
      storeId: menu.store.id,
      settings: currentSettings,
      serviceType: payload.orderType,
      now: scheduledFor,
    })

    if (!scheduledAvailability.isOpen) {
      return {
        ok: false,
        message:
          scheduledAvailability.reason ||
          'A loja nao atende neste horario agendado.',
      }
    }
  }

  if (!orderAvailability.isOpen && !scheduledFor) {
    return {
      ok: false,
      message:
        orderAvailability.reason ||
        'A loja nao esta recebendo este tipo de pedido agora.',
    }
  }

  const cartItemsForValidation = currentPublicSettings.allowItemObservations
    ? payload.items
    : payload.items.map(item => ({ ...item, comment: undefined }))
  const currentPromotions = await getPublicPromotionsForStore(menu.store.id)
  const normalizedCouponCode = normalizeCouponCode(payload.couponCode)

  let validatedCart
  try {
    const subtotalCart = validateAndPriceDigitalMenuCart({
      items: cartItemsForValidation,
      categories: menu.categories,
      deliveryFee: '0',
      minimumOrderAmount: currentPublicSettings.minimumOrderAmount,
      promotions: currentPromotions,
      couponCode: normalizedCouponCode,
      allowDeliveryPromotions: payload.orderType === 'DELIVERY',
    })
    const deliveryQuote =
      payload.orderType === 'DELIVERY'
        ? quoteDigitalMenuDelivery({
            zones: menu.deliveryZones,
            neighborhood: payload.address?.neighborhood,
            postalCode: payload.address?.postalCode,
            customerLatitude: payload.address?.latitude,
            customerLongitude: payload.address?.longitude,
            subtotal: subtotalCart.subtotal,
            settings: currentPublicSettings,
          })
        : {
            deliveryFee: '0',
            minimumOrderAmount: currentPublicSettings.minimumOrderAmount,
            deliveryZoneId: null,
            deliveryEstimatedMinutes:
              currentPublicSettings.averagePreparationMinutes,
            deliveryZoneSnapshot: null,
          }

    validatedCart = validateAndPriceDigitalMenuCart({
      items: cartItemsForValidation,
      categories: menu.categories,
      deliveryFee: deliveryQuote.deliveryFee,
      minimumOrderAmount: deliveryQuote.minimumOrderAmount,
      deliveryZoneId: deliveryQuote.deliveryZoneId,
      deliveryEstimatedMinutes: deliveryQuote.deliveryEstimatedMinutes,
      promotions: currentPromotions,
      couponCode: normalizedCouponCode,
      allowDeliveryPromotions: payload.orderType === 'DELIVERY',
    })

    if (
      new Decimal(validatedCart.subtotal).lessThan(
        validatedCart.minimumOrderAmount
      )
    ) {
      return {
        ok: false,
        message: `O pedido minimo para esta entrega e ${new Decimal(
          validatedCart.minimumOrderAmount
        )
          .toFixed(2)
          .replace('.', ',')}.`,
      }
    }
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error
          ? error.message
          : 'Nao foi possivel validar o carrinho.',
    }
  }

  const normalizedChangeFor =
    payload.payment.method === 'CASH'
      ? normalizeOptionalMoney(payload.payment.changeFor)
      : null

  if (payload.payment.changeFor && !normalizedChangeFor) {
    return {
      ok: false,
      message: 'Informe um valor valido para o troco.',
    }
  }

  if (
    normalizedChangeFor &&
    new Decimal(normalizedChangeFor).lessThanOrEqualTo(validatedCart.total)
  ) {
    return {
      ok: false,
      message:
        'O valor informado para troco precisa ser maior que o total do pedido.',
    }
  }

  const requestId = crypto.randomUUID()
  const rateLimitIpHash =
    ipHash ?? hashPublicIdentifier('unknown-ip', securitySecret)
  const anyIpHash = hashPublicIdentifier('rate-limit:any-ip', securitySecret)
  const anyPhoneHash = hashPublicIdentifier(
    'rate-limit:any-phone',
    securitySecret
  )
  const trackingToken = createPublicTrackingToken()
  const trackingTokenHash = hashPublicIdentifier(trackingToken, securitySecret)
  const trackingTokenEncrypted = encryptPublicTrackingToken(
    trackingToken,
    securitySecret
  )
  const submittedAt = new Date()
  const trackingExpiresAt = new Date(
    submittedAt.getTime() + PUBLIC_ORDER_TRACKING_TTL_MS
  )
  const requestHash = createRequestHash({
    storeSlug: payload.storeSlug,
    customerName: payload.customerName,
    customerPhone: payload.customerPhone,
    customerDocument: payload.customerDocument ?? null,
    orderNotes: payload.orderNotes ?? null,
    termsAccepted: payload.termsAccepted,
    orderType: payload.orderType,
    scheduledFor: payload.scheduledFor ?? null,
    address: payload.address ?? null,
    payment: payload.payment,
    couponCode: normalizedCouponCode,
    items: cartItemsForValidation,
  })
  const addressSnapshot =
    payload.orderType === 'DELIVERY'
      ? {
          street: sanitizePublicText(payload.address?.street, 160),
          number: sanitizePublicText(payload.address?.number, 30),
          postalCode: sanitizePublicText(payload.address?.postalCode, 16),
          neighborhood: sanitizePublicText(payload.address?.neighborhood, 120),
          complement: sanitizePublicText(payload.address?.complement, 120),
          reference: sanitizePublicText(payload.address?.reference, 180),
          latitude: payload.address?.latitude ?? null,
          longitude: payload.address?.longitude ?? null,
        }
      : null

  try {
    const result = await db.transaction(async tx => {
      const existing = await tx.query.publicOrderSubmissionsTable.findFirst({
        where: and(
          eq(publicOrderSubmissionsTable.storeId, menu.store.id),
          eq(publicOrderSubmissionsTable.idempotencyKey, payload.idempotencyKey)
        ),
        columns: {
          id: true,
          requestId: true,
          requestHash: true,
          status: true,
          totalsSnapshot: true,
          trackingTokenHash: true,
          trackingTokenEncrypted: true,
          trackingExpiresAt: true,
        },
      })

      if (existing) {
        if (existing.requestHash !== requestHash) {
          return {
            ok: false as const,
            message:
              'Este pedido ja foi recebido com outros dados. Revise o carrinho e tente novamente.',
          }
        }

        const totals = existing.totalsSnapshot as { total?: string }
        const reusableTrackingToken =
          recoverActivePublicTrackingToken({
            encryptedToken: existing.trackingTokenEncrypted,
            tokenHash: existing.trackingTokenHash,
            expiresAt: existing.trackingExpiresAt,
            secret: securitySecret,
            now: submittedAt,
          }) ??
          (existing.trackingExpiresAt &&
            existing.trackingExpiresAt > submittedAt &&
            publicTrackingTokenMatches(
              presentedTrackingToken,
              existing.trackingTokenHash,
              securitySecret
            )
            ? presentedTrackingToken
            : null)
        return {
          ok: true as const,
          publicOrderId: existing.id,
          requestId: existing.requestId,
          status: existing.status,
          total: totals.total ?? validatedCart.total,
          reused: true,
          ...(reusableTrackingToken
            ? { trackingToken: reusableTrackingToken }
            : {}),
        }
      }

      const [ipRateLimit] = await tx.execute<{
        allowed: boolean
        retryAfterSeconds: number
      }>(sql`
        select "allowed", "retry_after_seconds" as "retryAfterSeconds"
        from public.consume_public_order_rate_limit(
          ${menu.store.id}, ${rateLimitIpHash}, ${anyPhoneHash},
          ${PUBLIC_ORDER_RATE_LIMIT.windowSeconds},
          ${PUBLIC_ORDER_RATE_LIMIT.windowLimit},
          ${PUBLIC_ORDER_RATE_LIMIT.burstSeconds},
          ${PUBLIC_ORDER_RATE_LIMIT.burstLimit}
        )
      `)

      const [phoneRateLimit] = await tx.execute<{
        allowed: boolean
        retryAfterSeconds: number
      }>(sql`
        select "allowed", "retry_after_seconds" as "retryAfterSeconds"
        from public.consume_public_order_rate_limit(
          ${menu.store.id}, ${anyIpHash}, ${phoneHash},
          ${PUBLIC_ORDER_RATE_LIMIT.windowSeconds},
          ${Math.max(3, PUBLIC_ORDER_RATE_LIMIT.windowLimit - 2)},
          ${PUBLIC_ORDER_RATE_LIMIT.burstSeconds},
          ${PUBLIC_ORDER_RATE_LIMIT.burstLimit}
        )
      `)

      const [deviceRateLimit] = securityContext.deviceHash
        ? await tx.execute<{
            allowed: boolean
            retryAfterSeconds: number
          }>(sql`
            select "allowed", "retry_after_seconds" as "retryAfterSeconds"
            from public.consume_public_order_rate_limit(
              ${menu.store.id}, ${securityContext.deviceHash}, ${anyPhoneHash},
              ${PUBLIC_ORDER_RATE_LIMIT.windowSeconds},
              ${PUBLIC_ORDER_RATE_LIMIT.windowLimit},
              ${PUBLIC_ORDER_RATE_LIMIT.burstSeconds},
              ${PUBLIC_ORDER_RATE_LIMIT.burstLimit}
            )
          `)
        : [{ allowed: true, retryAfterSeconds: 0 }]

      if (
        !ipRateLimit?.allowed ||
        !phoneRateLimit?.allowed ||
        !deviceRateLimit?.allowed
      ) {
        const retryAfterSeconds = Math.max(
          ipRateLimit?.retryAfterSeconds ?? 0,
          phoneRateLimit?.retryAfterSeconds ?? 0,
          deviceRateLimit?.retryAfterSeconds ?? 0,
          1
        )
        await tx.insert(publicOrderSecurityEventsTable).values({
          storeId: menu.store.id,
          eventType: 'RATE_LIMITED',
          ...securityContext,
          riskScore: riskScore + 50,
          captchaStatus,
          retryAfterSeconds,
          metadata: {
            ipLimited: !ipRateLimit?.allowed,
            phoneLimited: !phoneRateLimit?.allowed,
            deviceLimited: !deviceRateLimit?.allowed,
          },
        })
        return {
          ok: false as const,
          code: 'RATE_LIMITED' as const,
          message:
            'Recebemos varias tentativas em sequencia. Seu carrinho esta salvo e voce podera tentar novamente em instantes.',
          retryAfterSeconds,
        }
      }

      const [created] = await tx
        .insert(publicOrderSubmissionsTable)
        .values({
          storeId: menu.store.id,
          requestId,
          idempotencyKey: payload.idempotencyKey,
          requestHash,
          status: 'RECEIVED',
          technicalStatus: 'ACKED',
          salesChannel: 'DIGITAL_MENU',
          orderType: payload.orderType,
          cartSnapshot: toJsonSnapshot(validatedCart.items),
          totalsSnapshot: toJsonSnapshot({
            subtotal: validatedCart.subtotal,
            discountAmount: validatedCart.discountAmount,
            deliveryDiscountAmount: validatedCart.deliveryDiscountAmount,
            deliveryFeeBeforeDiscount: validatedCart.deliveryFeeBeforeDiscount,
            deliveryFee: validatedCart.deliveryFee,
            couponCode: normalizedCouponCode,
            appliedPromotion: validatedCart.appliedPromotion,
            total: validatedCart.total,
          }),
          catalogSnapshot: toJsonSnapshot({
            store: menu.store,
            categories: menu.categories.map(category => ({
              id: category.id,
              name: category.name,
            })),
          }),
          customerSnapshot: toJsonSnapshot({
            name: payload.customerName,
            phone: payload.customerPhone,
            phoneLast4: payload.customerPhone.slice(-4),
            document: payload.customerDocument || null,
            orderNotes: payload.orderNotes || null,
          }),
          addressSnapshot: addressSnapshot
            ? toJsonSnapshot(addressSnapshot)
            : null,
          paymentSnapshot: toJsonSnapshot({
            method: payload.payment.method,
            label: paymentMethod.label,
            changeFor: normalizedChangeFor,
            instructions: paymentMethod.instructions,
            proofInstructions: paymentMethod.proofInstructions,
            pixKey:
              payload.payment.method === 'PIX' ? paymentMethod.pixKey : null,
            integrationProvider: paymentMethod.integrationProvider,
            availableFor: paymentMethod.availableFor,
            status: 'PENDING',
          }),
          deliveryZoneSnapshot:
            validatedCart.deliveryZoneId === null
              ? null
              : toJsonSnapshot(
                  menu.deliveryZones.find(
                    zone => zone.id === validatedCart.deliveryZoneId
                  ) ?? null
                ),
          storeSettingsSnapshot: toJsonSnapshot(currentPublicSettings),
          businessHoursSnapshot: toJsonSnapshot(orderAvailability),
          trackingTokenHash,
          trackingTokenEncrypted,
          trackingExpiresAt,
          customerIpHash: ipHash,
          userAgentHash,
          captchaStatus,
          riskScore,
          termsAcceptedAt: submittedAt,
          scheduledFor,
          submittedAt,
          technicalAckAt: submittedAt,
          sentToStoreAt: submittedAt,
          receivedAt: submittedAt,
          expiresAt: new Date(submittedAt.getTime() + 1000 * 60 * 60 * 2),
        })
        .returning({
          id: publicOrderSubmissionsTable.id,
          requestId: publicOrderSubmissionsTable.requestId,
          status: publicOrderSubmissionsTable.status,
        })

      const nextOrderDisplayId = await getNextOrderDisplayIdForStore({
        storeId: menu.store.id,
        dbSession: tx,
      })

      const [street, number, neighborhood, complement, reference] =
        payload.orderType === 'DELIVERY'
          ? [
              addressSnapshot?.street,
              addressSnapshot?.number,
              addressSnapshot?.neighborhood,
              addressSnapshot?.complement,
              addressSnapshot?.reference,
            ]
          : [null, null, null, null, null]

      const createdOrder = await createOrderOnDb({
        newOrder: {
          displayId: nextOrderDisplayId,
          storeId: menu.store.id,
          type: payload.orderType,
          salesChannel: 'DIGITAL_MENU',
          status: 'PENDING',
          totalPrice: validatedCart.total,
          customerName: payload.customerName,
          customerPhone: payload.customerPhone,
          customerDocument: payload.customerDocument || null,
          orderNotes: payload.orderNotes || null,
          deliveryAddress:
            street && number ? `${street}, ${number}` : (street ?? null),
          deliveryAddressReference: reference ?? null,
          deliveryAddressComplement: complement ?? null,
          deliveryNeighborhood: neighborhood ?? null,
          deliveryFee: validatedCart.deliveryFee,
          couponCode: normalizedCouponCode,
          deliveryZoneId: validatedCart.deliveryZoneId,
          deliveryEstimatedMinutes: validatedCart.deliveryEstimatedMinutes,
          deliveryEta: validatedCart.deliveryEstimatedMinutes
            ? new Date(
                submittedAt.getTime() +
                  validatedCart.deliveryEstimatedMinutes * 60 * 1000
              )
            : null,
          scheduledFor,
          origin: 'cardapio-digital',
          idempotencyKey: payload.idempotencyKey,
          requestId,
          publicTrackingTokenHash: trackingTokenHash,
          publicTrackingTokenEncrypted: trackingTokenEncrypted,
          publicTrackingExpiresAt: trackingExpiresAt,
          snapshot: toJsonSnapshot({
            publicOrderId: created.id,
            cart: validatedCart.items,
            totals: {
              subtotal: validatedCart.subtotal,
              discountAmount: validatedCart.discountAmount,
              deliveryDiscountAmount: validatedCart.deliveryDiscountAmount,
              deliveryFeeBeforeDiscount:
                validatedCart.deliveryFeeBeforeDiscount,
              deliveryFee: validatedCart.deliveryFee,
              minimumOrderAmount: validatedCart.minimumOrderAmount,
              couponCode: normalizedCouponCode,
              appliedPromotion: validatedCart.appliedPromotion,
              total: validatedCart.total,
            },
            deliveryZoneId: validatedCart.deliveryZoneId,
            deliveryEstimatedMinutes: validatedCart.deliveryEstimatedMinutes,
            customer: {
              document: payload.customerDocument || null,
              orderNotes: payload.orderNotes || null,
              termsAcceptedAt: submittedAt.toISOString(),
            },
          }),
          technicalAckAt: submittedAt,
        },
        dbSession: tx,
      })

      await createOrderAuditEventOnDb({
        dbSession: tx,
        event: {
          orderId: createdOrder.id,
          storeId: createdOrder.storeId,
          eventType: 'order_created',
          fromStatus: null,
          toStatus: createdOrder.status,
          actorType: 'customer',
          actorUserId: null,
          origin: 'DIGITAL_MENU',
          requestId,
          metadata: {
            salesChannel: createdOrder.salesChannel,
            orderType: createdOrder.type,
            publicOrderId: created.id,
            displayId: createdOrder.displayId,
          },
          ipHash,
          userAgentHash,
        },
      })

      for (const item of validatedCart.items) {
        const wasInventoryUpdated = await updateOrderItemInventoryOnDb({
          itemId: item.itemId,
          storeId: menu.store.id,
          quantity: item.quantity,
          dbSession: tx,
        })

        if (!wasInventoryUpdated) {
          throw new Error(`${item.itemName} nao possui estoque suficiente.`)
        }

        const createdOrderItem = await createOrderItemOnDb({
          newOrderItem: {
            orderId: createdOrder.id,
            index: item.index,
            itemId: item.itemId,
            itemName: item.itemName,
            categoryId: item.categoryId,
            categoryName: item.categoryName,
            price: item.price,
            originalPrice: item.originalPrice,
            quantity: String(item.quantity),
            externalCode: item.externalCode,
            ean: item.ean,
            comment: item.comment,
          },
          dbSession: tx,
        })

        await createOrderItemOptionsOnDb({
          options: item.options.map(option => ({
            orderItemId: createdOrderItem.id,
            optionGroupName: option.optionGroupName,
            optionName: option.optionName,
            price: option.price,
            quantity: String(option.quantity),
            index: option.index,
          })),
          dbSession: tx,
        })
      }

      await createOrderPaymentOnDb({
        newOrderPayment: {
          orderId: createdOrder.id,
          value: validatedCart.total,
          type: 'PENDING',
          method: payload.payment.method,
          changeFor:
            payload.payment.method === 'CASH' ? normalizedChangeFor : null,
        },
        dbSession: tx,
      })

      if (validatedCart.appliedPromotion) {
        const appliedPromotionConfig = currentPromotions.find(
          promotion =>
            promotion.id === validatedCart.appliedPromotion?.promotionId
        )
        if (appliedPromotionConfig?.perCustomerLimit) {
          await tx.execute(sql`
            select pg_advisory_xact_lock(
              hashtextextended(
                ${`${menu.store.id}:${validatedCart.appliedPromotion.promotionId}:${phoneHash}`},
                0
              )
            )
          `)

          const [customerRedemptions] = await tx
            .select({ total: count() })
            .from(digitalMenuPromotionRedemptionsTable)
            .where(
              and(
                eq(
                  digitalMenuPromotionRedemptionsTable.promotionId,
                  validatedCart.appliedPromotion.promotionId
                ),
                eq(digitalMenuPromotionRedemptionsTable.customerHash, phoneHash)
              )
            )

          if (
            (customerRedemptions?.total ?? 0) >=
            appliedPromotionConfig.perCustomerLimit
          ) {
            throw new DigitalMenuOrderDomainError(
              'Este cupom ja atingiu o limite de uso para este telefone.'
            )
          }
        }

        const updatedPromotions = await tx
          .update(digitalMenuPromotionsTable)
          .set({
            usedCount: sql`${digitalMenuPromotionsTable.usedCount} + 1`,
          })
          .where(
            and(
              eq(
                digitalMenuPromotionsTable.id,
                validatedCart.appliedPromotion.promotionId
              ),
              eq(digitalMenuPromotionsTable.storeId, menu.store.id),
              eq(digitalMenuPromotionsTable.status, 'ACTIVE'),
              or(
                isNull(digitalMenuPromotionsTable.usageLimit),
                sql`${digitalMenuPromotionsTable.usedCount} < ${digitalMenuPromotionsTable.usageLimit}`
              )
            )
          )
          .returning({ id: digitalMenuPromotionsTable.id })

        if (updatedPromotions.length === 0) {
          throw new DigitalMenuOrderDomainError(
            'Este cupom ou promocao acabou de esgotar.'
          )
        }

        await tx.insert(digitalMenuPromotionRedemptionsTable).values({
          promotionId: validatedCart.appliedPromotion.promotionId,
          storeId: menu.store.id,
          orderId: createdOrder.id,
          publicOrderId: created.id,
          customerHash: phoneHash,
          couponCode: normalizedCouponCode,
          discountAmount: validatedCart.discountAmount,
          deliveryDiscountAmount: validatedCart.deliveryDiscountAmount,
          metadata: {
            promotionName: validatedCart.appliedPromotion.name,
            promotionType: validatedCart.appliedPromotion.type,
            requestId,
          },
        })
      }

      await tx
        .update(publicOrderSubmissionsTable)
        .set({ orderId: createdOrder.id })
        .where(eq(publicOrderSubmissionsTable.id, created.id))

      await tx.insert(publicOrderEventsTable).values({
        publicOrderId: created.id,
        storeId: menu.store.id,
        eventType: 'public_order_received',
        fromStatus: null,
        toStatus: 'RECEIVED',
        actorType: 'customer',
        requestId,
        payload: {
          salesChannel: 'DIGITAL_MENU',
          orderType: payload.orderType,
          total: validatedCart.total,
          orderId: createdOrder.id,
          displayId: createdOrder.displayId,
        },
      })

      await tx.insert(publicOrderDeliveryAttemptsTable).values({
        publicOrderId: created.id,
        attempt: 1,
        status: 'acked',
      })

      return {
        ok: true as const,
        publicOrderId: created.id,
        requestId: created.requestId,
        status: created.status,
        total: validatedCart.total,
        reused: false,
        trackingToken,
      }
    })

    return result
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes(
        'public_order_submissions_store_id_idempotency_key_unique'
      )
    ) {
      const existing = await db.query.publicOrderSubmissionsTable.findFirst({
        where: and(
          eq(publicOrderSubmissionsTable.storeId, menu.store.id),
          eq(publicOrderSubmissionsTable.idempotencyKey, payload.idempotencyKey)
        ),
        columns: {
          id: true,
          requestId: true,
          requestHash: true,
          status: true,
          totalsSnapshot: true,
          trackingTokenHash: true,
          trackingTokenEncrypted: true,
          trackingExpiresAt: true,
        },
      })

      if (existing?.requestHash === requestHash) {
        const totals = existing.totalsSnapshot as { total?: string }
        const now = new Date()
        const reusableTrackingToken =
          recoverActivePublicTrackingToken({
            encryptedToken: existing.trackingTokenEncrypted,
            tokenHash: existing.trackingTokenHash,
            expiresAt: existing.trackingExpiresAt,
            secret: securitySecret,
            now,
          }) ??
          (existing.trackingExpiresAt &&
            existing.trackingExpiresAt > now &&
            publicTrackingTokenMatches(
              presentedTrackingToken,
              existing.trackingTokenHash,
              securitySecret
            )
            ? presentedTrackingToken
            : null)
        return {
          ok: true,
          publicOrderId: existing.id,
          requestId: existing.requestId,
          status: existing.status,
          total: totals.total ?? validatedCart.total,
          reused: true,
          ...(reusableTrackingToken
            ? { trackingToken: reusableTrackingToken }
            : {}),
        }
      }

      return {
        ok: false,
        message: 'Este identificador de pedido ja foi usado com outros dados.',
      }
    }

    const domainFailure = getDigitalMenuOrderDomainFailure(error)
    if (domainFailure) return domainFailure

    console.error('Failed to submit digital menu order', {
      requestId,
      storeId: menu.store.id,
      error,
    })

    return {
      ok: false,
      message:
        'Nao conseguimos enviar o pedido agora. Tente novamente em alguns instantes.',
    }
  }
}

export const quoteDigitalMenuCoupon = async (input: {
  storeSlug: string
  couponCode: string
  orderType: 'DELIVERY' | 'TAKEOUT'
  address?: {
    postalCode?: string
    neighborhood?: string
    latitude?: number
    longitude?: number
  }
  items: DigitalMenuCartItemInput[]
}): Promise<
  | {
      ok: true
      couponCode: string
      discountAmount: string
      deliveryDiscountAmount: string
      deliveryFeeBeforeDiscount: string
      deliveryFee: string
      subtotal: string
      total: string
      message: string
    }
  | { ok: false; message: string }
> => {
  noStore()
  const parsed = digitalMenuCouponQuoteSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, message: 'Informe um cupom valido.' }
  }

  const payload = parsed.data
  const menu = await getDigitalMenuBySlug(payload.storeSlug)
  if (!menu?.store) return { ok: false, message: 'Loja nao encontrada.' }

  const { ipHash } = await getPublicRequestHashes()
  const securitySecret = getPublicOrderSecuritySecret()
  const quoteRateLimitHash = hashPublicIdentifier(
    `coupon:${payload.couponCode}`,
    securitySecret
  )
  const [rateLimit] = await db.execute<{
    allowed: boolean
    retryAfterSeconds: number
  }>(sql`
    select *
    from public.consume_public_order_rate_limit(
      ${menu.store.id},
      ${ipHash ?? hashPublicIdentifier('unknown-coupon-ip', securitySecret)},
      ${quoteRateLimitHash},
      ${PUBLIC_ORDER_RATE_LIMIT.windowSeconds},
      ${PUBLIC_ORDER_RATE_LIMIT.windowLimit},
      ${PUBLIC_ORDER_RATE_LIMIT.burstSeconds},
      ${PUBLIC_ORDER_RATE_LIMIT.burstLimit}
    )
  `)

  if (!rateLimit?.allowed) {
    return {
      ok: false,
      message:
        'Muitas tentativas de cupom em sequencia. Aguarde um pouco e tente novamente.',
    }
  }

  const currentSettings = await getDigitalMenuSettings(menu.store.id)
  const currentPublicSettings = toPublicSettings(currentSettings)
  const currentPromotions = await getPublicPromotionsForStore(menu.store.id)

  try {
    const subtotalCart = validateAndPriceDigitalMenuCart({
      items: payload.items,
      categories: menu.categories,
      deliveryFee: '0',
      minimumOrderAmount: currentPublicSettings.minimumOrderAmount,
      allowDeliveryPromotions: payload.orderType === 'DELIVERY',
    })
    const deliveryQuote =
      payload.orderType === 'DELIVERY'
        ? quoteDigitalMenuDelivery({
            zones: menu.deliveryZones,
            neighborhood: payload.address?.neighborhood,
            postalCode: payload.address?.postalCode,
            customerLatitude: payload.address?.latitude,
            customerLongitude: payload.address?.longitude,
            subtotal: subtotalCart.subtotal,
            settings: currentPublicSettings,
          })
        : {
            deliveryFee: '0',
            minimumOrderAmount: currentPublicSettings.minimumOrderAmount,
            deliveryZoneId: null,
            deliveryEstimatedMinutes:
              currentPublicSettings.averagePreparationMinutes,
            deliveryZoneSnapshot: null,
          }

    const validatedCart = validateAndPriceDigitalMenuCart({
      items: payload.items,
      categories: menu.categories,
      deliveryFee: deliveryQuote.deliveryFee,
      minimumOrderAmount: deliveryQuote.minimumOrderAmount,
      deliveryZoneId: deliveryQuote.deliveryZoneId,
      deliveryEstimatedMinutes: deliveryQuote.deliveryEstimatedMinutes,
      promotions: currentPromotions,
      couponCode: payload.couponCode,
      allowDeliveryPromotions: payload.orderType === 'DELIVERY',
    })

    if (!validatedCart.appliedPromotion) {
      return { ok: false, message: 'Cupom nao aplicavel a este pedido.' }
    }

    return {
      ok: true,
      couponCode: payload.couponCode,
      discountAmount: validatedCart.discountAmount,
      deliveryDiscountAmount: validatedCart.deliveryDiscountAmount,
      deliveryFeeBeforeDiscount: validatedCart.deliveryFeeBeforeDiscount,
      deliveryFee: validatedCart.deliveryFee,
      subtotal: validatedCart.subtotal,
      total: validatedCart.total,
      message: validatedCart.appliedPromotion.message,
    }
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error
          ? error.message
          : 'Nao foi possivel validar este cupom.',
    }
  }
}

export const getDigitalMenuBySlug = async (rawStoreSlug: string) =>
  getDigitalMenuBySlugInternal(rawStoreSlug)

export const getDigitalMenuPreviewBySlug = async (rawStoreSlug: string) => {
  const storeSlug = normalizeStoreSlug(rawStoreSlug)
  if (!storeSlug) return null

  const [store] = await db
    .select({ id: storesTable.id })
    .from(storesTable)
    .where(eq(storesTable.subdomain, storeSlug))
    .limit(1)

  if (!store) return null
  await validateUserPermissionsForStore(store.id, 'store.settings.manage')
  return getDigitalMenuBySlugInternal(storeSlug, true)
}

export const getPublicOrderTracking = async (
  rawToken: string
): Promise<PublicOrderTrackingDto | null> => {
  noStore()
  if (!isPublicTrackingToken(rawToken)) return null

  const tokenHash = hashPublicIdentifier(
    rawToken,
    getPublicOrderSecuritySecret()
  )
  const now = new Date()
  const [order] = await db
    .select({
      publicOrderId: publicOrderSubmissionsTable.id,
      displayId: ordersTable.displayId,
      storeName: storesTable.name,
      status: publicOrderSubmissionsTable.status,
      orderType: publicOrderSubmissionsTable.orderType,
      total: ordersTable.totalPrice,
      cartSnapshot: publicOrderSubmissionsTable.cartSnapshot,
      paymentSnapshot: publicOrderSubmissionsTable.paymentSnapshot,
      estimatedMinutes: ordersTable.deliveryEstimatedMinutes,
      submittedAt: publicOrderSubmissionsTable.submittedAt,
      updatedAt: publicOrderSubmissionsTable.updatedAt,
      trackingExpiresAt: publicOrderSubmissionsTable.trackingExpiresAt,
    })
    .from(publicOrderSubmissionsTable)
    .innerJoin(
      storesTable,
      eq(storesTable.id, publicOrderSubmissionsTable.storeId)
    )
    .innerJoin(
      ordersTable,
      and(
        eq(ordersTable.id, publicOrderSubmissionsTable.orderId),
        eq(ordersTable.storeId, publicOrderSubmissionsTable.storeId),
        eq(ordersTable.publicTrackingTokenHash, tokenHash)
      )
    )
    .where(
      and(
        eq(publicOrderSubmissionsTable.trackingTokenHash, tokenHash),
        gt(publicOrderSubmissionsTable.trackingExpiresAt, now)
      )
    )
    .limit(1)

  const trackingExpiresAt = order?.trackingExpiresAt
  if (!order || !trackingExpiresAt) return null

  const events = await db
    .select({
      status: publicOrderEventsTable.toStatus,
      occurredAt: publicOrderEventsTable.createdAt,
    })
    .from(publicOrderEventsTable)
    .where(eq(publicOrderEventsTable.publicOrderId, order.publicOrderId))
    .orderBy(asc(publicOrderEventsTable.createdAt))

  return buildPublicOrderTrackingDto(
    { ...order, trackingExpiresAt },
    events.flatMap(event =>
      event.status
        ? [{ status: event.status, occurredAt: event.occurredAt }]
        : []
    ),
    now
  )
}
