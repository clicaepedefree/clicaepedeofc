import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'

/**
 * Test endpoint to check authentication status across subdomains.
 * Used to verify that Clerk sessions persist when switching between
 * main domain and admin subdomain.
 *
 * GET /api/test-auth-status
 * Returns: { authenticated: boolean, userId: string | null, hostname: string }
 */
export async function GET(request: Request) {
  const { userId } = await auth()
  const hostname = request.headers.get('host') ?? 'unknown'

  return NextResponse.json({
    authenticated: !!userId,
    userId: userId,
    hostname: hostname,
    timestamp: new Date().toISOString(),
  })
}
