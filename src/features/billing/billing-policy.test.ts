import { describe, expect, test } from 'bun:test'
import {
  buildBillingInvoiceDraft,
  buildRecurringBillingInvoiceDraft,
  buildRecurringBillingInvoiceNumber,
  calculateBillingInvoiceAmounts,
  calculateNextBillingPeriod,
  calculateRecurringBillingGenerationCutoff,
  canReuseRecurringBillingInvoice,
  normalizeInvoiceLeadDays,
  shouldGenerateRecurringBillingInvoice,
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
        discountValidUntil: null,
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
        discountValidUntil: null,
      })
    ).toEqual({
      subtotalAmount: '99.9000',
      discountAmount: '99.9000',
      totalAmount: '0.0000',
    })
  })

  test('ignora desconto vencido na data de cobranca', () => {
    expect(
      calculateBillingInvoiceAmounts({
        contractedAmount: '200.0000',
        discountType: 'percentage',
        discountValue: '50',
        discountValidUntil: new Date('2026-08-01T00:00:00.000Z'),
        referenceDate: new Date('2026-08-10T00:00:00.000Z'),
      })
    ).toEqual({
      subtotalAmount: '200.0000',
      discountAmount: '0.0000',
      totalAmount: '200.0000',
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
      discountValidUntil: null,
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
          discountValidUntil: null,
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

  test('calcula janela de geracao recorrente antes do vencimento', () => {
    const now = new Date('2026-08-10T09:00:00.000Z')

    expect(
      calculateRecurringBillingGenerationCutoff({
        now,
        invoiceLeadDays: 7,
      }).toISOString()
    ).toBe('2026-08-17T09:00:00.000Z')
    expect(normalizeInvoiceLeadDays(Number.NaN)).toBe(7)
    expect(normalizeInvoiceLeadDays(-1)).toBe(7)
    expect(normalizeInvoiceLeadDays(90)).toBe(60)
  })

  test('gera fatura recorrente somente para assinaturas elegiveis na janela', () => {
    const now = new Date('2026-08-10T09:00:00.000Z')

    expect(
      shouldGenerateRecurringBillingInvoice({
        status: 'active',
        nextBillingAt: new Date('2026-08-17T09:00:00.000Z'),
        now,
        invoiceLeadDays: 7,
      })
    ).toBe(true)
    expect(
      shouldGenerateRecurringBillingInvoice({
        status: 'active',
        nextBillingAt: new Date('2026-08-18T09:00:00.000Z'),
        now,
        invoiceLeadDays: 7,
      })
    ).toBe(false)
    expect(
      shouldGenerateRecurringBillingInvoice({
        status: 'paused',
        nextBillingAt: new Date('2026-08-17T09:00:00.000Z'),
        now,
        invoiceLeadDays: 7,
      })
    ).toBe(false)
  })

  test('usa numero deterministico para permitir retry sem duplicar fatura', () => {
    const input = {
      storeId: 15,
      subscriptionId: 99,
      periodStart: new Date('2026-08-01T00:00:00.000Z'),
    }

    expect(buildRecurringBillingInvoiceNumber(input)).toBe(
      'CP-15-REC-99-20260801'
    )
    expect(buildRecurringBillingInvoiceNumber(input)).toBe(
      buildRecurringBillingInvoiceNumber({ ...input })
    )
  })

  test('reutiliza somente faturas recorrentes que ainda representam cobranca valida', () => {
    expect(canReuseRecurringBillingInvoice({ status: 'pending' })).toBe(true)
    expect(canReuseRecurringBillingInvoice({ status: 'overdue' })).toBe(true)
    expect(canReuseRecurringBillingInvoice({ status: 'paid' })).toBe(true)
    expect(canReuseRecurringBillingInvoice({ status: 'cancelled' })).toBe(false)
    expect(canReuseRecurringBillingInvoice({ status: 'refunded' })).toBe(false)
  })

  test('fatura recorrente usa a proxima competencia e nao a competencia atual ja faturada', () => {
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
      status: 'active' as const,
      contractedAmount: '249.9000',
      currency: 'BRL',
      billingInterval: 'monthly' as const,
      billingIntervalCount: 1,
      discountType: null,
      discountValue: null,
      discountValidUntil: null,
      currentPeriodStart: new Date('2026-08-01T00:00:00.000Z'),
      currentPeriodEnd: new Date('2026-09-01T00:00:00.000Z'),
    }

    const result = buildRecurringBillingInvoiceDraft({
      invoiceNumber: buildRecurringBillingInvoiceNumber({
        storeId: subscription.storeId,
        subscriptionId: subscription.id,
        periodStart: subscription.currentPeriodEnd,
      }),
      dueAt: new Date('2026-09-01T00:00:00.000Z'),
      plan,
      subscription,
    })

    expect(result.invoice.periodStart.toISOString()).toBe(
      '2026-09-01T00:00:00.000Z'
    )
    expect(result.invoice.periodEnd.toISOString()).toBe(
      '2026-10-01T00:00:00.000Z'
    )
    expect(result.invoice.invoiceNumber).toBe('CP-30-REC-20-20260901')
    expect(result.nextSubscriptionStatus).toBe('active')
  })

  test('fatura recorrente transforma trial em assinatura ativa apos geracao valida', () => {
    const result = buildRecurringBillingInvoiceDraft({
      invoiceNumber: 'CP-30-REC-20-20260901',
      dueAt: new Date('2026-09-01T00:00:00.000Z'),
      plan: {
        id: 10,
        code: 'PRO',
        name: 'Plano Pro',
        defaultAmount: '299.9000',
        currency: 'BRL',
        billingInterval: 'monthly',
        billingIntervalCount: 1,
      },
      subscription: {
        id: 20,
        storeId: 30,
        planId: 10,
        status: 'trialing',
        contractedAmount: '249.9000',
        currency: 'BRL',
        billingInterval: 'monthly',
        billingIntervalCount: 1,
        discountType: null,
        discountValue: null,
        discountValidUntil: null,
        currentPeriodStart: new Date('2026-08-01T00:00:00.000Z'),
        currentPeriodEnd: new Date('2026-09-01T00:00:00.000Z'),
      },
    })

    expect(result.nextSubscriptionStatus).toBe('active')
  })
})
