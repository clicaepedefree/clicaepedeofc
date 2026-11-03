import { describe, expect, test } from 'bun:test'
import {
  readWalletPaymentSnapshot,
  walletInputAmount,
  walletPaymentAmounts,
} from './wallet-payment-policy'

describe('cashback payment reconciliation', () => {
  test('keeps gross order, partial redemption and exact remaining payment separate', () => {
    expect(walletPaymentAmounts('19.90', '4.25')).toEqual({
      total: '19.90',
      cashbackApplied: '4.25',
      amountDue: '15.65',
    })
    expect(walletPaymentAmounts('19.90', '19.90').amountDue).toBe('0.00')
  })
  test('rejects oversized, signed, nonfinite, excessive precision and ambiguous intent', () => {
    for (const input of [
      '20.00',
      '-1.00',
      'NaN',
      'Infinity',
      '1.001',
      '1e1',
      '1,00',
    ])
      expect(() => walletPaymentAmounts('19.90', input)).toThrow()
  })
  test('UI decimal parser never interprets garbage or thousands separators', () => {
    expect(walletInputAmount('1,2')).toBe('1.20')
    for (const input of ['', '1.234,56', '-1', '1.234', 'NaN'])
      expect(walletInputAmount(input)).toBeNull()
  })
  test('legacy snapshots have no wallet payment; persisted redemption is reconciled', () => {
    expect(readWalletPaymentSnapshot(null, '10').amountDue).toBe('10.00')
    expect(
      readWalletPaymentSnapshot({ cashbackApplied: '3.00' }, '10').amountDue
    ).toBe('7.00')
  })
})
