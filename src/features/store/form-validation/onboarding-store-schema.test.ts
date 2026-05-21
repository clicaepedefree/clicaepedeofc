import { describe, expect, test } from 'bun:test'
import { onboardingStoreSchema } from './onboarding-store-schema'

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
})
