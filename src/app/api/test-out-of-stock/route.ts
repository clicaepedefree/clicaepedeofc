import { checkStockAvailability } from '@/features/order/db'
import { db } from '@/services/db'
import { itemsTable } from '@/services/db/schema/items'
import { categoriesTable } from '@/services/db/schema/categories'
import { OutOfStockError, isOutOfStockError } from '@/shared/errors/out-of-stock-error'
import { eq, and } from 'drizzle-orm'

/**
 * Test endpoint for verifying out-of-stock error handling.
 *
 * GET /api/test-out-of-stock?scenario=out-of-stock|success
 *
 * Tests:
 * 1. scenario=out-of-stock: Creates item with limited inventory, checks if error is returned
 * 2. scenario=success: Creates item with sufficient inventory, should pass
 */
export async function GET(request: Request) {
  const url = new URL(request.url)
  const scenario = url.searchParams.get('scenario') ?? 'out-of-stock'

  try {
    return await db.transaction(async tx => {
      // Find the first store's first category to create test item
      const [firstCategory] = await tx
        .select({ id: categoriesTable.id, storeId: categoriesTable.storeId })
        .from(categoriesTable)
        .limit(1)

      if (!firstCategory) {
        return Response.json(
          { error: 'No categories found. Create a store and category first.' },
          { status: 400 }
        )
      }

      // Create a test item with limited inventory
      const testItemName = 'TEST_ITEM_OUT_OF_STOCK_' + Date.now()
      const inventoryAmount = scenario === 'out-of-stock' ? 2 : 100

      const [testItem] = await tx
        .insert(itemsTable)
        .values({
          storeId: firstCategory.storeId,
          name: testItemName,
          inventory: inventoryAmount,
        })
        .returning()

      try {
        // Check stock availability
        const itemsToCheck = [
          { itemId: testItem.id, quantity: 5 }, // Request more than available
        ]

        const outOfStockItems = await checkStockAvailability({
          items: itemsToCheck,
          dbSession: tx,
        })

        // Cleanup test item
        await tx.delete(itemsTable).where(eq(itemsTable.id, testItem.id))

        if (outOfStockItems.length > 0) {
          // Create the error to verify structure
          const error = new OutOfStockError(outOfStockItems)

          return Response.json(
            {
              success: false,
              error: {
                type: error.type,
                message: error.message,
                items: error.items,
              },
            },
            { status: 422 }
          )
        }

        return Response.json({
          success: true,
          message: 'Stock check passed - all items available',
          testItem: {
            id: testItem.id,
            name: testItem.name,
            inventory: testItem.inventory,
          },
          requestedQuantity: 5,
        })
      } catch (cleanupError) {
        // Cleanup in case of any error
        await tx.delete(itemsTable).where(eq(itemsTable.id, testItem.id))
        throw cleanupError
      }
    })
  } catch (error) {
    console.error('Error in out-of-stock test:', error)

    // Check if this is an OutOfStockError
    if (error instanceof Error && isOutOfStockError(error)) {
      const outOfStockError = error as OutOfStockError
      return Response.json(
        {
          success: false,
          error: {
            type: outOfStockError.type,
            message: outOfStockError.message,
            items: outOfStockError.items,
          },
        },
        { status: 422 }
      )
    }

    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}

/**
 * POST /api/test-out-of-stock
 *
 * Test the actual createOrder flow with out-of-stock items
 * Body: { itemId: number, quantity: number }
 */
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { itemId, quantity = 999 } = body

    if (!itemId) {
      return Response.json(
        { error: 'itemId is required in request body' },
        { status: 400 }
      )
    }

    // Check stock availability
    const outOfStockItems = await db.transaction(async tx => {
      return await checkStockAvailability({
        items: [{ itemId, quantity }],
        dbSession: tx,
      })
    })

    if (outOfStockItems.length > 0) {
      const error = new OutOfStockError(outOfStockItems)
      return Response.json(
        {
          success: false,
          error: {
            type: error.type,
            message: error.message,
            items: error.items,
          },
        },
        { status: 422 }
      )
    }

    return Response.json({
      success: true,
      message: 'Stock available for requested quantity',
      itemId,
      requestedQuantity: quantity,
    })
  } catch (error) {
    console.error('Error in out-of-stock POST test:', error)
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
