import { z } from 'zod'

const moneyRegex = /^\d+(?:[,.]\d{1,4})?$/

export const subscriptionPlanChangeTimings = [
  'immediate',
  'next_renewal',
] as const

export const subscriptionPlanChangeModuleTreatments = [
  'sync_to_new_plan',
  'keep_current',
  'manual_review',
] as const

export const subscriptionPlanChangeValueModes = [
  'keep_current',
  'use_plan_default',
  'custom',
] as const

export const storeSubscriptionPlanChangeSchema = z
  .object({
    storeId: z.coerce.number().int().positive(),
    subscriptionId: z.coerce.number().int().positive(),
    targetPlanId: z.coerce.number().int().positive(),
    timing: z.enum(subscriptionPlanChangeTimings),
    valueMode: z.enum(subscriptionPlanChangeValueModes),
    customContractedAmount: z
      .string()
      .trim()
      .optional()
      .or(z.literal(''))
      .default(''),
    moduleTreatment: z.enum(subscriptionPlanChangeModuleTreatments),
    confirmation: z.string().trim().optional().or(z.literal('')).default(''),
    reason: z
      .string()
      .trim()
      .min(8, 'Informe um motivo com pelo menos 8 caracteres.')
      .max(500, 'Use ate 500 caracteres.'),
  })
  .superRefine((values, context) => {
    if (values.valueMode !== 'custom') return

    if (
      !values.customContractedAmount ||
      !moneyRegex.test(values.customContractedAmount)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['customContractedAmount'],
        message: 'Informe um valor personalizado valido.',
      })
      return
    }

    if (parseCurrencyAmount(values.customContractedAmount) <= 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['customContractedAmount'],
        message: 'Informe um valor personalizado maior que zero.',
      })
    }
  })

export type StoreSubscriptionPlanChangeValues = z.infer<
  typeof storeSubscriptionPlanChangeSchema
>

export function parseCurrencyAmount(value: string) {
  return Number(value.replace(/\./g, '').replace(',', '.'))
}

export function resolvePlanChangeEffectiveAt({
  timing,
  now,
  nextBillingAt,
}: {
  timing: (typeof subscriptionPlanChangeTimings)[number]
  now: Date
  nextBillingAt: Date | null
}) {
  if (timing === 'immediate') return now

  if (!nextBillingAt) {
    throw new Error('NEXT_BILLING_DATE_REQUIRED')
  }

  return nextBillingAt
}

export function resolvePlanChangeContractedAmount({
  valueMode,
  currentContractedAmount,
  planDefaultAmount,
  customContractedAmount,
}: {
  valueMode: (typeof subscriptionPlanChangeValueModes)[number]
  currentContractedAmount: string
  planDefaultAmount: string
  customContractedAmount?: string
}) {
  if (valueMode === 'keep_current') return currentContractedAmount
  if (valueMode === 'use_plan_default') return planDefaultAmount

  if (!customContractedAmount) {
    throw new Error('CUSTOM_CONTRACTED_AMOUNT_REQUIRED')
  }

  return String(parseCurrencyAmount(customContractedAmount))
}

export function getPlanChangeTimingLabel(
  timing: (typeof subscriptionPlanChangeTimings)[number]
) {
  return timing === 'immediate'
    ? 'Aplicar agora'
    : 'Aplicar na proxima renovacao'
}

export function getModuleTreatmentLabel(
  treatment: (typeof subscriptionPlanChangeModuleTreatments)[number]
) {
  const labels = {
    sync_to_new_plan: 'Sincronizar modulos do novo plano',
    keep_current: 'Manter modulos atuais por enquanto',
    manual_review: 'Exigir revisao manual dos modulos',
  } satisfies Record<
    (typeof subscriptionPlanChangeModuleTreatments)[number],
    string
  >

  return labels[treatment]
}
