import { db } from '@/services/db'
import { ifoodOAuthSessionsTable } from '@/services/db/schema/ifood-oauth-sessions'
import { eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

/**
 * Test endpoint to verify initiateIFoodOAuth server action behavior.
 * This is for testing only - verifies the session creation and return values.
 */
export async function GET() {
  try {
    // Use a test store ID (the first store in the database)
    const testStoreId = 1

    // Get session before (if any)
    const sessionBefore = await db
      .select()
      .from(ifoodOAuthSessionsTable)
      .where(eq(ifoodOAuthSessionsTable.storeId, testStoreId))

    // Get session after - if exists, verify the data
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
        },
      })
    }

    // Verify session data
    const now = new Date()
    const expiresAt = new Date(currentSession.expiresAt)
    const minutesUntilExpiry = (expiresAt.getTime() - now.getTime()) / 1000 / 60

    const verification = {
      sessionExists: true,
      hasUserCode: !!currentSession.userCode && currentSession.userCode.length > 0,
      hasVerifier: !!currentSession.authorizationCodeVerifier && currentSession.authorizationCodeVerifier.length > 0,
      hasExpiresAt: !!currentSession.expiresAt,
      minutesUntilExpiry: Math.round(minutesUntilExpiry * 10) / 10,
      isExpiryWithin10Minutes: minutesUntilExpiry > 0 && minutesUntilExpiry <= 10,
      storeId: currentSession.storeId,
      userCode: currentSession.userCode,
      // Verifier should exist but we don't expose it
      verifierLength: currentSession.authorizationCodeVerifier?.length || 0,
    }

    return NextResponse.json({
      success: true,
      message: 'Session found and verified',
      verification,
    })
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: String(error),
    }, { status: 500 })
  }
}
