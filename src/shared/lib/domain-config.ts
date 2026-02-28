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
