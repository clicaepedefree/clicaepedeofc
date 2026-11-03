import { z } from 'zod'

export type BenefitProgramsInput = {
  expectedVersion: number
  cashback: {
    enabled: boolean
    percentage: string | null
    expiresAfterDays: number | null
    minimumOrderAmount: string | null
  }
  loyalty: {
    enabled: boolean
    requiredOrders: number | null
    minimumOrderAmount: string | null
    rewardType: 'cashback' | 'product' | null
    rewardAmount: string | null
    rewardItemId: number | null
    rewardExpiresAfterDays: number | null
  }
}

// Technical storage bounds, not commercial defaults: BRL 9999999999.99,
// percentage (0,100], counts/days [1,2147483647], IDs/versions int32.
// Decimal input uses a dot, no exponent/sign/whitespace, at most two decimals.
export const BENEFIT_PROGRAM_MAX_INTEGER = 2147483647
const integer = z.number().int().min(1).max(BENEFIT_PROGRAM_MAX_INTEGER)
const money = z.string().regex(/^(0|[1-9]\d{0,9})(\.\d{1,2})?$/)
const percentage = z
  .string()
  .regex(/^(0|[1-9]\d{0,2})(\.\d{1,2})?$/)
  .refine(value => Number(value) > 0 && Number(value) <= 100)

export const benefitProgramsInputSchema = z
  .object({
    expectedVersion: z
      .number()
      .int()
      .min(0)
      .max(BENEFIT_PROGRAM_MAX_INTEGER - 1),
    cashback: z
      .object({
        enabled: z.boolean(),
        percentage: percentage.nullable(),
        expiresAfterDays: integer.nullable(),
        minimumOrderAmount: money.nullable(),
      })
      .strict(),
    loyalty: z
      .object({
        enabled: z.boolean(),
        requiredOrders: integer.nullable(),
        minimumOrderAmount: money.nullable(),
        rewardType: z.enum(['cashback', 'product']).nullable(),
        rewardAmount: money.refine(value => Number(value) > 0).nullable(),
        rewardItemId: integer.nullable(),
        rewardExpiresAfterDays: integer.nullable(),
      })
      .strict(),
  })
  .strict()
  .superRefine(({ cashback, loyalty }, ctx) => {
    const issue = (path: string[]) =>
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path,
        message: 'Preencha os campos obrigatorios do programa.',
      })
    if (
      cashback.enabled &&
      (cashback.percentage === null ||
        cashback.expiresAfterDays === null ||
        cashback.minimumOrderAmount === null)
    ) {
      issue(['cashback'])
    }
    if (
      loyalty.enabled &&
      (loyalty.requiredOrders === null ||
        loyalty.minimumOrderAmount === null ||
        loyalty.rewardType === null ||
        loyalty.rewardExpiresAfterDays === null ||
        (loyalty.rewardType === 'cashback' && loyalty.rewardAmount === null) ||
        (loyalty.rewardType === 'product' && loyalty.rewardItemId === null))
    ) {
      issue(['loyalty'])
    }
    if (
      (loyalty.rewardType !== 'cashback' && loyalty.rewardAmount !== null) ||
      (loyalty.rewardType !== 'product' && loyalty.rewardItemId !== null)
    ) {
      issue(['loyalty', 'rewardType'])
    }
  })

export function unconfiguredBenefitPrograms(): Omit<
  BenefitProgramsInput,
  'expectedVersion'
> {
  return {
    cashback: {
      enabled: false,
      percentage: null,
      expiresAfterDays: null,
      minimumOrderAmount: null,
    },
    loyalty: {
      enabled: false,
      requiredOrders: null,
      minimumOrderAmount: null,
      rewardType: null,
      rewardAmount: null,
      rewardItemId: null,
      rewardExpiresAfterDays: null,
    },
  }
}

export class BenefitProgramsError extends Error {}

export function assertBenefitModules(
  input: BenefitProgramsInput,
  modules: { cashback: boolean; loyalty: boolean }
) {
  if (
    (input.cashback.enabled && !modules.cashback) ||
    (input.loyalty.enabled && !modules.loyalty)
  ) {
    throw new BenefitProgramsError(
      'O modulo precisa estar ativo para habilitar o programa.'
    )
  }
}
