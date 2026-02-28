import { encrypt } from '@/lib/encryption'
import { db } from '@/services/db'
import { ifoodIntegrationsTable } from '@/services/db/schema/ifood-integrations'
import { eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

/**
 * Test endpoint to verify iFood connection persistence (Feature #29).
 *
 * GET: Check current connection status for store 1
 * POST: Create a mock iFood connection with catalog info
 * DELETE: Remove the test connection
 *
 * This allows testing that:
 * - Connection data persists after page refresh
 * - Catalog name is displayed correctly
 * - Status badge shows "Conectado"
 * - Desconectar and Gerenciar Cardápio buttons appear
 */

const TEST_STORE_ID = 3  // Store 3 has an existing iFood integration

export async function GET() {
  try {
    const [integration] = await db
      .select()
      .from(ifoodIntegrationsTable)
      .where(eq(ifoodIntegrationsTable.storeId, TEST_STORE_ID))

    if (!integration) {
      return NextResponse.json({
        success: true,
        message: 'No iFood connection found for store 1',
        hasConnection: false,
      })
    }

    return NextResponse.json({
      success: true,
      message: 'iFood connection found',
      hasConnection: true,
      connection: {
        id: integration.id,
        storeId: integration.storeId,
        merchantId: integration.merchantId,
        merchantName: integration.merchantName,
        catalogId: integration.catalogId,
        catalogName: integration.catalogName,
        status: integration.status,
        lastSyncAt: integration.lastSyncAt,
        tokenExpiresAt: integration.tokenExpiresAt,
        // Don't expose actual tokens, just verify they exist
        hasAccessToken: !!integration.accessToken,
        hasRefreshToken: !!integration.refreshToken,
      },
    })
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: String(error),
    }, { status: 500 })
  }
}

export async function POST() {
  try {
    // Create a mock connection with all required fields
    const mockAccessToken = encrypt('mock_access_token_' + Date.now())
    const mockRefreshToken = encrypt('mock_refresh_token_' + Date.now())
    const tokenExpiresAt = new Date(Date.now() + 3600 * 1000) // 1 hour from now

    // Use upsert to handle existing connections
    const [integration] = await db
      .insert(ifoodIntegrationsTable)
      .values({
        storeId: TEST_STORE_ID,
        merchantId: 'test-merchant-' + Date.now(),
        merchantName: 'Loja Teste iFood',
        catalogId: 'test-catalog-' + Date.now(),
        catalogName: 'Cardapio Principal',
        accessToken: mockAccessToken,
        refreshToken: mockRefreshToken,
        tokenExpiresAt,
        status: 'connected',
        lastSyncAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [ifoodIntegrationsTable.storeId],
        set: {
          merchantId: 'test-merchant-' + Date.now(),
          merchantName: 'Loja Teste iFood',
          catalogId: 'test-catalog-' + Date.now(),
          catalogName: 'Cardapio Principal',
          accessToken: mockAccessToken,
          refreshToken: mockRefreshToken,
          tokenExpiresAt,
          status: 'connected',
          lastSyncAt: new Date(),
          updatedAt: new Date(),
        },
      })
      .returning()

    return NextResponse.json({
      success: true,
      message: 'Test iFood connection created',
      connection: {
        id: integration.id,
        storeId: integration.storeId,
        merchantId: integration.merchantId,
        merchantName: integration.merchantName,
        catalogId: integration.catalogId,
        catalogName: integration.catalogName,
        status: integration.status,
      },
    })
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: String(error),
    }, { status: 500 })
  }
}

export async function DELETE() {
  try {
    await db
      .delete(ifoodIntegrationsTable)
      .where(eq(ifoodIntegrationsTable.storeId, TEST_STORE_ID))

    return NextResponse.json({
      success: true,
      message: 'Test iFood connection deleted',
    })
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: String(error),
    }, { status: 500 })
  }
}
