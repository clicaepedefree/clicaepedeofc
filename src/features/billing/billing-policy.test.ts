import { describe, expect, test } from 'bun:test'
import {
  buildBillingInvoiceDraft,
  calculateBillingInvoiceAmounts,
  calculateNextBillingPeriod,
  supportedBillingInvoiceStatuses,
} from './billing-policy'

describe('billing policy', () => {
  test('calcula proxima cobranca a partir das regras da assinatura', () => {
    const result = calculateNextBillingPeriod({
      currentPeriodEnd: new Date('2026-01-31T12:00:00.000Z'),
      billingInterval: 'monthly',
      billingIntervalCount: 1,
    })

    expect(result.periodStart.toISOString()).toBe('2026-01-31T12:00:00.000Z')
    expect(result.periodEnd.toISOString()).toBe('2026-02-28T12:00:00.000Z')
    expect(result.nextBillingAt.toISOString()).toBe('2026-02-28T12:00:00.000Z')
  })

  test('aplica desconto contratado sem alterar o subtotal historico', () => {
    expect(
      calculateBillingInvoiceAmounts({
        contractedAmount: '199.9000',
        discountType: 'percentage',
        discountValue: '10',
      })
    ).toEqual({
      subtotalAmount: '199.9000',
      discountAmount: '19.9900',
      totalAmount: '179.9100',
    })

    expect(
      calculateBillingInvoiceAmounts({
        contractedAmount: '99.9000',
        discountType: 'fixed_amount',
        discountValue: '120',
      })
    ).toEqual({
      subtotalAmount: '99.9000',
      discountAmount: '99.9000',
      totalAmount: '0.0000',
    })
  })

  test('congela snapshot de plano e contrato para preservar faturas historicas', () => {
    const plan = {
      id: 10,
      code: 'PRO',
      name: 'Plano Pro',
      defaultAmount: '299.9000',
      currency: 'BRL',
      billingInterval: 'monthly' as const,
      billingIntervalCount: 1,
    }
    const subscription = {
      id: 20,
      storeId: 30,
      planId: 10,
      contractedAmount: '249.9000',
      currency: 'BRL',
      billingInterval: 'monthly' as const,
      billingIntervalCount: 1,
      discountType: 'fixed_amount' as const,
      discountValue: '50',
      currentPeriodStart: new Date('2026-08-01T00:00:00.000Z'),
      currentPeriodEnd: new Date('2026-09-01T00:00:00.000Z'),
    }

    const invoice = buildBillingInvoiceDraft({
      invoiceNumber: 'INV-2026-0001',
      dueAt: new Date('2026-08-10T00:00:00.000Z'),
      plan,
      subscription,
    })

    plan.name = 'Plano Pro reajustado'
    plan.defaultAmount = '399.9000'

    const contractSnapshot = invoice.contractSnapshot as {
      contractedAmount: string
      discountType: string
      discountValue: string
    }

    expect(invoice.planSnapshot).toEqual({
      id: 10,
      code: 'PRO',
      name: 'Plano Pro',
      defaultAmount: '299.9000',
      currency: 'BRL',
      billingInterval: 'monthly',
      billingIntervalCount: 1,
    })
    expect({
      contractedAmount: contractSnapshot.contractedAmount,
      discountType: contractSnapshot.discountType,
      discountValue: contractSnapshot.discountValue,
    }).toEqual({
      contractedAmount: '249.9000',
      discountType: 'fixed_amount',
      discountValue: '50',
    })
    expect(invoice.totalAmount).toBe('199.9000')
  })

  test('bloqueia fatura com snapshot de plano diferente da assinatura', () => {
    let errorMessage = ''

    try {
      buildBillingInvoiceDraft({
        invoiceNumber: 'INV-2026-0002',
        dueAt: new Date('2026-08-10T00:00:00.000Z'),
        plan: {
          id: 999,
          code: 'OUTRO',
          name: 'Outro plano',
          defaultAmount: '99.9000',
          currency: 'BRL',
          billingInterval: 'monthly',
          billingIntervalCount: 1,
        },
        subscription: {
          id: 20,
          storeId: 30,
          planId: 10,
          contractedAmount: '249.9000',
          currency: 'BRL',
          billingInterval: 'monthly',
          billingIntervalCount: 1,
          discountType: null,
          discountValue: null,
          currentPeriodStart: new Date('2026-08-01T00:00:00.000Z'),
          currentPeriodEnd: new Date('2026-09-01T00:00:00.000Z'),
        },
      })
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : ''
    }

    expect(errorMessage).toBe('Billing plan does not match subscription plan')
  })

  test('explicita todos os status financeiros exigidos para faturas', () => {
    expect(supportedBillingInvoiceStatuses).toEqual([
      'pending',
      'paid',
      'overdue',
      'cancelled',
      'refunded',
    ])
  })
})
