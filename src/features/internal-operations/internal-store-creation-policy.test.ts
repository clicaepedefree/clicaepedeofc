import { describe, expect, test } from 'bun:test'
import {
  buildSubdomainFromStoreName,
  getInternalStoreCreationFieldErrors,
  getInternalStoreCreationStepErrors,
  internalStoreCreationSchema,
  isInternalStoreCreationStepValid,
  normalizeCurrencyAmount,
  type InternalStoreCreationValues,
} from './internal-store-creation-policy'

const validValues: InternalStoreCreationValues = {
  responsibleName: 'QA Admin',
  responsibleEmail: 'qa.admin@example.com',
  responsiblePhone: '(11) 99999-9999',
  responsibleTaxNumber: '',
  storeName: 'QA Loja Centro',
  subdomain: 'qa-loja-centro',
  companyTaxNumber: '',
  companyName: 'QA Loja Centro',
  phone1: '(11) 3333-3333',
  companyEmail: 'loja@example.com',
  postalCode: '01001-000',
  street: 'Rua QA',
  number: '100',
  district: 'Centro',
  city: 'Sao Paulo',
  stateCode: 'SP',
  planId: 1,
  contractedAmount: '199,90',
  discountType: 'none',
  discountValue: '',
  selectedModuleIds: [1, 2],
  reason: 'Novo cliente aprovado pelo comercial.',
}

describe('internal store creation policy', () => {
  test('accepts the complete payload used by the review step', () => {
    const result = internalStoreCreationSchema.safeParse(validValues)

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.responsibleEmail).toBe('qa.admin@example.com')
      expect(result.data.stateCode).toBe('SP')
    }
  })

  test('validates only the active step while preserving future-step data', () => {
    const values = {
      ...validValues,
      responsibleName: '',
      reason: '',
    }

    expect(isInternalStoreCreationStepValid({ step: 'responsible', values })).toBe(false)
    expect(getInternalStoreCreationStepErrors({ step: 'responsible', values })).toEqual({
      responsibleName: 'Informe o nome do responsavel',
    })
    expect(getInternalStoreCreationStepErrors({ step: 'review', values })).toEqual({
      reason: 'Informe um motivo com pelo menos 8 caracteres',
    })
  })

  test('blocks invalid required fields before finishing the wizard', () => {
    const errors = getInternalStoreCreationFieldErrors({
      ...validValues,
      responsibleEmail: 'email-invalido',
      subdomain: 'admin',
      planId: 0,
      contractedAmount: 'abc',
    })

    expect(errors.responsibleEmail).toBe('Informe um e-mail valido do responsavel')
    expect(errors.subdomain).toBe('Esse endereco e reservado. Tente outro nome.')
    expect(errors.planId).toBe('Selecione um plano')
    expect(errors.contractedAmount).toBe('Informe um valor valido')
  })

  test('blocks zero contract value and percentage discount above 100', () => {
    const zeroValueErrors = getInternalStoreCreationFieldErrors({
      ...validValues,
      contractedAmount: '0',
    })
    const percentageErrors = getInternalStoreCreationFieldErrors({
      ...validValues,
      discountType: 'percentage',
      discountValue: '101',
    })

    expect(zeroValueErrors.contractedAmount).toBe(
      'Informe um valor maior que zero'
    )
    expect(percentageErrors.discountValue).toBe(
      'Informe um percentual ate 100'
    )
  })

  test('normalizes store URL and money values for persistence', () => {
    expect(buildSubdomainFromStoreName('  Clica & Pede Centro  ')).toBe(
      'clica-pede-centro'
    )
    expect(normalizeCurrencyAmount('199,90')).toBe('199.9000')
    expect(normalizeCurrencyAmount('50')).toBe('50.0000')
  })
})
