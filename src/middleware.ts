import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'

const isPublicRoute = createRouteMatcher([
  '/login(.*)',
  '/api/files(.*)',
  '/api/health(.*)',
  '/api/test-persistence(.*)',
  '/api/test-order-receipt(.*)',
  '/api/test-order-reprint(.*)',
  '/api/test-out-of-stock(.*)',
  '/api/test-cropper(.*)',
  '/api/schema-check(.*)',
  '/api/apply-migration(.*)',
  '/unauthorized(.*)',
  '/test-cropper-interactive(.*)',
])

/**
 * Detects if the request is coming from the admin subdomain.
 * Handles various formats:
 * - admin.domain.com
 * - admin.localhost:3000
 * - admin.127.0.0.1:3000
 */
function detectAdminSubdomain(hostname: string): boolean {
  // Remove port if present
  const hostWithoutPort = hostname.split(':')[0]

  // Check if hostname starts with 'admin.'
  return hostWithoutPort.startsWith('admin.')
}

/**
 * Extracts subdomain context from the request.
 * Returns 'admin' for admin subdomain, 'public' otherwise.
 */
function getSubdomainContext(request: Request): 'admin' | 'public' {
  const hostname = request.headers.get('host') ?? ''
  return detectAdminSubdomain(hostname) ? 'admin' : 'public'
}

export default clerkMiddleware(async (auth, request) => {
  if (!isPublicRoute(request)) {
    await auth.protect()
  }

  // Detect subdomain context
  const subdomainContext = getSubdomainContext(request)

  // Create response with subdomain context header
  const response = NextResponse.next()

  // Set header to indicate subdomain context
  // This can be read by the app for conditional rendering
  response.headers.set('x-subdomain-context', subdomainContext)

  return response
})

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // Always run for API routes
    '/(api|trpc)(.*)',
  ],
}
