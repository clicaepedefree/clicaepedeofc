import { describe, expect, test } from 'bun:test'
import { createHash } from 'node:crypto'
import {
  createPublicOrderRequestHash,
  matchesPublicOrderRequestHash,
} from './order-request-hash'

const input = {
  storeSlug: 'qa',
  customerPhone: 'synthetic',
  items: [{ itemId: 1, quantity: 1 }],
  payment: { method: 'PIX' },
}
const legacyAttribution = {
  source: 'whatsapp_bot',
  conversationId: 'old',
  visitId: 'technical',
}
const oldHash = (value: unknown) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex')

describe('public order retry identity excludes optional analytics', () => {
  test('late or different attribution cannot change commercial replay identity', () => {
    const expected = createPublicOrderRequestHash(input)
    expect(
      createPublicOrderRequestHash({ ...input, attribution: legacyAttribution })
    ).toBe(expected)
    expect(
      createPublicOrderRequestHash({
        ...input,
        attribution: { visitId: 'different' },
      })
    ).toBe(expected)
    expect(
      matchesPublicOrderRequestHash({
        input,
        existingHash: expected,
        existingAttribution: legacyAttribution,
      })
    ).toBe(true)
  })
  test('pre-deploy attributed requests use their original persisted snapshot for replay', () => {
    const existingHash = oldHash({ ...input, attribution: legacyAttribution })
    expect(
      matchesPublicOrderRequestHash({
        input,
        existingHash,
        existingAttribution: legacyAttribution,
      })
    ).toBe(true)
    expect(
      matchesPublicOrderRequestHash({
        input,
        existingHash,
        existingAttribution: { visitId: 'other' },
      })
    ).toBe(false)
  })
  test('commercial edits remain conflicting, with both legacy and current hashes', () => {
    for (const existingHash of [
      createPublicOrderRequestHash(input),
      oldHash({ ...input, attribution: legacyAttribution }),
    ])
      expect(
        matchesPublicOrderRequestHash({
          input: { ...input, items: [{ itemId: 1, quantity: 2 }] },
          existingHash,
          existingAttribution: legacyAttribution,
        })
      ).toBe(false)
  })
  test('legacy JSONB key reordering does not reject the original attributed order', () => {
    const original = { source:'whatsapp_bot', medium:'assistant', campaign:'digital_menu_cta',
      conversationId:'historical-id', messageId:'assistant:old', entryUrl:'https://menu.test/?historical=query' }
    const reordered = Object.fromEntries(Object.entries(original).reverse())
    expect(matchesPublicOrderRequestHash({ input, existingHash:oldHash({...input,attribution:original}),
      existingAttribution:reordered })).toBe(true)
  })
})
