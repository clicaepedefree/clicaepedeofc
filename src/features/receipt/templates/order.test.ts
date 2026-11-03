import { expect, mock, test } from 'bun:test'
mock.module('@/features/receipt/templates/order.receipt', () => ({ default: '' }))
mock.module('./base-template', () => ({ BaseTemplate: (options: unknown) => options }))
const { OrderTemplate } = await import('./order')

test('receipt formats fractional change and wallet amounts without treating decimal point as thousands', () => {
  const template = OrderTemplate as unknown as { preProcessing: (data: unknown) => any }
  const result = template.preProcessing({
    displayId: 'QA', createdAt: new Date('2026-11-03T00:00:00Z'), orderType: 'TAKEOUT',
    totalPrice: 19.9, items: [], payments: [{ method: 'CASH', value: 14.9, changeFor: 50 }],
    cashbackApplied: '5.00', amountDue: '14.90',
  })
  expect(result.payments[0].changeValue).toContain('35,10')
  expect(result.cashbackApplied).toContain('5,00')
  expect(result.amountDue).toContain('14,90')
  expect(result.coveredByCashback).toBe(false)
})
