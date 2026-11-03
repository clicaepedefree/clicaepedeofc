import Decimal from 'decimal.js'

const brazilianAreaCodes = new Set([
  11, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 24, 27, 28, 31, 32, 33, 34, 35,
  37, 38, 41, 42, 43, 44, 45, 46, 47, 48, 49, 51, 53, 54, 55, 61, 62, 63, 64,
  65, 66, 67, 68, 69, 71, 73, 74, 75, 77, 79, 81, 82, 83, 84, 85, 86, 87, 88,
  89, 91, 92, 93, 94, 95, 96, 97, 98, 99,
])

export function normalizeBenefitPhone(value: string | null): string | null {
  if (!value || /[^+\d\s().-]/.test(value)) return null
  const digits = value.replace(/\D/g, '')
  if (
    value.trim().startsWith('+') &&
    (!digits.startsWith('55') || ![12, 13].includes(digits.length))
  )
    return null
  const local =
    (digits.length === 12 || digits.length === 13) && digits.startsWith('55')
      ? digits.slice(2)
      : digits
  if (
    !/^(?:[1-9]\d9\d{8}|[1-9]\d[2-5]\d{7})$/.test(local) ||
    !brazilianAreaCodes.has(Number(local.slice(0, 2)))
  )
    return null
  return `55${local}`
}

export function benefitMoney(value: Decimal.Value): Decimal {
  const result = new Decimal(value)
  if (!result.isFinite() || result.lt(0) || result.gt('999999999999999.99')) {
    throw new Error('Invalid benefit amount')
  }
  return result
}

export function benefitBase(
  total: string,
  deliveryFee: string | null,
  spent = '0.00'
): string {
  return Decimal.max(
    0,
    benefitMoney(total)
      .minus(benefitMoney(deliveryFee ?? '0'))
      .minus(benefitMoney(spent))
  )
    .toDecimalPlaces(2, Decimal.ROUND_FLOOR)
    .toFixed(2)
}

export function cashbackGain(base: string, percentage: string): string {
  const rate = benefitMoney(percentage)
  if (rate.gt(100)) throw new Error('Invalid cashback percentage')
  return benefitMoney(base)
    .mul(rate)
    .div(100)
    .toDecimalPlaces(2, Decimal.ROUND_FLOOR)
    .toFixed(2)
}

// Clamp to a representable JS/Postgres instant, not a wrapped Invalid Date.
// int32 day durations from KAN156 may exceed the timestamp range.
export function benefitExpiry(confirmedAt: Date, days: number): Date {
  if (
    !Number.isFinite(confirmedAt.getTime()) ||
    !Number.isInteger(days) ||
    days <= 0 ||
    days > 2147483647
  ) {
    throw new Error('Invalid benefit validity')
  }
  const end = Math.min(253402300799999, confirmedAt.getTime() + days * 86400000)
  if (end <= confirmedAt.getTime()) throw new Error('Invalid benefit validity')
  return new Date(end)
}

export function refundExpiry(original: Date, now: Date): Date {
  if (!Number.isFinite(original.getTime()))
    throw new Error('Invalid original validity')
  return original > now ? original : benefitExpiry(now, 7)
}

export function splitBenefitCredit(amount: string, debt: string) {
  const offset = Decimal.min(benefitMoney(amount), benefitMoney(debt))
  return {
    available: benefitMoney(amount).minus(offset).toFixed(2),
    offset: offset.toFixed(2),
    debt: benefitMoney(debt).minus(offset).toFixed(2),
  }
}

export function validatedDebitAmount(amount: string): string {
  if (
    !/^(0|[1-9]\d{0,14})\.\d{2}$/.test(amount) ||
    !benefitMoney(amount).gt(0)
  ) {
    throw new Error(
      'Debit requires a positive server-validated two-decimal amount'
    )
  }
  return amount
}
