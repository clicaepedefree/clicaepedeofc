import { z } from 'zod'
import Decimal from 'decimal.js'

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

export const subscriptionPlanChangeProrationPolicies = [
  'create_adjustment',
  'record_only',
  'waive',
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
    prorationPolicy: z
      .enum(subscriptionPlanChangeProrationPolicies)
      .default('create_adjustment'),
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

export type SubscriptionPlanChangeProrationPolicy =
  (typeof subscriptionPlanChangeProrationPolicies)[number]

export type PlanChangeProrationPreview = {
  policy: SubscriptionPlanChangeProrationPolicy
  adjustmentType: 'debit' | 'credit' | 'none'
  status: 'open' | 'waived' | 'not_applicable'
  amount: string
  signedAmount: string
  currency: string
  previousRemainingAmount: string
  nextRemainingAmount: string
  currentContractedAmount: string
  nextContractedAmount: string
  periodStart: string
  periodEnd: string
  effectiveAt: string
  totalMilliseconds: number
  remainingMilliseconds: number
  remainingDays: number
  elapsedDays: number
  formula: string
  explanation: string
}

export function parseCurrencyAmount(value: string) {
  return Number(value.replace(/\./g, '').replace(',', '.'))
}

const money = (value: Decimal.Value) => new Decimal(value).toDecimalPlaces(4)

const toMoneyString = (value: Decimal.Value) => money(value).toFixed(4)

const clampDate = ({ date, start, end }: { date: Date; start: Date; end: Date }) => {
  if (date.getTime() < start.getTime()) return start
  if (date.getTime() > end.getTime()) return end

  return date
}

export function calculatePlanChangeProration({
  timing,
  policy,
  currentContractedAmount,
  nextContractedAmount,
  currency,
  periodStart,
  periodEnd,
  effectiveAt,
}: {
  timing: (typeof subscriptionPlanChangeTimings)[number]
  policy: SubscriptionPlanChangeProrationPolicy
  currentContractedAmount: string
  nextContractedAmount: string
  currency: string
  periodStart: Date
  periodEnd: Date
  effectiveAt: Date
}): PlanChangeProrationPreview {
  const periodStartMs = periodStart.getTime()
  const periodEndMs = periodEnd.getTime()
  const totalMilliseconds = Math.max(periodEndMs - periodStartMs, 0)
  const safeEffectiveAt = clampDate({
    date: effectiveAt,
    start: periodStart,
    end: periodEnd,
  })
  const remainingMilliseconds =
    timing === 'next_renewal'
      ? 0
      : Math.max(periodEndMs - safeEffectiveAt.getTime(), 0)

  if (totalMilliseconds <= 0 || remainingMilliseconds <= 0) {
    return {
      policy,
      adjustmentType: 'none',
      status: 'not_applicable',
      amount: '0.0000',
      signedAmount: '0.0000',
      currency,
      previousRemainingAmount: '0.0000',
      nextRemainingAmount: '0.0000',
      currentContractedAmount: toMoneyString(currentContractedAmount),
      nextContractedAmount: toMoneyString(nextContractedAmount),
      periodStart: periodStart.toISOString(),
      periodEnd: periodEnd.toISOString(),
      effectiveAt: safeEffectiveAt.toISOString(),
      totalMilliseconds,
      remainingMilliseconds,
      remainingDays: 0,
      elapsedDays: Math.max(
        Math.ceil((safeEffectiveAt.getTime() - periodStartMs) / 86_400_000),
        0
      ),
      formula: 'Sem periodo restante para calcular ajuste proporcional.',
      explanation:
        timing === 'next_renewal'
          ? 'Mudanca programada para renovacao nao altera o ciclo atual.'
          : 'Nao ha saldo de periodo restante para ajustar.',
    }
  }

  const remainingRatio = new Decimal(remainingMilliseconds).div(
    totalMilliseconds
  )
  const previousRemainingAmount = money(currentContractedAmount).mul(
    remainingRatio
  )
  const nextRemainingAmount = money(nextContractedAmount).mul(remainingRatio)
  const signedAmount = money(nextRemainingAmount.minus(previousRemainingAmount))
  const adjustmentType = signedAmount.gt(0)
    ? 'debit'
    : signedAmount.lt(0)
      ? 'credit'
      : 'none'
  const status =
    adjustmentType === 'none'
      ? 'not_applicable'
      : policy === 'waive'
        ? 'waived'
        : 'open'
  const remainingDays = Math.ceil(remainingMilliseconds / 86_400_000)
  const elapsedDays = Math.max(
    Math.ceil((safeEffectiveAt.getTime() - periodStartMs) / 86_400_000),
    0
  )

  return {
    policy,
    adjustmentType,
    status,
    amount: toMoneyString(signedAmount.abs()),
    signedAmount: signedAmount.toFixed(4),
    currency,
    previousRemainingAmount: previousRemainingAmount.toFixed(4),
    nextRemainingAmount: nextRemainingAmount.toFixed(4),
    currentContractedAmount: toMoneyString(currentContractedAmount),
    nextContractedAmount: toMoneyString(nextContractedAmount),
    periodStart: periodStart.toISOString(),
    periodEnd: periodEnd.toISOString(),
    effectiveAt: safeEffectiveAt.toISOString(),
    totalMilliseconds,
    remainingMilliseconds,
    remainingDays,
    elapsedDays,
    formula:
      '((novo valor contratado - valor contratado atual) / duracao do ciclo) x periodo restante',
    explanation:
      adjustmentType === 'debit'
        ? 'Novo plano tem valor proporcional maior no periodo restante.'
        : adjustmentType === 'credit'
          ? 'Novo plano tem valor proporcional menor no periodo restante.'
          : 'Valores equivalem no periodo restante.',
  }
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

export function getProrationPolicyLabel(
  policy: SubscriptionPlanChangeProrationPolicy
) {
  const labels = {
    create_adjustment: 'Gerar ajuste financeiro',
    record_only: 'Apenas registrar memoria de calculo',
    waive: 'Isentar ajuste deste ciclo',
  } satisfies Record<SubscriptionPlanChangeProrationPolicy, string>

  return labels[policy]
}
