import { describe, expect, test } from 'bun:test'

import {
  getModuleEntitlementOriginLabel,
  getModuleEntitlementStatusLabel,
  normalizeModuleAdditionalAmount,
  storeModuleManagementSchema,
} from './store-module-management-policy'

describe('internal store module management policy', () => {
  test('validates activation for manual, courtesy and addon modules', () => {
    const manual = storeModuleManagementSchema.parse({
      storeId: '1',
      moduleId: '2',
      action: 'activate',
      origin: 'manual',
      additionalAmount: '',
      reason: 'Liberacao aprovada pela operacao.',
    })

    const addon = storeModuleManagementSchema.parse({
      storeId: '1',
      moduleId: '3',
      action: 'activate',
      origin: 'addon',
      additionalAmount: '49,90',
      reason: 'Cliente contratou modulo adicional.',
    })

    expect(manual.origin).toBe('manual')
    expect(addon.origin).toBe('addon')
  })

  test('requires confirmation and entitlement when deactivating a module', () => {
    let rejected = false

    try {
      storeModuleManagementSchema.parse({
        storeId: '1',
        moduleId: '2',
        action: 'deactivate',
        reason: 'Cliente pediu remocao do modulo.',
      })
    } catch {
      rejected = true
    }

    expect(rejected).toBe(true)

    const parsed = storeModuleManagementSchema.parse({
      storeId: '1',
      moduleId: '2',
      entitlementId: '9',
      action: 'deactivate',
      confirmation: 'DESATIVAR',
      reason: 'Cliente pediu remocao do modulo.',
    })

    expect(parsed.entitlementId).toBe(9)
  })

  test('keeps paid values only for addon origin', () => {
    expect(
      normalizeModuleAdditionalAmount({
        origin: 'addon',
        amount: '29,9',
      })
    ).toBe('29.9000')
    expect(
      normalizeModuleAdditionalAmount({
        origin: 'courtesy',
        amount: '29,9',
      })
    ).toBe('0')
  })

  test('formats module labels for internal UI', () => {
    expect(getModuleEntitlementOriginLabel('addon')).toBe('Adicional')
    expect(getModuleEntitlementStatusLabel('revoked')).toBe('Revogado')
    expect(getModuleEntitlementStatusLabel('not_enabled')).toBe('Nao liberado')
  })
})
