import { describe, expect, test } from 'bun:test'
import {
  adjustBillingInvoiceAmountSchema,
  calculateManualInvoiceAdjustment,
  canRunManualBillingAction,
  getManualInvoiceOutstandingAmount,
  getManualInvoiceRefundableAmount,
} from './billing-manual-actions-policy'

const openInvoice = {
  status: 'pending',
  subtotalAmount: '100.0000',
  discountAmount: '0.0000',
  totalAmount: '100.0000',
  amountPaid: '0.0000',
  amountRefunded: '0.0000',
}

describe('billing manual actions policy', () => {
  test('allows only compatible operations for open invoices', () => {
    expect(
      canRunManualBillingAction({
        action: 'mark_payment',
        invoice: openInvoice,
      })
    ).toBe(true)
    expect(
      canRunManualBillingAction({
        action: 'reschedule_due_date',
        invoice: openInvoice,
      })
    ).toBe(true)
    expect(
      canRunManualBillingAction({
        action: 'apply_adjustment',
        invoice: openInvoice,
      })
    ).toBe(true)
    expect(
      canRunManualBillingAction({
        action: 'cancel_invoice',
        invoice: openInvoice,
      })
    ).toBe(true)
  })

  test('rejects operations incompatible with closed invoice status', () => {
    const paidInvoice = {
      ...openInvoice,
      status: 'paid',
      amountPaid: '100.0000',
    }
    const cancelledInvoice = {
      ...openInvoice,
      status: 'cancelled',
    }

    expect(
      canRunManualBillingAction({
        action: 'mark_payment',
        invoice: paidInvoice,
      })
    ).toBe(false)
    expect(
      canRunManualBillingAction({
        action: 'reschedule_due_date',
        invoice: paidInvoice,
      })
    ).toBe(false)
    expect(
      canRunManualBillingAction({
        action: 'refund_invoice',
        invoice: paidInvoice,
      })
    ).toBe(true)
    expect(
      canRunManualBillingAction({
        action: 'refund_invoice',
        invoice: cancelledInvoice,
      })
    ).toBe(false)
  })

  test('keeps original subtotal while applying manual discount or surcharge', () => {
    const discounted = calculateManualInvoiceAdjustment({
      invoice: openInvoice,
      adjustmentType: 'discount',
      amount: '15.50',
    })
    const surcharged = calculateManualInvoiceAdjustment({
      invoice: openInvoice,
      adjustmentType: 'surcharge',
      amount: '12.00',
    })

    expect(discounted.subtotalAmount).toBe('100.0000')
    expect(discounted.discountAmount).toBe('15.5000')
    expect(discounted.totalAmount).toBe('84.5000')
    expect(discounted.previousValues.totalAmount).toBe('100.0000')
    expect(discounted.newValues.totalAmount).toBe('84.5000')
    expect(surcharged.subtotalAmount).toBe('100.0000')
    expect(surcharged.discountAmount).toBe('0.0000')
    expect(surcharged.totalAmount).toBe('112.0000')
  })

  test('blocks discounts above invoice total', () => {
    expect(() =>
      calculateManualInvoiceAdjustment({
        invoice: openInvoice,
        adjustmentType: 'discount',
        amount: '101.00',
      })
    ).toThrow('MANUAL_BILLING_DISCOUNT_EXCEEDS_TOTAL')
  })

  test('requires a reason for manual amount adjustments', () => {
    expect(() =>
      adjustBillingInvoiceAmountSchema.parse({
        storeId: 1,
        invoiceId: 2,
        adjustmentType: 'discount',
        amount: '10.00',
        reason: 'curto',
      })
    ).toThrow()
  })

  test('calculates outstanding and refundable amounts', () => {
    expect(
      getManualInvoiceOutstandingAmount({
        ...openInvoice,
        totalAmount: '120.0000',
        amountPaid: '40.0000',
      })
    ).toBe(80)
    expect(
      getManualInvoiceRefundableAmount({
        ...openInvoice,
        status: 'paid',
        amountPaid: '120.0000',
        amountRefunded: '20.0000',
      })
    ).toBe(100)
  })
})
