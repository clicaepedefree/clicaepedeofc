import { handleClerkUserDeleted } from '@/features/user/db'
import { verifyWebhook } from '@clerk/nextjs/webhooks'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  try {
    const event = await verifyWebhook(request as Parameters<typeof verifyWebhook>[0])

    if (event.type !== 'user.deleted') {
      return NextResponse.json({ received: true })
    }

    const clerkUserId = event.data.id

    if (!clerkUserId) {
      return NextResponse.json(
        { error: 'Missing Clerk user id' },
        { status: 400 }
      )
    }

    const result = await handleClerkUserDeleted(clerkUserId)

    return NextResponse.json({
      received: true,
      ...result,
    })
  } catch (error) {
    console.error('[Clerk webhook] Verification or handling failed:', error)
    return NextResponse.json(
      { error: 'Invalid Clerk webhook' },
      { status: 400 }
    )
  }
}
