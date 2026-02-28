import { db } from '@/services/db'
import { ifoodOAuthSessionsTable } from '@/services/db/schema/ifood-oauth-sessions'
import { eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

/**
 * Test endpoint to verify iFood OAuth server action behavior.
 * Verifies:
 * - Feature #17: initiateIFoodOAuth creates session with userCode/verifier
 * - Feature #18: exchangeIFoodAuthCode stores encrypted tokens in session
 */
export async function GET() {
  try {
    // Use a test store ID (the first store in the database)
    const testStoreId = 1

    // Get session if exists
    const [currentSession] = await db
      .select()
      .from(ifoodOAuthSessionsTable)
      .where(eq(ifoodOAuthSessionsTable.storeId, testStoreId))

    if (!currentSession) {
      return NextResponse.json({
        success: true,
        message: 'No session found - server action needs to be called first',
        verification: {
          sessionExists: false,
          feature17: { passed: false, reason: 'No session exists' },
          feature18: { passed: false, reason: 'No session exists' },
        },
      })
    }

    // Verify session data
    const now = new Date()
    const expiresAt = new Date(currentSession.expiresAt)
    const minutesUntilExpiry = (expiresAt.getTime() - now.getTime()) / 1000 / 60

    // Feature #17 verification: initiateIFoodOAuth
    const feature17 = {
      passed: !!(currentSession.userCode && currentSession.authorizationCodeVerifier),
      hasUserCode: !!currentSession.userCode && currentSession.userCode.length > 0,
      hasVerifier: !!currentSession.authorizationCodeVerifier && currentSession.authorizationCodeVerifier.length > 0,
      userCode: currentSession.userCode,
      verifierLength: currentSession.authorizationCodeVerifier?.length || 0,
    }

    // Feature #18 verification: exchangeIFoodAuthCode stores encrypted tokens
    const accessToken = currentSession.accessToken
    const refreshToken = currentSession.refreshToken
    const hasAccessToken = !!accessToken && accessToken.length > 0
    const hasRefreshToken = !!refreshToken && refreshToken.length > 0
    const tokensAreEncrypted = hasAccessToken &&
      accessToken.includes(':') && // AES-GCM format: iv:authTag:encrypted
      accessToken.split(':').length === 3

    const feature18 = {
      passed: hasAccessToken && hasRefreshToken && tokensAreEncrypted,
      hasAccessToken,
      hasRefreshToken,
      tokensAreEncrypted,
      accessTokenLength: accessToken?.length || 0,
      refreshTokenLength: refreshToken?.length || 0,
      // The tokens should be encrypted in format: iv:authTag:encrypted (3 parts separated by :)
      accessTokenFormat: hasAccessToken ?
        `${accessToken.split(':').length} parts (expected 3)` : 'N/A',
    }

    const verification = {
      sessionExists: true,
      storeId: currentSession.storeId,
      hasExpiresAt: !!currentSession.expiresAt,
      minutesUntilExpiry: Math.round(minutesUntilExpiry * 10) / 10,
      isExpiryWithin10Minutes: minutesUntilExpiry > 0 && minutesUntilExpiry <= 10,
      feature17,
      feature18,
    }

    return NextResponse.json({
      success: true,
      message: feature18.passed
        ? 'Session found with encrypted tokens (Feature #18 verified)'
        : 'Session found but tokens not yet stored (Feature #17 only)',
      verification,
    })
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: String(error),
    }, { status: 500 })
  }
}
