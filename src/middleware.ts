import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { isAdminHostname, stripAdminSubdomain } from '@/shared/lib/domain-config'

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
  '/api/test-auth-status(.*)',
  '/api/test-catalog-id(.*)',
  '/api/test-oauth-session-create(.*)',
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
 * Extracts subdomain context from the request.
 * Returns 'admin' for admin subdomain, 'public' otherwise.
 */
function getSubdomainContext(request: Request): 'admin' | 'public' {
  const hostname = request.headers.get('host') ?? ''
  return isAdminHostname(hostname) ? 'admin' : 'public'
}

/**
 * Gets the protocol for constructing URLs.
 * Uses http for localhost, https for production.
 */
function getProtocol(hostname: string): string {
  return hostname.includes('localhost') || hostname.includes('127.0.0.1')
    ? 'http'
    : 'https'
}

/**
 * Builds a sign-in URL on the main domain with proper redirect back to admin subdomain.
 * This ensures authentication happens on the main domain where cookies are set,
 * then redirects back to the requested page on the admin subdomain.
 *
 * Note: We rebuild the return URL using hostname from headers because request.url
 * might be normalized by Next.js and not contain the correct subdomain.
 */
function buildMainDomainSignInUrl(
  hostname: string,
  pathname: string,
  search: string
): string {
  const mainDomain = stripAdminSubdomain(hostname)
  const protocol = getProtocol(hostname)

  // Build the full URL of where the user wanted to go (on admin subdomain)
  // Using hostname from headers to ensure correct subdomain is included
  const returnUrl = `${protocol}://${hostname}${pathname}${search}`

  // Redirect to login on main domain with redirect_url pointing back to admin subdomain
  return `${protocol}://${mainDomain}/login?redirect_url=${encodeURIComponent(returnUrl)}`
}

export default clerkMiddleware(async (auth, request) => {
  const hostname = request.headers.get('host') ?? ''
  const isAdminSubdomain = isAdminHostname(hostname)
  const url = new URL(request.url)

  // Redirect main-domain-only routes from admin subdomain to main domain
  // This ensures public/non-admin routes are only served from the main domain
  if (isAdminSubdomain && isMainDomainOnlyRoute(request)) {
    const mainDomain = stripAdminSubdomain(hostname)
    const protocol = getProtocol(hostname)
    const absoluteUrl = `${protocol}://${mainDomain}${url.pathname}${url.search}`

    // Use HTML redirect to ensure cross-subdomain redirect works correctly
    // Next.js normalizes Location headers, so we use a client-side redirect
    const html = `<!DOCTYPE html>
<html>
<head>
  <meta http-equiv="refresh" content="0;url=${absoluteUrl}">
  <script>window.location.href="${absoluteUrl}";</script>
</head>
<body>
  <p>Redirecionando para <a href="${absoluteUrl}">${absoluteUrl}</a>...</p>
</body>
</html>`

    return new NextResponse(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    })
  }

  // Handle protected routes
  if (!isPublicRoute(request)) {
    // For admin subdomain, we need to check auth manually and redirect to main domain if not authenticated
    // This prevents the redirect loop where Clerk redirects to /login on the same subdomain
    if (isAdminSubdomain) {
      const { userId } = await auth()

      if (!userId) {
        // User is not authenticated on admin subdomain
        // Redirect to main domain login with return URL back to admin subdomain
        const signInUrl = buildMainDomainSignInUrl(hostname, url.pathname, url.search)

        // Use HTML redirect to ensure cross-subdomain redirect works correctly
        // Next.js normalizes Location headers, so we use a client-side redirect
        const html = `<!DOCTYPE html>
<html>
<head>
  <meta http-equiv="refresh" content="0;url=${signInUrl}">
  <script>window.location.href="${signInUrl}";</script>
</head>
<body>
  <p>Redirecionando para login...</p>
</body>
</html>`

        return new NextResponse(html, {
          status: 200,
          headers: {
            'Content-Type': 'text/html; charset=utf-8',
            'Cache-Control': 'no-store',
          },
        })
      }
      // User is authenticated, continue
    } else {
      // On main domain, use Clerk's default protection
      await auth.protect()
    }
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
