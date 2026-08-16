import { z } from 'zod'

const moneyRegex = /^\d+(?:[,.]\d{1,4})?$/

const parseDecimalNumber = (value: string) =>
  Number(value.replace(/\./g, '').replace(',', '.'))

const optionalDateSchema = z
  .string()
  .trim()
  .optional()
  .default('')
  .transform(value => (value ? new Date(value) : null))
  .refine(value => value === null || !Number.isNaN(value.getTime()), {
    message: 'Data invalida.',
  })

export const storeSubscriptionTermsSchema = z
  .object({
    storeId: z.coerce.number().int().positive(),
    subscriptionId: z.coerce.number().int().positive(),
    contractedAmount: z
      .string()
      .trim()
      .regex(moneyRegex, 'Informe um valor contratado valido.')
      .refine(
        value => parseDecimalNumber(value) > 0,
        'Informe um valor contratado maior que zero.'
      ),
    discountType: z.enum(['none', 'fixed_amount', 'percentage']),
    discountValue: z.string().trim().optional().or(z.literal('')).default(''),
    discountValidUntil: optionalDateSchema,
    paymentGraceDays: z.coerce.number().int().min(0).max(90),
    reason: z
      .string()
      .trim()
      .min(8, 'Informe um motivo com pelo menos 8 caracteres.')
      .max(500, 'Use ate 500 caracteres.'),
  })
  .superRefine((values, context) => {
    if (values.discountType === 'none') {
      if (values.discountValidUntil) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['discountValidUntil'],
          message: 'Validade exige desconto contratado.',
        })
      }
      return
    }

    if (!values.discountValue || !moneyRegex.test(values.discountValue)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['discountValue'],
        message: 'Informe o desconto contratado.',
      })
      return
    }

    if (
      values.discountType === 'percentage' &&
      parseDecimalNumber(values.discountValue) > 100
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['discountValue'],
        message: 'Informe um percentual ate 100.',
      })
    }
  })

export type StoreSubscriptionTermsValues = z.infer<
  typeof storeSubscriptionTermsSchema
>

export function addDays(date: Date | null, days: number) {
  if (!date) return null

  const result = new Date(date)
  result.setUTCDate(result.getUTCDate() + Math.max(0, Math.trunc(days)))
  return result
}

export function getExpectedSubscriptionBlockAt({
  nextBillingAt,
  paymentGraceDays,
}: {
  nextBillingAt: Date | null
  paymentGraceDays: number
}) {
  return addDays(nextBillingAt, paymentGraceDays)
}

export function getBillingIntervalLabel({
  billingInterval,
  billingIntervalCount,
}: {
  billingInterval: string | null
  billingIntervalCount: number | null
}) {
  const count = Math.max(1, billingIntervalCount ?? 1)
  const labels: Record<string, [singular: string, plural: string]> = {
    monthly: ['mes', 'meses'],
    quarterly: ['trimestre', 'trimestres'],
    semiannual: ['semestre', 'semestres'],
    annual: ['ano', 'anos'],
  }
  const [singular, plural] = labels[billingInterval ?? 'monthly'] ?? [
    'periodo',
    'periodos',
  ]

  return count === 1 ? `A cada ${singular}` : `A cada ${count} ${plural}`
}

export function getDiscountLabel({
  discountType,
  discountValue,
  currency = 'BRL',
}: {
  discountType: string | null
  discountValue: string | number | null
  currency?: string
}) {
  if (!discountType || discountValue === null || discountValue === '') {
    return 'Sem desconto'
  }

  if (discountType === 'percentage') return `${Number(discountValue)}%`

  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency,
  }).format(Number(discountValue))
}
