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
  '/api/test-ifood-oauth(.*)',
  '/api/schema-check(.*)',
  '/api/apply-migration(.*)',
  '/unauthorized(.*)',
  '/test-cropper-interactive(.*)',
  '/test-ifood-modal(.*)',
])

/**
 * Routes that should only be served from the main domain, not the admin subdomain.
 * These are public or non-admin routes.
 *
 * Routes NOT in this list (admin routes) can be accessed from both domains.
 */
const isMainDomainOnlyRoute = createRouteMatcher([
  '/', // Root page
  '/login(.*)', // Login pages
  '/admin-onboarding(.*)', // Onboarding
  '/unauthorized(.*)', // Unauthorized page
  '/test-(.*)', // Test/dev pages
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

/**
 * Removes the 'admin.' prefix from a hostname to get the main domain.
 * @example
 * getMainDomain('admin.localhost:3000') // 'localhost:3000'
 * getMainDomain('admin.example.com') // 'example.com'
 */
function getMainDomain(hostname: string): string {
  if (hostname.startsWith('admin.')) {
    return hostname.slice(6) // Remove 'admin.' prefix
  }
  return hostname
}

export default clerkMiddleware(async (auth, request) => {
  const hostname = request.headers.get('host') ?? ''
  const isAdminSubdomain = detectAdminSubdomain(hostname)
  const url = new URL(request.url)

  // Redirect main-domain-only routes from admin subdomain to main domain
  // This ensures public/non-admin routes are only served from the main domain
  if (isAdminSubdomain && isMainDomainOnlyRoute(request)) {
    const mainDomain = getMainDomain(hostname)
    // Use request URL's protocol, or default to http for localhost
    const protocol = hostname.includes('localhost') ? 'http' : 'https'
    const absoluteRedirectUrl = `${protocol}://${mainDomain}${url.pathname}${url.search}`

    // Create redirect response manually to ensure absolute URL is used
    return new NextResponse(null, {
      status: 307,
      headers: {
        Location: absoluteRedirectUrl,
      },
    })
  }

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
