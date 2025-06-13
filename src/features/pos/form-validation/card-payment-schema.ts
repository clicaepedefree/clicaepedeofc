import { z } from 'zod'

export const cardTypes = ['DEBIT', 'CREDIT', 'FOOD_VOUCHER', 'MEAL_VOUCHER'] as const

export const debitCardBrands = ['DINERS', 'ELO', 'HIPERCARD', 'MASTERCARD', 'VISA'] as const
export const creditCardBrands = ['AMEX', 'DINERS', 'ELO', 'HIPERCARD', 'MASTERCARD', 'VISA'] as const
export const foodVoucherBrands = [
  'ALELO',
  'SODEXO',
  'TICKET',
  'VR_BENEFICIOS',
  'BANES_CARD',
  'BEN_CARD',
  'GOOD_CARD',
  'GREEN_CARD',
  'VALE_CARD',
] as const

export const mealVoucherBrands = [
  'ALELO',
  'SODEXO',
  'TICKET',
  'VR_BENEFICIOS',
  'BANES_CARD',
  'BEN_CARD',
  'GOOD_CARD',
  'GREEN_CARD',
  'VALE_CARD',
] as const

const basePaymentSchema = z.object({
  type: z.literal('PREPAID'),
  value: z.string().nonempty('Valor deve ser maior que 0'),
})

export const debitCardPaymentSchema = basePaymentSchema.extend({
  cardType: z.literal('DEBIT'),
  cardBrand: z.enum(debitCardBrands),
})

export const creditCardPaymentSchema = basePaymentSchema.extend({
  cardType: z.literal('CREDIT'),
  cardBrand: z.enum(creditCardBrands),
})

export const foodVoucherPaymentSchema = basePaymentSchema.extend({
  cardType: z.literal('FOOD_VOUCHER'),
  cardBrand: z.enum(foodVoucherBrands),
})

export const mealVoucherPaymentSchema = basePaymentSchema.extend({
  cardType: z.literal('MEAL_VOUCHER'),
  cardBrand: z.enum(mealVoucherBrands),
})

export const cardPaymentSchema = z.discriminatedUnion('cardType', [
  debitCardPaymentSchema,
  creditCardPaymentSchema,
  foodVoucherPaymentSchema,
  mealVoucherPaymentSchema,
])
