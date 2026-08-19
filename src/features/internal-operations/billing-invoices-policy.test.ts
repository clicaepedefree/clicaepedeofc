import { describe, expect, test } from 'bun:test'
import {
  canCopyInternalInvoicePaymentLink,
  getInternalInvoiceFinancialSummary,
  getInternalInvoiceFilterDescription,
  getInternalInvoiceStatusLabel,
  matchesInternalInvoiceStatusFilter,
  parseInternalInvoiceStatusFilter,
} from './billing-invoices-policy'

const now = new Date('2026-08-19T12:00:00.000Z')

describe('billing-invoices-policy', () => {
  test('normalizes invoice filter values', () => {
    expect(parseInternalInvoiceStatusFilter('paid')).toBe('paid')
    expect(parseInternalInvoiceStatusFilter('unexpected')).toBe('all')
    expect(parseInternalInvoiceStatusFilter(undefined)).toBe('all')
  })

  test('describes that filtered invoice lists are intentionally capped', () => {
    expect(
      getInternalInvoiceFilterDescription('overdue').includes('ate 50 faturas')
    ).toBe(true)
  })

  test('differentiates paid, open and overdue invoices', () => {
    expect(
      getInternalInvoiceStatusLabel(
        {
          status: 'paid',
          dueAt: '2026-08-01T12:00:00.000Z',
        },
        now
      )
    ).toBe('Paga')
    expect(
      getInternalInvoiceStatusLabel(
        {
          status: 'pending',
          dueAt: '2026-08-20T12:00:00.000Z',
        },
        now
      )
    ).toBe('Aberta')
    expect(
      getInternalInvoiceStatusLabel(
        {
          status: 'pending',
          dueAt: '2026-08-18T12:00:00.000Z',
        },
        now
      )
    ).toBe('Vencida')
  })

  test('filters invoices by operational status', () => {
    expect(
      matchesInternalInvoiceStatusFilter({
        invoice: { status: 'pending', dueAt: '2026-08-18T12:00:00.000Z' },
        filter: 'overdue',
        now,
      })
    ).toBe(true)
    expect(
      matchesInternalInvoiceStatusFilter({
        invoice: { status: 'pending', dueAt: '2026-08-20T12:00:00.000Z' },
        filter: 'overdue',
        now,
      })
    ).toBe(false)
  })

  test('calculates financial summary from every invoice record', () => {
    const summary = getInternalInvoiceFinancialSummary(
      [
        {
          status: 'pending',
          totalAmount: '100.00',
          amountPaid: '25.00',
          dueAt: '2026-08-20T12:00:00.000Z',
        },
        {
          status: 'pending',
          totalAmount: '200.00',
          amountPaid: '50.00',
          dueAt: '2026-08-18T12:00:00.000Z',
        },
        {
          status: 'paid',
          totalAmount: '300.00',
          amountPaid: '300.00',
          dueAt: '2026-08-10T12:00:00.000Z',
        },
        {
          status: 'cancelled',
          totalAmount: '400.00',
          amountPaid: '0.00',
          dueAt: '2026-08-22T12:00:00.000Z',
        },
      ],
      now
    )

    expect(summary.totalInvoices).toBe(4)
    expect(summary.openInvoices).toBe(2)
    expect(summary.overdueInvoices).toBe(1)
    expect(summary.paidInvoices).toBe(1)
    expect(summary.closedInvoices).toBe(1)
    expect(summary.totalAmount).toBe(1000)
    expect(summary.openAmount).toBe(225)
    expect(summary.overdueAmount).toBe(150)
    expect(summary.paidAmount).toBe(375)
  })

  test('allows copying payment link only for actionable invoices', () => {
    expect(
      canCopyInternalInvoicePaymentLink({
        invoice: {
          status: 'pending',
          dueAt: '2026-08-20T12:00:00.000Z',
          paymentLink: 'https://pay.example.test/fat-1',
        },
        canManageBillingInvoices: true,
        storeStatus: 'active',
        now,
      })
    ).toBe(true)
    expect(
      canCopyInternalInvoicePaymentLink({
        invoice: {
          status: 'paid',
          dueAt: '2026-08-10T12:00:00.000Z',
          paymentLink: 'https://pay.example.test/fat-2',
        },
        canManageBillingInvoices: true,
        storeStatus: 'active',
        now,
      })
    ).toBe(false)
    expect(
      canCopyInternalInvoicePaymentLink({
        invoice: {
          status: 'pending',
          dueAt: '2026-08-20T12:00:00.000Z',
          paymentLink: 'https://pay.example.test/fat-3',
        },
        canManageBillingInvoices: false,
        storeStatus: 'active',
        now,
      })
    ).toBe(false)
  })
})
