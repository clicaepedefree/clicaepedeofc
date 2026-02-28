import { db } from '@/services/db'
import { ordersTable, storesTable } from '@/services/db/schema'
import { OrderTemplate } from '@/features/receipt/templates/order'
import { getValueFromCurrencyString } from '@/shared/formatters/currency'
import { desc, eq } from 'drizzle-orm'

/**
 * Test endpoint for order reprint functionality.
 * GET /api/test-order-reprint - Returns receipt SVG for the most recent order
 * GET /api/test-order-reprint?orderId=123 - Returns receipt SVG for specific order
 */
export async function GET(request: Request) {
  const url = new URL(request.url)
  const orderIdParam = url.searchParams.get('orderId')

  try {
    // Find an order to reprint
    let order
    if (orderIdParam) {
      order = await db.query.ordersTable.findFirst({
        where: eq(ordersTable.id, parseInt(orderIdParam)),
        with: {
          items: {
            with: {
              options: true,
            },
          },
          payments: true,
        },
      })
    } else {
      // Get the most recent order
      order = await db.query.ordersTable.findFirst({
        orderBy: [desc(ordersTable.createdAt)],
        with: {
          items: {
            with: {
              options: true,
            },
          },
          payments: true,
        },
      })
    }

    if (!order) {
      return new Response(
        JSON.stringify({ error: 'No orders found', hint: 'Create an order first via POS' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Get store name
    const [store] = await db
      .select({ name: storesTable.name })
      .from(storesTable)
      .where(eq(storesTable.id, order.storeId))

    // Transform order items to receipt format
    const receiptItems = order.items.map(item => ({
      itemName: item.itemName,
      quantity: Number(item.quantity),
      unitPrice: getValueFromCurrencyString(item.price),
      totalPrice: getValueFromCurrencyString(item.price) * Number(item.quantity) +
        (item.options ?? []).reduce(
          (sum, opt) => sum + getValueFromCurrencyString(opt.price ?? '0') * Number(opt.quantity),
          0
        ) * Number(item.quantity),
      options: (item.options ?? []).map(opt => ({
        optionName: opt.optionName,
        optionQuantity: Number(opt.quantity),
        optionPrice: opt.price ? getValueFromCurrencyString(opt.price) : undefined,
      })),
      comment: item.comment,
    }))

    // Transform order payments to receipt format
    const receiptPayments = order.payments.map(payment => ({
      method: payment.method,
      value: getValueFromCurrencyString(payment.value),
      changeFor: payment.changeFor ? getValueFromCurrencyString(payment.changeFor) : null,
    }))

    // Generate receipt SVG
    const receiptSvg = await OrderTemplate.render({
      storeName: store?.name,
      displayId: order.displayId,
      createdAt: order.createdAt,
      orderType: order.type,
      posCounterName: order.posCounterName,
      items: receiptItems,
      totalPrice: getValueFromCurrencyString(order.totalPrice),
      payments: receiptPayments,
    })

    // Return as SVG
    return new Response(receiptSvg, {
      status: 200,
      headers: {
        'Content-Type': 'image/svg+xml',
        'X-Order-Id': order.id.toString(),
        'X-Order-DisplayId': order.displayId,
      },
    })
  } catch (error) {
    console.error('[test-order-reprint] Error:', error)
    return new Response(
      JSON.stringify({
        error: 'Failed to generate receipt',
        message: error instanceof Error ? error.message : String(error),
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}
