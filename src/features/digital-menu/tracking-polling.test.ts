import { expect, test } from 'bun:test'
import { publicTrackingRefetchInterval } from './tracking-polling'

test('completed tracking still observes an audited later cancellation until token expiry', () => {
  const now = Date.parse('2026-11-03T00:00:00Z')
  const expiresAt = '2026-11-04T00:00:00Z'
  expect(publicTrackingRefetchInterval({ status: 'COMPLETED', expiresAt }, true, now)).toBe(60_000)
  expect(publicTrackingRefetchInterval({ status: 'ACCEPTED', expiresAt }, true, now)).toBe(15_000)
  for (const status of ['CANCELLED', 'REJECTED', 'EXPIRED'])
    expect(publicTrackingRefetchInterval({ status, expiresAt }, true, now)).toBe(false)
  expect(publicTrackingRefetchInterval({ status: 'COMPLETED', expiresAt }, true, Date.parse(expiresAt))).toBe(false)
  expect(publicTrackingRefetchInterval(null, true, now)).toBe(false)
  expect(publicTrackingRefetchInterval(undefined, false, now)).toBe(15_000)
})
