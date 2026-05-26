import { describe, expect, test } from 'bun:test'
import {
  normalizeStoreSubdomain,
  onboardingStoreSchema,
} from './onboarding-store-schema'

describe('onboarding store schema', () => {
  test('accepts a valid store name and subdomain', () => {
    const result = onboardingStoreSchema.safeParse({
      name: 'Clica e Pede',
      subdomain: 'clica-e-pede',
    })

    expect(result.success).toBe(true)
  })

  test('rejects reserved subdomains', () => {
    const result = onboardingStoreSchema.safeParse({
      name: 'Minha loja',
      subdomain: 'admin',
    })

    expect(result.success).toBe(false)
  })

  test('normalizes subdomain to lowercase before validation', () => {
    const result = onboardingStoreSchema.safeParse({
      name: 'Minha loja',
      subdomain: 'Minha-Loja',
    })

    expect(result.success).toBe(true)

    if (result.success) {
      expect(result.data.subdomain).toBe('minha-loja')
    }
  })

  test('rejects subdomains with spaces or special characters', () => {
    const result = onboardingStoreSchema.safeParse({
      name: 'Minha loja',
      subdomain: 'minha loja!',
    })

    expect(result.success).toBe(false)
  })

  test('rejects subdomains with hyphen at the start or end', () => {
    const startHyphenResult = onboardingStoreSchema.safeParse({
      name: 'Minha loja',
      subdomain: '-minha-loja',
    })
    const endHyphenResult = onboardingStoreSchema.safeParse({
      name: 'Minha loja',
      subdomain: 'minha-loja-',
    })

    expect(startHyphenResult.success).toBe(false)
    expect(endHyphenResult.success).toBe(false)
  })

  test('normalizes a store name into a public subdomain candidate', () => {
    expect(normalizeStoreSubdomain('  A\u00e7ai & Burg\u00e3o do Buh!!!  ')).toBe(
      'acai-burgao-do-buh'
    )
  })
})
