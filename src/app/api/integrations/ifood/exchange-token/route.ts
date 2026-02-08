import { IFoodService } from '@/services/ifood'
import { requireAuth } from '@/services/auth'
import { NextRequest, NextResponse } from 'next/server'

/**
 * Exchanges authorization code for access tokens and returns available merchants
 * This is called after the user has authorized the app in iFood Partner Portal
 */
export async function POST(request: NextRequest) {
  try {
    // Ensure user is authenticated
    await requireAuth()

    const { authorizationCode, authorizationCodeVerifier } =
      await request.json()

    if (!authorizationCode || !authorizationCodeVerifier) {
      return NextResponse.json(
        {
          error: 'Authorization code and verifier are required',
        },
        { status: 400 }
      )
    }

    // Exchange the authorization code for tokens
    const tokens = await IFoodService.exchangeCodeForTokens(
      authorizationCode,
      authorizationCodeVerifier
    )

    // Use the access token to get available merchants
    const service = new IFoodService({ accessToken: tokens.accessToken })
    const merchants = await service.getMerchants()

    // Return tokens and merchants list to the frontend
    // Frontend will store tokens temporarily and ask user to select merchant
    return NextResponse.json({
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresIn: tokens.expiresIn,
      merchants,
    })
  } catch (error) {
    console.error('iFood token exchange error:', error)

    const errorMessage =
      error instanceof Error ? error.message : 'Token exchange failed'

    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    )
  }
}
