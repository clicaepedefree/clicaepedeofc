import { headers } from 'next/headers'

export type SubdomainContext = 'admin' | 'public'

/**
 * Gets the subdomain context from the middleware-set header.
 * Only works in server components and server actions.
 *
 * @returns The subdomain context ('admin' or 'public')
 */
export async function getSubdomainContext(): Promise<SubdomainContext> {
  const headersList = await headers()
  const context = headersList.get('x-subdomain-context')
  return (context as SubdomainContext) ?? 'public'
}

/**
 * Checks if the current request is from the admin subdomain.
 * Only works in server components and server actions.
 *
 * @returns true if on admin subdomain, false otherwise
 */
export async function isAdminSubdomain(): Promise<boolean> {
  const context = await getSubdomainContext()
  return context === 'admin'
}

/**
 * Client-side detection of admin subdomain.
 * Can be used in client components.
 *
 * @returns true if current hostname starts with 'admin.'
 */
export function isAdminSubdomainClient(): boolean {
  if (typeof window === 'undefined') return false
  const hostname = window.location.hostname
  return hostname.startsWith('admin.')
}
