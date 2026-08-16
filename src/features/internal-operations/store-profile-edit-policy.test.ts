import { describe, expect, test } from 'bun:test'
import {
  buildInternalStoreProfileChangeSummary,
  getInternalStoreProfileEditFieldErrors,
  hasSensitiveInternalStoreProfileChange,
  internalStoreProfileEditSchema,
  type InternalStoreProfileEditValues,
} from './store-profile-edit-policy'

const validValues: InternalStoreProfileEditValues = {
  storeId: 1,
  storeName: 'Loja QA Centro',
  subdomain: 'loja-qa-centro',
  companyName: 'Loja QA LTDA',
  companyEmail: 'contato@lojaqa.com',
  phone1: '11999991234',
  phone2: '',
  companyTaxNumberReplacement: '',
  responsibleName: 'Maria QA',
  responsibleEmail: 'maria@lojaqa.com',
  responsiblePhone: '11988887777',
  responsibleTaxNumberReplacement: '',
  postalCode: '01001000',
  street: 'Rua QA',
  number: '100',
  district: 'Centro',
  city: 'Sao Paulo',
  stateCode: 'SP',
  acquisitionSource: 'Indicacao',
  salesOwner: 'Bruno',
  internalNotes: 'Cliente veio do piloto.',
  reason: 'Correcao solicitada pelo comercial',
  sensitiveConfirmation: false,
}

describe('internal store profile edit policy', () => {
  test('normalizes editable profile fields before persistence', () => {
    const result = internalStoreProfileEditSchema.safeParse({
      ...validValues,
      storeName: '  Loja   QA  ',
      subdomain: ' Loja QA ',
      companyEmail: ' CONTATO@LOJAQA.COM ',
      phone1: '(11) 99999-1234',
      postalCode: '01001-000',
      stateCode: 'sp',
    })

    expect(result.success).toBe(true)
    if (!result.success) return

    expect(result.data.storeName).toBe('Loja QA')
    expect(result.data.subdomain).toBe('loja-qa')
    expect(result.data.companyEmail).toBe('contato@lojaqa.com')
    expect(result.data.phone1).toBe('11999991234')
    expect(result.data.postalCode).toBe('01001000')
    expect(result.data.stateCode).toBe('SP')
  })

  test('reuses cadastro validations for sensitive documents and address', () => {
    const errors = getInternalStoreProfileEditFieldErrors({
      ...validValues,
      companyTaxNumberReplacement: '00.000.000/0000-00',
      responsibleTaxNumberReplacement: '111.111.111-11',
      postalCode: '123',
    })

    expect(errors.companyTaxNumberReplacement).toBe('Informe um CNPJ valido')
    expect(errors.responsibleTaxNumberReplacement).toBe('Informe um CPF valido')
    expect(errors.postalCode).toBe('Informe um CEP valido')
  })

  test('detects sensitive changes that require explicit confirmation', () => {
    const current = {
      storeName: 'Loja QA Centro',
      subdomain: 'loja-qa-centro',
      companyTaxNumber: '04252011000110',
      responsibleTaxNumber: '52998224725',
      responsibleEmail: 'maria@lojaqa.com',
    }

    expect(
      hasSensitiveInternalStoreProfileChange({
        current,
        values: validValues,
      })
    ).toBe(false)

    expect(
      hasSensitiveInternalStoreProfileChange({
        current,
        values: {
          ...validValues,
          subdomain: 'loja-qa-novo',
        },
      })
    ).toBe(true)

    expect(
      hasSensitiveInternalStoreProfileChange({
        current,
        values: {
          ...validValues,
          companyTaxNumberReplacement: '04252011000110',
        },
      })
    ).toBe(false)

    expect(
      hasSensitiveInternalStoreProfileChange({
        current,
        values: {
          ...validValues,
          responsibleEmail: 'novo@lojaqa.com',
        },
      })
    ).toBe(true)
  })

  test('summarizes before and after fields for the audit reason', () => {
    expect(
      buildInternalStoreProfileChangeSummary({
        before: {
          Loja: 'Loja QA',
          Cidade: 'Sao Paulo',
        },
        after: {
          Loja: 'Loja QA',
          Cidade: 'Campinas',
        },
      })
    ).toBe('Cidade')

    expect(
      buildInternalStoreProfileChangeSummary({
        before: { Loja: 'Loja QA' },
        after: { Loja: 'Loja QA' },
      })
    ).toBe('sem alteracoes cadastrais')
  })
})
