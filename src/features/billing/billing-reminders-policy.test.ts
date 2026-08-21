import { describe, expect, test } from 'bun:test'
import {
  buildBillingReminderDedupeKey,
  getBillingReminderDaysAfterDue,
  getExpectedBillingInvoiceBlockAt,
  selectDueBillingReminderDrafts,
  shouldStopBillingRemindersForInvoice,
  type BillingReminderInvoice,
  type BillingReminderRule,
} from './billing-reminders-policy'

const invoice = {
  id: 10,
  invoiceNumber: 'CP-10-REC-1-20260801',
  status: 'pending',
  totalAmount: '199.9000',
  amountPaid: '0',
  dueAt: new Date('2026-08-10T12:00:00.000Z'),
} satisfies BillingReminderInvoice

const rules = [
  {
    id: 1,
    storeId: null,
    channel: 'system',
    daysAfterDue: 0,
    status: 'active',
    title: 'Venceu hoje',
    messageTemplate: 'Fatura {{invoiceNumber}} bloqueia em {{expectedBlockAt}}',
  },
  {
    id: 2,
    storeId: null,
    channel: 'email',
    daysAfterDue: 1,
    status: 'active',
    title: 'Atrasada',
    messageTemplate: 'Atraso de {{daysAfterDue}} dia(s)',
  },
  {
    id: 3,
    storeId: null,
    channel: 'whatsapp',
    daysAfterDue: 3,
    status: 'active',
    title: 'Insistir',
    messageTemplate: null,
  },
] satisfies BillingReminderRule[]

describe('billing reminders policy', () => {
  test('segue a agenda configurada por dias apos vencimento', () => {
    const drafts = selectDueBillingReminderDrafts({
      invoice,
      rules,
      existingDedupeKeys: new Set(),
      now: new Date('2026-08-11T09:00:00.000Z'),
      paymentGraceDays: 5,
    })

    expect(drafts.map(draft => draft.channel)).toEqual(['system', 'email'])
    expect(drafts[0]?.message).toContain('CP-10-REC-1-20260801')
    expect(drafts[0]?.message).toContain('2026-08-15')
    expect(drafts[1]?.message).toBe('Atraso de 1 dia(s)')
  })

  test('nao gera lembrete duplicado para a mesma fatura, canal e etapa', () => {
    const existingDedupeKeys = new Set([
      buildBillingReminderDedupeKey({
        invoiceId: invoice.id,
        channel: 'system',
        daysAfterDue: 0,
      }),
    ])

    const drafts = selectDueBillingReminderDrafts({
      invoice,
      rules,
      existingDedupeKeys,
      now: new Date('2026-08-13T09:00:00.000Z'),
      paymentGraceDays: 5,
    })

    expect(drafts.map(draft => draft.channel)).toEqual(['email', 'whatsapp'])
  })

  test('pagamento ou encerramento da fatura interrompe novas notificacoes', () => {
    expect(
      shouldStopBillingRemindersForInvoice({
        status: 'pending',
        totalAmount: '100',
        amountPaid: '100',
      })
    ).toBe(true)
    expect(
      selectDueBillingReminderDrafts({
        invoice: { ...invoice, status: 'paid', amountPaid: '199.9000' },
        rules,
        existingDedupeKeys: new Set(),
        now: new Date('2026-08-13T09:00:00.000Z'),
        paymentGraceDays: 5,
      })
    ).toEqual([])
  })

  test('calcula tolerancia e dias de atraso com base em UTC', () => {
    expect(
      getBillingReminderDaysAfterDue({
        dueAt: invoice.dueAt,
        now: new Date('2026-08-10T12:00:00.000Z'),
      })
    ).toBe(0)
    expect(
      getExpectedBillingInvoiceBlockAt({
        dueAt: invoice.dueAt,
        paymentGraceDays: 7,
      }).toISOString()
    ).toBe('2026-08-17T12:00:00.000Z')
  })
})

