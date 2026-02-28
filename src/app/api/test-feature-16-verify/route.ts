import { db } from '@/services/db'
import { ifoodIntegrationsTable } from '@/services/db/schema/ifood-integrations'
import { ifoodOAuthSessionsTable } from '@/services/db/schema/ifood-oauth-sessions'
import { eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

/**
 * Test endpoint to verify Feature #16 requirements:
 * - Tokens are encrypted (format: iv:authTag:encryptedData)
 * - OAuth sessions are deleted after connection
 */
export async function GET() {
  try {
    const TEST_STORE_ID = 3

    // Get integration
    const [integration] = await db
      .select()
      .from(ifoodIntegrationsTable)
      .where(eq(ifoodIntegrationsTable.storeId, TEST_STORE_ID))

    // Get any OAuth session (should be none if properly cleaned up)
    const [oauthSession] = await db
      .select()
      .from(ifoodOAuthSessionsTable)
      .where(eq(ifoodOAuthSessionsTable.storeId, TEST_STORE_ID))

    if (!integration) {
      return NextResponse.json({
        success: false,
        error: 'No integration found for store ' + TEST_STORE_ID,
      })
    }

    // Check if tokens look encrypted (format: iv:authTag:encryptedData)
    // AES-256-GCM encrypted tokens should contain colons and be base64-like
    const isAccessTokenEncrypted =
      integration.accessToken.includes(':') &&
      integration.accessToken.split(':').length === 3

    const isRefreshTokenEncrypted =
      integration.refreshToken.includes(':') &&
      integration.refreshToken.split(':').length === 3

    // Verify tokens are NOT plaintext (shouldn't start with common prefixes)
    const accessTokenNotPlaintext =
      !integration.accessToken.startsWith('mock_') &&
      !integration.accessToken.startsWith('eyJ') // JWT format

    const refreshTokenNotPlaintext =
      !integration.refreshToken.startsWith('mock_') &&
      !integration.refreshToken.startsWith('eyJ')

    return NextResponse.json({
      success: true,
      feature: '#16: Complete iFood connection data verification',
      verification: {
        integration: {
          exists: true,
          storeId: integration.storeId,
          merchantId: integration.merchantId,
          merchantName: integration.merchantName,
          catalogId: integration.catalogId,
          catalogName: integration.catalogName,
          status: integration.status,
          tokenExpiresAt: integration.tokenExpiresAt,
        },
        tokenEncryption: {
          accessTokenFormat: integration.accessToken.split(':').length + ' parts',
          accessTokenSample: integration.accessToken.substring(0, 30) + '...',
          isAccessTokenEncrypted,
          accessTokenNotPlaintext,
          refreshTokenFormat: integration.refreshToken.split(':').length + ' parts',
          refreshTokenSample: integration.refreshToken.substring(0, 30) + '...',
          isRefreshTokenEncrypted,
          refreshTokenNotPlaintext,
        },
        oauthSession: {
          exists: !!oauthSession,
          message: oauthSession
            ? 'WARNING: OAuth session still exists - should be deleted after connection'
            : 'OK: No OAuth session found (properly cleaned up)',
        },
        summary: {
          allFieldsStored:
            !!integration.merchantId &&
            !!integration.catalogId &&
            !!integration.catalogName &&
            integration.status === 'connected',
          tokensEncrypted: isAccessTokenEncrypted && isRefreshTokenEncrypted,
          oauthSessionCleanedUp: !oauthSession,
          allChecksPass:
            !!integration.merchantId &&
            !!integration.catalogId &&
            !!integration.catalogName &&
            integration.status === 'connected' &&
            isAccessTokenEncrypted &&
            isRefreshTokenEncrypted &&
            !oauthSession,
        },
      },
    })
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: String(error),
      },
      { status: 500 }
    )
  }
}
