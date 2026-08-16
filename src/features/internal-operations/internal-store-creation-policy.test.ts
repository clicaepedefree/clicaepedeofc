import { describe, expect, test } from 'bun:test'
import {
  buildSubdomainFromStoreName,
  getInternalStoreCreationReviewFingerprint,
  getInternalStoreCreationFieldErrors,
  getInternalStoreCreationStepErrors,
  internalStoreCreationSchema,
  isInternalStoreCreationReviewConfirmed,
  isInternalStoreCreationStepValid,
  normalizeCurrencyAmount,
  type InternalStoreCreationValues,
} from './internal-store-creation-policy'

const validValues: InternalStoreCreationValues = {
  responsibleName: 'QA Admin',
  responsibleEmail: 'qa.admin@example.com',
  responsiblePhone: '(11) 99999-9999',
  responsibleTaxNumber: '529.982.247-25',
  storeName: 'QA Loja Centro',
  subdomain: 'qa-loja-centro',
  companyTaxNumber: '04.252.011/0001-10',
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
  sendAccessImmediately: true,
  duplicateOverrideConfirmed: false,
  duplicateReviewToken: '',
  provisioningIdempotencyKey: 'kan-40-idempotency-key',
  reviewConfirmed: false,
  reviewFingerprint: '',
  reason: 'Novo cliente aprovado pelo comercial.',
}

describe('internal store creation policy', () => {
  test('accepts the complete payload used by the review step', () => {
    const result = internalStoreCreationSchema.safeParse(validValues)

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.responsibleEmail).toBe('qa.admin@example.com')
      expect(result.data.responsiblePhone).toBe('11999999999')
      expect(result.data.responsibleTaxNumber).toBe('52998224725')
      expect(result.data.companyTaxNumber).toBe('04252011000110')
      expect(result.data.phone1).toBe('1133333333')
      expect(result.data.postalCode).toBe('01001000')
      expect(result.data.stateCode).toBe('SP')
    }
  })

  test('validates only the active step while preserving future-step data', () => {
    const values = {
      ...validValues,
      responsibleName: '',
      reason: '',
    }

    expect(
      isInternalStoreCreationStepValid({ step: 'responsible', values })
    ).toBe(false)
    expect(
      getInternalStoreCreationStepErrors({ step: 'responsible', values })
    ).toEqual({
      responsibleName: 'Informe o nome do responsavel',
    })
    expect(
      getInternalStoreCreationStepErrors({ step: 'review', values })
    ).toEqual({
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

    expect(errors.responsibleEmail).toBe(
      'Informe um e-mail valido do responsavel'
    )
    expect(errors.subdomain).toBe(
      'Esse endereco e reservado. Tente outro nome.'
    )
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
    expect(percentageErrors.discountValue).toBe('Informe um percentual ate 100')
  })

  test('rejects invalid CPF, CNPJ and phone instead of truncating input', () => {
    const errors = getInternalStoreCreationFieldErrors({
      ...validValues,
      responsibleTaxNumber: '111.111.111-11',
      companyTaxNumber: '00.000.000/0000-00',
      phone1: '119999999999',
      responsiblePhone: '123',
    })

    expect(errors.responsibleTaxNumber).toBe('Informe um CPF valido')
    expect(errors.companyTaxNumber).toBe('Informe um CNPJ valido')
    expect(errors.phone1).toBe('Informe um telefone valido')
    expect(errors.responsiblePhone).toBe('Informe um telefone valido')
  })

  test('normalizes CEP and address fields before persistence', () => {
    const result = internalStoreCreationSchema.safeParse({
      ...validValues,
      postalCode: ' 01001-000 ',
      street: '  Praca   da   Se ',
      number: ' 100   A ',
      district: '  Se ',
      city: ' sao   paulo ',
      stateCode: 'sp',
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.postalCode).toBe('01001000')
      expect(result.data.street).toBe('Praca da Se')
      expect(result.data.number).toBe('100 A')
      expect(result.data.district).toBe('Se')
      expect(result.data.city).toBe('sao paulo')
      expect(result.data.stateCode).toBe('SP')
    }
  })

  test('rejects invalid CEP before persistence', () => {
    const errors = getInternalStoreCreationFieldErrors({
      ...validValues,
      postalCode: '010010000',
    })

    expect(errors.postalCode).toBe('Informe um CEP valido')
  })

  test('normalizes store URL and money values for persistence', () => {
    expect(buildSubdomainFromStoreName('  Clica & Pede Centro  ')).toBe(
      'clica-pede-centro'
    )
    expect(normalizeCurrencyAmount('199,90')).toBe('199.9000')
    expect(normalizeCurrencyAmount('50')).toBe('50.0000')
  })

  test('confirms the exact reviewed payload before creation', () => {
    const reviewFingerprint =
      getInternalStoreCreationReviewFingerprint(validValues)
    const confirmedValues = {
      ...validValues,
      reviewConfirmed: true,
      reviewFingerprint,
    }

    expect(isInternalStoreCreationReviewConfirmed(confirmedValues)).toBe(true)
    expect(
      isInternalStoreCreationReviewConfirmed({
        ...confirmedValues,
        contractedAmount: '299,90',
      })
    ).toBe(false)
    expect(
      isInternalStoreCreationReviewConfirmed({
        ...confirmedValues,
        sendAccessImmediately: false,
      })
    ).toBe(false)
  })
})
