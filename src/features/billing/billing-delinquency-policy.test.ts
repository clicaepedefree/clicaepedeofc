import { describe, expect, test } from 'bun:test'
import {
  addGraceDays,
  decideBillingDelinquencyAccessBlock,
  getOutstandingInvoiceAmount,
  isBillingAccessExemptionActive,
  type BillingDelinquencyInvoiceSnapshot,
  type BillingDelinquencyStoreSnapshot,
  type BillingDelinquencySubscriptionSnapshot,
} from './billing-delinquency-policy'

const now = new Date('2026-08-21T12:00:00.000Z')

const invoice: BillingDelinquencyInvoiceSnapshot = {
  id: 10,
  invoiceNumber: 'FAT-10',
  status: 'overdue',
  dueAt: new Date('2026-08-10T00:00:00.000Z'),
  totalAmount: '200.0000',
  amountPaid: '50.0000',
}

const subscription: BillingDelinquencySubscriptionSnapshot = {
  id: 20,
  status: 'active',
  paymentGraceDays: 7,
  billingAccessExemptionKind: null,
  billingAccessExemptUntil: null,
  billingAccessExemptionReason: null,
}

const store: BillingDelinquencyStoreSnapshot = {
  id: 30,
  status: 'active',
}

describe('billing delinquency policy', () => {
  test('blocks only after invoice due date plus configured grace period', () => {
    expect(addGraceDays(invoice.dueAt, 7).toISOString()).toBe(
      '2026-08-17T00:00:00.000Z'
    )

    expect(
      decideBillingDelinquencyAccessBlock({
        invoice,
        subscription,
        store,
        hasActiveAccessBlock: false,
        now,
      })
    ).toMatchObject({
      action: 'block',
      dedupeKey: 'billing-delinquency:invoice:10',
      outstandingAmount: 150,
      reasonCode: 'invoice_overdue_after_grace',
    })

    expect(
      decideBillingDelinquencyAccessBlock({
        invoice,
        subscription: { ...subscription, paymentGraceDays: 20 },
        store,
        hasActiveAccessBlock: false,
        now,
      })
    ).toEqual({
      action: 'skip',
      reason: 'invoice_not_due_after_grace',
    })
  })

  test('does not block paid, cancelled, refunded or zero-balance invoices', () => {
    expect(getOutstandingInvoiceAmount(invoice)).toBe(150)

    for (const status of ['paid', 'cancelled', 'refunded']) {
      expect(
        decideBillingDelinquencyAccessBlock({
          invoice: { ...invoice, status },
          subscription,
          store,
          hasActiveAccessBlock: false,
          now,
        })
      ).toEqual({ action: 'skip', reason: 'invoice_not_blockable' })
    }

    expect(
      decideBillingDelinquencyAccessBlock({
        invoice: {
          ...invoice,
          totalAmount: '100.0000',
          amountPaid: '100.0000',
        },
        subscription,
        store,
        hasActiveAccessBlock: false,
        now,
      })
    ).toEqual({ action: 'skip', reason: 'invoice_without_open_balance' })
  })

  test('keeps billing exceptions and courtesy periods out of automatic blocks', () => {
    expect(
      isBillingAccessExemptionActive({
        billingAccessExemptionKind: 'courtesy',
        billingAccessExemptUntil: new Date('2026-08-22T00:00:00.000Z'),
        now,
      })
    ).toBe(true)

    expect(
      decideBillingDelinquencyAccessBlock({
        invoice,
        subscription: {
          ...subscription,
          billingAccessExemptionKind: 'manual_exception',
          billingAccessExemptUntil: new Date('2026-08-22T00:00:00.000Z'),
          billingAccessExemptionReason: 'Acordo comercial em andamento.',
        },
        store,
        hasActiveAccessBlock: false,
        now,
      })
    ).toEqual({
      action: 'skip',
      reason: 'active_billing_access_exemption',
    })
  })

  test('does not cancel stores or stack on existing access blocks', () => {
    expect(
      decideBillingDelinquencyAccessBlock({
        invoice,
        subscription,
        store: { ...store, status: 'inactive' },
        hasActiveAccessBlock: false,
        now,
      })
    ).toEqual({ action: 'skip', reason: 'store_not_active' })

    expect(
      decideBillingDelinquencyAccessBlock({
        invoice,
        subscription,
        store,
        hasActiveAccessBlock: true,
        now,
      })
    ).toEqual({
      action: 'skip',
      reason: 'active_access_block_exists',
    })
  })
})
