const TURNSTILE_VERIFY_URL =
  'https://challenges.cloudflare.com/turnstile/v0/siteverify'
const TURNSTILE_ACTION = 'digital_menu_checkout'

type TurnstileResponse = {
  success?: boolean
  action?: string
  hostname?: string
  'error-codes'?: string[]
}

export const getTurnstileSiteKey = () =>
  process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim() || null

export const verifyTurnstileToken = async ({
  token,
  remoteIp,
}: {
  token: string
  remoteIp?: string | null
}) => {
  const secret = process.env.TURNSTILE_SECRET_KEY?.trim()
  if (!secret) return { ok: false as const, reason: 'not_configured' as const }

  const body = new URLSearchParams({ secret, response: token })
  if (remoteIp) body.set('remoteip', remoteIp)

  try {
    const response = await fetch(TURNSTILE_VERIFY_URL, {
      method: 'POST',
      body,
      signal: AbortSignal.timeout(5000),
      cache: 'no-store',
    })
    if (!response.ok)
      return { ok: false as const, reason: 'provider_error' as const }

    const result = (await response.json()) as TurnstileResponse
    const allowedHostnames = (process.env.TURNSTILE_ALLOWED_HOSTNAMES ?? '')
      .split(',')
      .map(value => value.trim().toLowerCase())
      .filter(Boolean)
    const hostnameAllowed =
      allowedHostnames.length === 0 ||
      (!!result.hostname &&
        allowedHostnames.includes(result.hostname.toLowerCase()))

    if (
      !result.success ||
      result.action !== TURNSTILE_ACTION ||
      !hostnameAllowed
    ) {
      return { ok: false as const, reason: 'invalid' as const }
    }

    return { ok: true as const }
  } catch {
    return { ok: false as const, reason: 'provider_error' as const }
  }
}
