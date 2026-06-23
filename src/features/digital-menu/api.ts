'use server'

import { getOptionGroupsByItemOfferingIds } from '@/features/option-groups/db'
import {
  createOrderItemOnDb,
  createOrderItemOptionsOnDb,
  createOrderOnDb,
  createOrderPaymentOnDb,
  getNextOrderDisplayIdForStore,
  updateOrderItemInventoryOnDb,
} from '@/features/order/db'
import { db } from '@/services/db'
import {
  categoriesTable,
  itemOfferingsTable,
  itemsTable,
  publicOrderDeliveryAttemptsTable,
  publicOrderEventsTable,
  publicOrderSubmissionsTable,
  storeBusinessHoursTable,
  storeDeliveryZonesTable,
  storeDigitalMenuSettingsTable,
  storeFilesTable,
  storePaymentMethodsTable,
  storeSpecialHoursTable,
  storesTable,
} from '@/services/db/schema'
import { getValueFromCurrencyString } from '@/shared/formatters/currency'
import Decimal from 'decimal.js'
import { and, asc, desc, eq, gt, inArray, isNull, or } from 'drizzle-orm'
import { unstable_noStore as noStore } from 'next/cache'
import { createHash } from 'node:crypto'
import { validateAndPriceDigitalMenuCart } from './cart'
import { quoteDigitalMenuDelivery } from './delivery'
import {
  DigitalMenuCategory,
  DigitalMenuData,
  DigitalMenuDeliveryZone,
  DigitalMenuItem,
  DigitalMenuPaymentMethod,
  DigitalMenuSettings,
  DigitalMenuSubmissionResult,
  DigitalMenuSubmitInput,
} from './types'
import {
  normalizeStoreSlug,
  sanitizePublicText,
  submitDigitalMenuOrderSchema,
} from './validation'

const DEFAULT_DIGITAL_MENU_SETTINGS = {
  whatsappPhone: null,
  isDigitalMenuEnabled: true,
  isAcceptingOrders: true,
  manualPauseReason: null,
  manualPauseUntil: null,
  minimumOrderAmount: '0',
  averagePreparationMinutes: 30,
  allowScheduledOrders: false,
}

const DEFAULT_PAYMENT_METHODS: DigitalMenuPaymentMethod[] = [
  {
    method: 'PIX',
    label: 'Pix',
    instructions: null,
    requiresChangeFor: false,
  },
  {
    method: 'CASH',
    label: 'Dinheiro',
    instructions: null,
    requiresChangeFor: true,
  },
]

const createRequestHash = (value: unknown) => {
  return createHash('sha256')
    .update(JSON.stringify(value))
    .digest('hex')
}

const normalizeOptionalMoney = (value: string | undefined) => {
  const sanitized = sanitizePublicText(value, 40)
  if (!sanitized) return null

  const numericValue = getValueFromCurrencyString(sanitized)
  if (!Number.isFinite(numericValue) || numericValue <= 0) return null

  return new Decimal(numericValue).toFixed(4)
}

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

const formatSaoPauloDateParts = (date = new Date()) => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo',
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)
  const byType = Object.fromEntries(parts.map(part => [part.type, part.value]))
  const weekdayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  }

  return {
    weekday: weekdayMap[byType.weekday] ?? 0,
    date: `${byType.year}-${byType.month}-${byType.day}`,
    time: `${byType.hour}:${byType.minute}:00`,
  }
}

const timeIsBetween = (time: string, opensAt: string, closesAt: string) => {
  return time >= opensAt && time <= closesAt
}

const getDigitalMenuSettings = async (storeId: number) => {
  const [settings] = await db
    .select({
      whatsappPhone: storeDigitalMenuSettingsTable.whatsappPhone,
      isDigitalMenuEnabled: storeDigitalMenuSettingsTable.isDigitalMenuEnabled,
      isAcceptingOrders: storeDigitalMenuSettingsTable.isAcceptingOrders,
      manualPauseReason: storeDigitalMenuSettingsTable.manualPauseReason,
      manualPauseUntil: storeDigitalMenuSettingsTable.manualPauseUntil,
      minimumOrderAmount: storeDigitalMenuSettingsTable.minimumOrderAmount,
      averagePreparationMinutes:
        storeDigitalMenuSettingsTable.averagePreparationMinutes,
      allowScheduledOrders: storeDigitalMenuSettingsTable.allowScheduledOrders,
    })
    .from(storeDigitalMenuSettingsTable)
    .where(eq(storeDigitalMenuSettingsTable.storeId, storeId))
    .limit(1)

  return settings ?? DEFAULT_DIGITAL_MENU_SETTINGS
}

const getPaymentMethodsForPublicMenu = async (storeId: number) => {
  const methods = await db
    .select({
      method: storePaymentMethodsTable.method,
      instructions: storePaymentMethodsTable.instructions,
      requiresChangeFor: storePaymentMethodsTable.requiresChangeFor,
    })
    .from(storePaymentMethodsTable)
    .where(
      and(
        eq(storePaymentMethodsTable.storeId, storeId),
        eq(storePaymentMethodsTable.isActive, true),
        inArray(storePaymentMethodsTable.method, ['CASH', 'PIX'])
      )
    )
    .orderBy(asc(storePaymentMethodsTable.method))

  if (methods.length === 0) return DEFAULT_PAYMENT_METHODS

  return methods.map(method => ({
    method: method.method as 'CASH' | 'PIX',
    label: method.method === 'CASH' ? 'Dinheiro' : 'Pix',
    instructions: method.instructions,
    requiresChangeFor: method.requiresChangeFor,
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
      estimatedDeliveryMinutes: storeDeliveryZonesTable.estimatedDeliveryMinutes,
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
    .orderBy(desc(storeDeliveryZonesTable.priority), asc(storeDeliveryZonesTable.name))

  return zones
}

const getAvailabilityForStore = async ({
  storeId,
  settings,
  serviceType,
}: {
  storeId: number
  settings: Awaited<ReturnType<typeof getDigitalMenuSettings>>
  serviceType: 'DELIVERY' | 'TAKEOUT'
}) => {
  if (!settings.isDigitalMenuEnabled) {
    return {
      isOpen: false,
      reason: 'Cardapio digital desativado para esta loja.',
      nextOpeningLabel: null,
    }
  }

  if (!settings.isAcceptingOrders) {
    return {
      isOpen: false,
      reason: settings.manualPauseReason || 'A loja pausou novos pedidos.',
      nextOpeningLabel: null,
    }
  }

  if (
    settings.manualPauseUntil &&
    settings.manualPauseUntil.getTime() > Date.now()
  ) {
    return {
      isOpen: false,
      reason: settings.manualPauseReason || 'A loja pausou novos pedidos.',
      nextOpeningLabel: null,
    }
  }

  const now = formatSaoPauloDateParts()
  const specialHours = await db
    .select({
      isClosed: storeSpecialHoursTable.isClosed,
      opensAt: storeSpecialHoursTable.opensAt,
      closesAt: storeSpecialHoursTable.closesAt,
    })
    .from(storeSpecialHoursTable)
    .where(
      and(
        eq(storeSpecialHoursTable.storeId, storeId),
        eq(storeSpecialHoursTable.date, now.date),
        or(
          eq(storeSpecialHoursTable.serviceType, serviceType),
          eq(storeSpecialHoursTable.serviceType, 'ALL')
        )
      )
    )

  if (specialHours.some(hour => hour.isClosed)) {
    return {
      isOpen: false,
      reason: 'A loja esta fechada hoje.',
      nextOpeningLabel: null,
    }
  }

  if (specialHours.length > 0) {
    const specialWindowIsOpen = specialHours.some(
      hour =>
        hour.opensAt &&
        hour.closesAt &&
        timeIsBetween(now.time, hour.opensAt, hour.closesAt)
    )

    return {
      isOpen: specialWindowIsOpen,
      reason: specialWindowIsOpen
        ? null
        : 'A loja esta fora do horario de atendimento.',
      nextOpeningLabel: null,
    }
  }

  const businessHours = await db
    .select({
      opensAt: storeBusinessHoursTable.opensAt,
      closesAt: storeBusinessHoursTable.closesAt,
    })
    .from(storeBusinessHoursTable)
    .where(
      and(
        eq(storeBusinessHoursTable.storeId, storeId),
        eq(storeBusinessHoursTable.weekday, now.weekday),
        eq(storeBusinessHoursTable.isActive, true),
        or(
          eq(storeBusinessHoursTable.serviceType, serviceType),
          eq(storeBusinessHoursTable.serviceType, 'ALL')
        )
      )
    )
    .orderBy(asc(storeBusinessHoursTable.opensAt))

  if (businessHours.length === 0) {
    return {
      isOpen: true,
      reason: null,
      nextOpeningLabel: null,
    }
  }

  const currentWindow = businessHours.find(hour =>
    timeIsBetween(now.time, hour.opensAt, hour.closesAt)
  )

  return {
    isOpen: !!currentWindow,
    reason: currentWindow ? null : 'A loja esta fora do horario de atendimento.',
    nextOpeningLabel: businessHours[0]
      ? `Abre as ${businessHours[0].opensAt.slice(0, 5)}`
      : null,
  }
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

export const getDigitalMenuBySlug = async (
  rawStoreSlug: string
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
      },
      paymentMethods: DEFAULT_PAYMENT_METHODS,
      deliveryZones: [],
      categories: [],
      unavailableReason,
    }
  }

  const settings = await getDigitalMenuSettings(store.id)
  const [paymentMethods, deliveryZones, availability] = await Promise.all([
    getPaymentMethodsForPublicMenu(store.id),
    getDeliveryZonesForPublicMenu(store.id),
    getAvailabilityForStore({ storeId: store.id, settings, serviceType: 'DELIVERY' }),
  ])

  if (!availability.isOpen) {
    return {
      store,
      settings: {
        whatsappPhone: settings.whatsappPhone,
        isDigitalMenuEnabled: settings.isDigitalMenuEnabled,
        isAcceptingOrders: settings.isAcceptingOrders,
        manualPauseReason: settings.manualPauseReason,
        minimumOrderAmount: settings.minimumOrderAmount,
        averagePreparationMinutes: settings.averagePreparationMinutes,
        allowScheduledOrders: settings.allowScheduledOrders,
      },
      availability,
      paymentMethods,
      deliveryZones,
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
    .innerJoin(categoriesTable, eq(itemOfferingsTable.categoryId, categoriesTable.id))
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

    const menuItem: DigitalMenuItem = {
      itemOfferingId: item.itemOfferingId,
      itemId: item.itemId,
      categoryId: item.categoryId,
      name: item.name,
      description: item.description,
      imageUrl: item.imageUrl,
      price: item.price,
      originalPrice: item.originalPrice,
      inventory: item.inventory,
      externalCode: item.externalCode,
      ean: item.ean,
      optionGroups: mapOptionGroups(optionGroupsByOffering, item.itemOfferingId),
    }

    category.items.push(menuItem)
  }

  return {
    store,
    settings: {
      whatsappPhone: settings.whatsappPhone,
      isDigitalMenuEnabled: settings.isDigitalMenuEnabled,
      isAcceptingOrders: settings.isAcceptingOrders,
      manualPauseReason: settings.manualPauseReason,
      minimumOrderAmount: settings.minimumOrderAmount,
      averagePreparationMinutes: settings.averagePreparationMinutes,
      allowScheduledOrders: settings.allowScheduledOrders,
    },
    availability,
    paymentMethods,
    deliveryZones,
    categories: Array.from(categoriesById.values()).filter(
      category => category.items.length > 0
    ),
  }
}

export const submitDigitalMenuOrder = async (
  input: DigitalMenuSubmitInput
): Promise<DigitalMenuSubmissionResult> => {
  noStore()

  const parsed = submitDigitalMenuOrderSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      message: 'Revise os dados do pedido.',
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string>,
    }
  }

  const payload = parsed.data
  const menu = await getDigitalMenuBySlug(payload.storeSlug)

  if (!menu?.store) {
    return { ok: false, message: 'Loja nao encontrada.' }
  }

  if (menu.unavailableReason) {
    return { ok: false, message: menu.unavailableReason }
  }

  const paymentMethod = menu.paymentMethods.find(
    method => method.method === payload.payment.method
  )

  if (!paymentMethod) {
    return {
      ok: false,
      message: 'Forma de pagamento indisponivel para esta loja.',
    }
  }

  const currentSettings = await getDigitalMenuSettings(menu.store.id)
  const currentPublicSettings: DigitalMenuSettings = {
    whatsappPhone: currentSettings.whatsappPhone,
    isDigitalMenuEnabled: currentSettings.isDigitalMenuEnabled,
    isAcceptingOrders: currentSettings.isAcceptingOrders,
    manualPauseReason: currentSettings.manualPauseReason,
    minimumOrderAmount: currentSettings.minimumOrderAmount,
    averagePreparationMinutes: currentSettings.averagePreparationMinutes,
    allowScheduledOrders: currentSettings.allowScheduledOrders,
  }
  const orderAvailability = await getAvailabilityForStore({
    storeId: menu.store.id,
    settings: currentSettings,
    serviceType: payload.orderType,
  })

  if (!orderAvailability.isOpen) {
    return {
      ok: false,
      message:
        orderAvailability.reason ||
        'A loja nao esta recebendo este tipo de pedido agora.',
    }
  }

  let validatedCart
  try {
    const subtotalCart = validateAndPriceDigitalMenuCart({
      items: payload.items,
      categories: menu.categories,
      deliveryFee: '0',
      minimumOrderAmount: currentPublicSettings.minimumOrderAmount,
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
      items: payload.items,
      categories: menu.categories,
      deliveryFee: deliveryQuote.deliveryFee,
      minimumOrderAmount: deliveryQuote.minimumOrderAmount,
      deliveryZoneId: deliveryQuote.deliveryZoneId,
      deliveryEstimatedMinutes: deliveryQuote.deliveryEstimatedMinutes,
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
        ).toFixed(2).replace('.', ',')}.`,
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

  if (
    normalizedChangeFor &&
    new Decimal(normalizedChangeFor).lessThan(validatedCart.total)
  ) {
    return {
      ok: false,
      message: 'O valor informado para troco precisa ser maior que o total.',
    }
  }

  const requestId = crypto.randomUUID()
  const submittedAt = new Date()
  const requestHash = createRequestHash({
    storeSlug: payload.storeSlug,
    customerName: payload.customerName,
    customerPhone: payload.customerPhone,
    orderType: payload.orderType,
    address: payload.address ?? null,
    payment: payload.payment,
    items: payload.items,
  })
  const addressSnapshot =
    payload.orderType === 'DELIVERY'
      ? {
          street: sanitizePublicText(payload.address?.street, 160),
          number: sanitizePublicText(payload.address?.number, 30),
          postalCode: sanitizePublicText(payload.address?.postalCode, 16),
          neighborhood: sanitizePublicText(payload.address?.neighborhood, 120),
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
        return {
          ok: true as const,
          publicOrderId: existing.id,
          requestId: existing.requestId,
          status: existing.status,
          total: totals.total ?? validatedCart.total,
          reused: true,
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
          cartSnapshot: validatedCart.items,
          totalsSnapshot: {
            subtotal: validatedCart.subtotal,
            deliveryFee: validatedCart.deliveryFee,
            total: validatedCart.total,
          },
          catalogSnapshot: {
            store: menu.store,
            categories: menu.categories.map(category => ({
              id: category.id,
              name: category.name,
            })),
          },
          customerSnapshot: {
            name: payload.customerName,
            phone: payload.customerPhone,
            phoneLast4: payload.customerPhone.slice(-4),
          },
          addressSnapshot,
          paymentSnapshot: {
            method: payload.payment.method,
            changeFor: normalizedChangeFor,
            instructions: paymentMethod.instructions,
            status: 'PENDING',
          },
          deliveryZoneSnapshot:
            validatedCart.deliveryZoneId === null
              ? null
              : menu.deliveryZones.find(
                  zone => zone.id === validatedCart.deliveryZoneId
                ) ?? null,
          storeSettingsSnapshot: currentPublicSettings,
          businessHoursSnapshot: orderAvailability,
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

      const [street, number, neighborhood, reference] =
        payload.orderType === 'DELIVERY'
          ? [
              addressSnapshot?.street,
              addressSnapshot?.number,
              addressSnapshot?.neighborhood,
              addressSnapshot?.reference,
            ]
          : [null, null, null, null]

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
          deliveryAddress:
            street && number ? `${street}, ${number}` : street ?? null,
          deliveryAddressReference: reference ?? null,
          deliveryNeighborhood: neighborhood ?? null,
          deliveryFee: validatedCart.deliveryFee,
          deliveryZoneId: validatedCart.deliveryZoneId,
          deliveryEstimatedMinutes: validatedCart.deliveryEstimatedMinutes,
          deliveryEta: validatedCart.deliveryEstimatedMinutes
            ? new Date(
                submittedAt.getTime() +
                  validatedCart.deliveryEstimatedMinutes * 60 * 1000
              )
            : null,
          origin: 'cardapio-digital',
          idempotencyKey: payload.idempotencyKey,
          requestId,
          snapshot: {
            publicOrderId: created.id,
            cart: validatedCart.items,
            totals: {
              subtotal: validatedCart.subtotal,
              deliveryFee: validatedCart.deliveryFee,
              minimumOrderAmount: validatedCart.minimumOrderAmount,
              total: validatedCart.total,
            },
            deliveryZoneId: validatedCart.deliveryZoneId,
            deliveryEstimatedMinutes: validatedCart.deliveryEstimatedMinutes,
          },
          technicalAckAt: submittedAt,
        },
        dbSession: tx,
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
            payload.payment.method === 'CASH'
              ? normalizedChangeFor
              : null,
        },
        dbSession: tx,
      })

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
      return {
        ok: false,
        message:
          'Este pedido ja foi recebido. Atualize a pagina antes de tentar novamente.',
      }
    }

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
