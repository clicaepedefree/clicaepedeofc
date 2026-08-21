import { describe, expect, test } from 'bun:test'
import {
  buildPaymentConfirmationDedupeKey,
  reconcileConfirmedPayment,
  shouldAutoUnblockBillingAccess,
  type PaymentConfirmationInvoiceSnapshot,
} from './payment-confirmation-policy'

const invoice: PaymentConfirmationInvoiceSnapshot = {
  id: 10,
  status: 'overdue',
  totalAmount: '120.0000',
  amountPaid: '20.0000',
  amountRefunded: '0.0000',
  paidAt: null,
}

describe('payment confirmation policy', () => {
  test('reconciles partial and full payments against the current invoice balance', () => {
    expect(
      reconcileConfirmedPayment({
        invoice,
        amount: '50.00',
        paidAt: new Date('2026-08-21T12:00:00.000Z'),
      })
    ).toEqual({
      nextAmountPaid: '70.0000',
      nextStatus: 'pending',
      nextPaidAt: null,
      outstandingBeforePayment: 100,
    })

    expect(
      reconcileConfirmedPayment({
        invoice,
        amount: '100.00',
        paidAt: new Date('2026-08-21T12:00:00.000Z'),
      })
    ).toEqual({
      nextAmountPaid: '120.0000',
      nextStatus: 'paid',
      nextPaidAt: new Date('2026-08-21T12:00:00.000Z'),
      outstandingBeforePayment: 100,
    })
  })

  test('rejects duplicate-sized overpayments instead of reconciling blindly', () => {
    expect(() =>
      reconcileConfirmedPayment({
        invoice,
        amount: '100.01',
        paidAt: new Date('2026-08-21T12:00:00.000Z'),
      })
    ).toThrow('PAYMENT_EXCEEDS_OUTSTANDING')
  })

  test('builds stable keys for gateway and manual duplicate events', () => {
    expect(
      buildPaymentConfirmationDedupeKey({
        invoiceId: 10,
        provider: 'validapay',
        providerPaymentId: 'pay_123',
        amount: '100.00',
        paidAt: new Date('2026-08-21T12:00:00.000Z'),
      })
    ).toBe('validapay:pay_123')

    expect(
      buildPaymentConfirmationDedupeKey({
        invoiceId: 10,
        provider: 'internal_manual_payment',
        amount: '100.00',
        paidAt: new Date('2026-08-21T12:00:00.000Z'),
        manualReference: ' Pix interno ',
      })
    ).toBe(
      'internal_manual_payment:invoice:10:amount:100.0000:paid_at:2026-08-21T12:00:00.000Z:ref:pix interno'
    )
  })

  test('unblocks only paid invoices with an active billing delinquency block', () => {
    expect(
      shouldAutoUnblockBillingAccess({
        invoiceId: 10,
        invoiceStatus: 'paid',
        block: {
          id: 1,
          source: 'billing_delinquency',
          invoiceId: 10,
          unblockedAt: null,
        },
      })
    ).toBe(true)

    expect(
      shouldAutoUnblockBillingAccess({
        invoiceId: 10,
        invoiceStatus: 'paid',
        block: {
          id: 1,
          source: 'manual',
          invoiceId: 10,
          unblockedAt: null,
        },
      })
    ).toBe(false)

    expect(
      shouldAutoUnblockBillingAccess({
        invoiceId: 10,
        invoiceStatus: 'pending',
        block: {
          id: 1,
          source: 'billing_delinquency',
          invoiceId: 10,
          unblockedAt: null,
        },
      })
    ).toBe(false)
  })
})
