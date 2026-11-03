import Decimal from 'decimal.js'
import { benefitMoney } from './ledger-policy'

export function walletPaymentAmounts(total: string, requested = '0.00') {
  if (!/^\d{1,12}\.\d{2}$/.test(requested))
    throw new Error('Informe o cashback em reais e centavos.')
  const original = benefitMoney(total)
  const applied = benefitMoney(requested)
  if (applied.gt(original))
    throw new Error('O cashback nao pode superar o total do pedido.')
  return {
    total: original.toFixed(2),
    cashbackApplied: applied.toFixed(2),
    amountDue: original.minus(applied).toFixed(2),
  }
}

export function walletInputAmount(input: string): string | null {
  const normalized = input.trim().replace(',', '.')
  if (!/^\d{1,12}(?:\.\d{1,2})?$/.test(normalized)) return null
  return new Decimal(normalized).toFixed(2)
}

export function readWalletPaymentSnapshot(value: unknown, total: string) {
  const snapshot =
    value && typeof value === 'object'
      ? (value as { cashbackApplied?: unknown })
      : null
  try {
    return walletPaymentAmounts(
      total,
      typeof snapshot?.cashbackApplied === 'string'
        ? snapshot.cashbackApplied
        : '0.00'
    )
  } catch {
    return walletPaymentAmounts(total)
  }
}
