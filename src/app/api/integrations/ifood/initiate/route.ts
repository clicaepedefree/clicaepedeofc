import { requireAuth } from '@/services/auth'
import { NextRequest, NextResponse } from 'next/server'

const IFOOD_API_BASE_URL =
  process.env.IFOOD_API_BASE_URL || 'https://merchant-api.ifood.com.br'
const IFOOD_CLIENT_ID = process.env.NEXT_PUBLIC_IFOOD_CLIENT_ID

interface UserCodeResponse {
  userCode: string
  authorizationCodeVerifier: string
  verificationUrl: string
  verificationUrlComplete: string
  expiresIn: number
}

/**
 * Initiates iFood OAuth flow by generating a userCode
 * This follows iFood's distributed app authentication pattern
 */
export async function POST(request: NextRequest) {
  try {
    // Ensure user is authenticated
    await requireAuth()

    if (!IFOOD_CLIENT_ID) {
      return NextResponse.json(
        { error: 'iFood client ID not configured' },
        { status: 500 }
      )
    }

    const { storeId } = await request.json()

    if (!storeId) {
      return NextResponse.json(
        { error: 'Store ID is required' },
        { status: 400 }
      )
    }

    // Call iFood API to generate userCode
    const response = await fetch(
      `${IFOOD_API_BASE_URL}/authentication/v1.0/oauth/userCode`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          clientId: IFOOD_CLIENT_ID,
        }),
      }
    )

    if (!response.ok) {
      const errorText = await response.text()
      console.error('iFood userCode generation failed:', errorText)
      return NextResponse.json(
        { error: 'Failed to generate user code' },
        { status: response.status }
      )
    }

    const data: UserCodeResponse = await response.json()
    console.log('data', data)

    // Return the userCode and verifier to the client
    // The verifier needs to be stored temporarily (we'll use sessionStorage on client)
    return NextResponse.json({
      userCode: data.userCode,
      authorizationCodeVerifier: data.authorizationCodeVerifier,
      verificationUrl: data.verificationUrl,
      verificationUrlComplete: data.verificationUrlComplete,
      expiresIn: data.expiresIn,
    })
  } catch (error) {
    console.error('iFood OAuth initiation error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
