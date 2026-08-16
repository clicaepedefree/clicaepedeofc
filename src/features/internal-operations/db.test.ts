import { describe, expect, test } from 'bun:test'
import {
  buildInternalStoreInitialInvoiceNumber,
  getInvoiceReceivableAmount,
  getInternalStoreProvisioningPayloadHash,
  getMonthlyContractedRevenue,
  parseStoreStatus,
  parseInternalDashboardAmount,
  shouldCreateInternalStoreInitialInvoice,
} from './db'
import type { InternalStoreCreationValues } from './internal-store-creation-policy'

const provisioningValues: InternalStoreCreationValues = {
  responsibleName: 'QA Admin',
  responsibleEmail: 'qa.admin@example.com',
  responsiblePhone: '11999999999',
  responsibleTaxNumber: '52998224725',
  storeName: 'QA Loja Centro',
  subdomain: 'qa-loja-centro',
  companyTaxNumber: '04252011000110',
  companyName: 'QA Loja Centro',
  phone1: '1133333333',
  companyEmail: 'loja@example.com',
  postalCode: '01001000',
  street: 'Praca da Se',
  number: '100',
  district: 'Se',
  city: 'Sao Paulo',
  stateCode: 'SP',
  planId: 1,
  contractedAmount: '199.9000',
  discountType: 'none',
  discountValue: '',
  selectedModuleIds: [1, 2],
  sendAccessImmediately: true,
  duplicateOverrideConfirmed: false,
  duplicateReviewToken: '',
  provisioningIdempotencyKey: 'kan-40-idempotency-key',
  reviewConfirmed: true,
  reviewFingerprint: '',
  reason: 'Novo cliente aprovado pelo comercial.',
}

describe('internal operation store policy', () => {
  test('accepts only known store lifecycle statuses for internal filters', () => {
    expect(parseStoreStatus('implementing')).toBe('implementing')
    expect(parseStoreStatus('active')).toBe('active')
    expect(parseStoreStatus('inactive')).toBe('inactive')
    expect(parseStoreStatus('pending_recovery')).toBe('pending_recovery')
    expect(parseStoreStatus('archived')).toBe('archived')
    expect(parseStoreStatus('deleted')).toBe(undefined)
    expect(parseStoreStatus(undefined)).toBe(undefined)
  })

  test('builds deterministic initial invoice numbers from provisioned ids', () => {
    expect(
      buildInternalStoreInitialInvoiceNumber({
        storeId: 123,
        subscriptionId: 456,
      })
    ).toBe('CP-123-456-001')
  })

  test('creates initial invoice only for active non-trial subscriptions', () => {
    expect(shouldCreateInternalStoreInitialInvoice('active')).toBe(true)
    expect(shouldCreateInternalStoreInitialInvoice('trialing')).toBe(false)
  })

  test('normalizes contracted revenue to monthly values', () => {
    expect(
      getMonthlyContractedRevenue({
        contractedAmount: '199.90',
        billingInterval: 'monthly',
        billingIntervalCount: 1,
      })
    ).toBe(199.9)
    expect(
      getMonthlyContractedRevenue({
        contractedAmount: '599.70',
        billingInterval: 'quarterly',
        billingIntervalCount: 1,
      })
    ).toBe(199.9)
    expect(
      getMonthlyContractedRevenue({
        contractedAmount: '2398.80',
        billingInterval: 'annual',
        billingIntervalCount: 1,
      })
    ).toBe(199.9)
  })

  test('calculates open invoice receivables from invoice balance', () => {
    expect(
      getInvoiceReceivableAmount({
        totalAmount: '200.00',
        amountPaid: '50.00',
      })
    ).toBe(150)
    expect(
      getInvoiceReceivableAmount({
        totalAmount: '100.00',
        amountPaid: '150.00',
      })
    ).toBe(0)
  })

  test('ignores invalid dashboard amounts instead of leaking NaN', () => {
    expect(parseInternalDashboardAmount('abc')).toBe(0)
    expect(parseInternalDashboardAmount(null)).toBe(0)
    expect(parseInternalDashboardAmount('10.50')).toBe(10.5)
  })

  test('hashes provisioning payload for idempotent retries without duplicate review token noise', () => {
    const firstHash =
      getInternalStoreProvisioningPayloadHash(provisioningValues)
    const secondHash = getInternalStoreProvisioningPayloadHash({
      ...provisioningValues,
      duplicateOverrideConfirmed: true,
      duplicateReviewToken: 'server-signed-token',
      reviewConfirmed: false,
      reviewFingerprint: 'outdated-review',
    })
    const changedPayloadHash = getInternalStoreProvisioningPayloadHash({
      ...provisioningValues,
      storeName: 'Outra Loja',
    })

    expect(firstHash).toHaveLength(64)
    expect(secondHash).toBe(firstHash)
    expect(changedPayloadHash === firstHash).toBe(false)
  })
})
