export function publicTrackingRefetchInterval(
  order: { status: string; expiresAt: string } | null | undefined,
  succeeded: boolean,
  now = Date.now()
): number | false {
  if (!order) return succeeded ? false : 15_000
  if (['CANCELLED', 'REJECTED', 'EXPIRED'].includes(order.status)) return false
  const expires = Date.parse(order.expiresAt)
  if (!Number.isFinite(expires) || expires <= now) return false
  return order.status === 'COMPLETED' ? 60_000 : 15_000
}
