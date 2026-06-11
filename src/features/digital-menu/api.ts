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
  storeFilesTable,
  storesTable,
} from '@/services/db/schema'
import { and, asc, eq, gt, inArray, isNull, or } from 'drizzle-orm'
import { unstable_noStore as noStore } from 'next/cache'
import { createHash } from 'node:crypto'
import { validateAndPriceDigitalMenuCart } from './cart'
import {
  DigitalMenuCategory,
  DigitalMenuData,
  DigitalMenuItem,
  DigitalMenuSubmissionResult,
  DigitalMenuSubmitInput,
} from './types'
import {
  normalizeStoreSlug,
  sanitizePublicText,
  submitDigitalMenuOrderSchema,
} from './validation'

const DIGITAL_MENU_DELIVERY_FEE = '0'

const createRequestHash = (value: unknown) => {
  return createHash('sha256')
    .update(JSON.stringify(value))
    .digest('hex')
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
    return {
      store,
      categories: [],
      unavailableReason,
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

  let validatedCart
  try {
    validatedCart = validateAndPriceDigitalMenuCart({
      items: payload.items,
      categories: menu.categories,
      deliveryFee: DIGITAL_MENU_DELIVERY_FEE,
    })
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error
          ? error.message
          : 'Nao foi possivel validar o carrinho.',
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
          neighborhood: sanitizePublicText(payload.address?.neighborhood, 120),
          reference: sanitizePublicText(payload.address?.reference, 180),
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
            changeFor: sanitizePublicText(payload.payment.changeFor, 40) || null,
            status: 'PENDING',
          },
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
          origin: 'cardapio-digital',
          idempotencyKey: payload.idempotencyKey,
          requestId,
          snapshot: {
            publicOrderId: created.id,
            cart: validatedCart.items,
            totals: {
              subtotal: validatedCart.subtotal,
              deliveryFee: validatedCart.deliveryFee,
              total: validatedCart.total,
            },
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
              ? sanitizePublicText(payload.payment.changeFor, 40) || null
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
