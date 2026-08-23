/**
 * Domain configuration for environment-based domain settings.
 *
 * Environment Variables:
 * - NEXT_PUBLIC_APP_DOMAIN: The main application domain (e.g., "clicapedidos.com.br")
 * - NEXT_PUBLIC_ADMIN_SUBDOMAIN: The admin subdomain prefix (default: "admin")
 *
 * For local development, these can be left unset to use defaults.
 */

/**
 * Get the configured application domain.
 * Falls back to 'localhost' for local development.
 */
export function getAppDomain(): string {
  return process.env.NEXT_PUBLIC_APP_DOMAIN || 'localhost'
}

/**
 * Get the configured admin subdomain prefix.
 * Default is 'admin'.
 */
export function getAdminSubdomain(): string {
  return process.env.NEXT_PUBLIC_ADMIN_SUBDOMAIN || 'admin'
}

/**
 * Get the full admin hostname (subdomain + domain).
 * For production: "admin.clicapedidos.com.br"
 * For development: "admin.localhost"
 */
export function getAdminHostname(): string {
  const subdomain = getAdminSubdomain()
  const domain = getAppDomain()
  return `${subdomain}.${domain}`
}

/**
 * Get the admin URL with protocol.
 * Uses HTTPS for production, HTTP for localhost.
 */
export function getAdminUrl(): string {
  const hostname = getAdminHostname()
  const protocol = hostname.includes('localhost') ? 'http' : 'https'
  return `${protocol}://${hostname}`
}

/**
 * Get the main app URL with protocol.
 * Uses HTTPS for production, HTTP for localhost.
 */
export function getMainAppUrl(): string {
  const domain = getAppDomain()
  const protocol = domain.includes('localhost') ? 'http' : 'https'
  return `${protocol}://${domain}`
}

function withProtocol(value: string): string {
  if (value.startsWith('http://') || value.startsWith('https://')) {
    return value
  }

  const protocol =
    value.includes('localhost') || value.includes('127.0.0.1') ? 'http' : 'https'

  return `${protocol}://${value}`
}

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '')
}

/**
 * Get a public app base URL for customer-facing links.
 *
 * Vercel exposes VERCEL_URL as the generated deployment URL, which can be a
 * protected preview host. Links sent to customers must prefer the canonical
 * production domain whenever it is available.
 */
export function getPublicAppBaseUrl(): string {
  const explicitUrl = process.env.NEXT_PUBLIC_APP_URL ?? process.env.APP_URL

  if (explicitUrl) return stripTrailingSlash(withProtocol(explicitUrl))

  const configuredDomain = process.env.NEXT_PUBLIC_APP_DOMAIN

  if (configuredDomain) return stripTrailingSlash(withProtocol(configuredDomain))

  const vercelProductionUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL

  if (vercelProductionUrl) {
    return stripTrailingSlash(withProtocol(vercelProductionUrl))
  }

  if (process.env.VERCEL_URL) {
    return stripTrailingSlash(withProtocol(process.env.VERCEL_URL))
  }

  return 'http://localhost:3000'
}

/**
 * Check if a hostname matches the admin subdomain pattern.
 * This is used in middleware for subdomain detection.
 *
 * @param hostname - The hostname to check (e.g., "admin.clicapedidos.com.br")
 * @returns true if the hostname is an admin subdomain
 */
export function isAdminHostname(hostname: string): boolean {
  const adminSubdomain = getAdminSubdomain()

  // Remove port if present
  const hostWithoutPort = hostname.split(':')[0]

  // Check if hostname starts with the admin subdomain prefix
  return hostWithoutPort.startsWith(`${adminSubdomain}.`)
}

/**
 * Get the main domain from an admin subdomain hostname.
 * Removes the admin subdomain prefix.
 *
 * @example
 * stripAdminSubdomain('admin.localhost:3000') // 'localhost:3000'
 * stripAdminSubdomain('admin.example.com') // 'example.com'
 */
export function stripAdminSubdomain(hostname: string): string {
  const adminSubdomain = getAdminSubdomain()
  const prefix = `${adminSubdomain}.`

  if (hostname.startsWith(prefix)) {
    return hostname.slice(prefix.length)
  }
  return hostname
}

/**
 * Check if we're running in development mode.
 */
export function isDevelopment(): boolean {
  return process.env.NODE_ENV !== 'production'
}
