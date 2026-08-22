import { describe, expect, test } from 'bun:test'
import {
  authorizeBillingCronRequest,
  maxBillingInvoiceLeadDays,
  maxBillingCronRunLimit,
  parseBillingCronInteger,
  resolveBillingCronConfig,
  isBillingCronRunSuccessful,
} from './billing-cron-policy'

describe('billing cron policy', () => {
  test('normalizes integer configuration deterministically', () => {
    expect(
      parseBillingCronInteger({
        value: '10',
        fallback: 7,
        min: 0,
      })
    ).toBe(10)
    expect(
      parseBillingCronInteger({
        value: '10.9',
        fallback: 7,
        min: 0,
      })
    ).toBe(10)
    expect(
      parseBillingCronInteger({
        value: '0',
        fallback: 7,
        min: 0,
      })
    ).toBe(0)
    expect(
      parseBillingCronInteger({
        value: '0',
        fallback: 100,
        min: 1,
      })
    ).toBe(100)
    expect(
      parseBillingCronInteger({
        value: 'nao-numero',
        fallback: 7,
        min: 0,
      })
    ).toBe(7)
    expect(
      parseBillingCronInteger({
        value: '9999',
        fallback: 100,
        min: 1,
        max: maxBillingCronRunLimit,
      })
    ).toBe(maxBillingCronRunLimit)
  })

  test('resolves billing cron config from env with safe defaults and limits', () => {
    expect(resolveBillingCronConfig({})).toEqual({
      invoiceLeadDays: 7,
      runLimit: 100,
    })
    expect(
      resolveBillingCronConfig({
        BILLING_INVOICE_LEAD_DAYS: '14',
        BILLING_RECURRING_RUN_LIMIT: '42',
      })
    ).toEqual({
      invoiceLeadDays: 14,
      runLimit: 42,
    })
    expect(
      resolveBillingCronConfig({
        BILLING_INVOICE_LEAD_DAYS: '0',
        BILLING_RECURRING_RUN_LIMIT: '0',
      })
    ).toEqual({
      invoiceLeadDays: 0,
      runLimit: 100,
    })
    expect(
      resolveBillingCronConfig({
        BILLING_INVOICE_LEAD_DAYS: '9999',
        BILLING_RECURRING_RUN_LIMIT: '9999',
      })
    ).toEqual({
      invoiceLeadDays: maxBillingInvoiceLeadDays,
      runLimit: maxBillingCronRunLimit,
    })
  })

  test('authorizes cron calls only with the configured bearer secret', () => {
    expect(
      authorizeBillingCronRequest({
        cronSecret: undefined,
        authorizationHeader: 'Bearer qualquer',
      })
    ).toEqual({
      authorized: false,
      status: 503,
      error: 'CRON_SECRET is required to run recurring billing safely.',
    })
    expect(
      authorizeBillingCronRequest({
        cronSecret: 'segredo',
        authorizationHeader: 'Bearer errado',
      })
    ).toEqual({
      authorized: false,
      status: 401,
      error: 'Unauthorized',
    })
    expect(
      authorizeBillingCronRequest({
        cronSecret: 'segredo',
        authorizationHeader: 'Bearer segredo',
      })
    ).toEqual({ authorized: true })
  })

  test('fails the cron response when a blocking cycle fails', () => {
    const successful = { failed: 0 }

    expect(
      isBillingCronRunSuccessful({
        recurring: successful,
        planChanges: successful,
        reminders: successful,
        delinquencyBlocks: successful,
        gatewayWebhooks: successful,
        gatewayReconciliation: { divergences: 0 },
      })
    ).toBe(true)
    expect(
      isBillingCronRunSuccessful({
        recurring: successful,
        planChanges: { failed: 1 },
        reminders: successful,
        delinquencyBlocks: successful,
        gatewayWebhooks: successful,
        gatewayReconciliation: { divergences: 0 },
      })
    ).toBe(false)
    expect(
      isBillingCronRunSuccessful({
        recurring: successful,
        planChanges: successful,
        reminders: { failed: 1 },
        delinquencyBlocks: successful,
        gatewayWebhooks: successful,
        gatewayReconciliation: { divergences: 0 },
      })
    ).toBe(false)
    expect(
      isBillingCronRunSuccessful({
        recurring: successful,
        planChanges: successful,
        reminders: successful,
        delinquencyBlocks: successful,
        gatewayWebhooks: { failed: 1 },
        gatewayReconciliation: { divergences: 0 },
      })
    ).toBe(false)
    expect(
      isBillingCronRunSuccessful({
        recurring: successful,
        planChanges: successful,
        reminders: successful,
        delinquencyBlocks: successful,
        gatewayWebhooks: successful,
        gatewayReconciliation: { divergences: 1 },
      })
    ).toBe(false)
  })
})
