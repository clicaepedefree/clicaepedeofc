import { connectIFoodAccountWithCode } from '@/features/ifood/api'
import { requireAuth } from '@/services/auth'
import { NextRequest, NextResponse } from 'next/server'

/**
 * Finalizes iFood connection by storing tokens and merchant selection
 * This is called after the user selects a merchant from the list
 */
export async function POST(request: NextRequest) {
  try {
    // Ensure user is authenticated
    await requireAuth()

    const {
      storeId,
      merchantId,
      accessToken,
      refreshToken,
      expiresIn,
    } = await request.json()

    if (
      !storeId ||
      !merchantId ||
      !accessToken ||
      !refreshToken ||
      !expiresIn
    ) {
      return NextResponse.json(
        {
          error:
            'Store ID, merchant ID, access token, refresh token, and expires in are required',
        },
        { status: 400 }
      )
    }

    // Store the connection in database
    await connectIFoodAccountWithCode(
      storeId,
      merchantId,
      accessToken,
      refreshToken,
      expiresIn
    )

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('iFood connection error:', error)

    const errorMessage =
      error instanceof Error ? error.message : 'Connection failed'

    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    )
  }
}
