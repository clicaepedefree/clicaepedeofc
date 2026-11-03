import type { BenefitProgramsInput } from '../policy'

export type BenefitProgramsForm = {
  cashback: {
    enabled: boolean
    percentage: string
    expiresAfterDays: string
    minimumOrderAmount: string
  }
  loyalty: {
    enabled: boolean
    requiredOrders: string
    minimumOrderAmount: string
    rewardType: '' | 'cashback' | 'product'
    rewardAmount: string
    rewardItemId: string
    rewardExpiresAfterDays: string
  }
}

export const toBenefitProgramsForm = (
  input: Pick<BenefitProgramsInput, 'cashback' | 'loyalty'>
): BenefitProgramsForm => ({
  cashback: {
    enabled: input.cashback.enabled,
    percentage: input.cashback.percentage ?? '',
    expiresAfterDays: input.cashback.expiresAfterDays?.toString() ?? '',
    minimumOrderAmount: input.cashback.minimumOrderAmount ?? '',
  },
  loyalty: {
    enabled: input.loyalty.enabled,
    requiredOrders: input.loyalty.requiredOrders?.toString() ?? '',
    minimumOrderAmount: input.loyalty.minimumOrderAmount ?? '',
    rewardType: input.loyalty.rewardType ?? '',
    rewardAmount: input.loyalty.rewardAmount ?? '',
    rewardItemId: input.loyalty.rewardItemId?.toString() ?? '',
    rewardExpiresAfterDays:
      input.loyalty.rewardExpiresAfterDays?.toString() ?? '',
  },
})

const decimalOrNull = (value: string) =>
  value.trim() === '' ? null : value.trim().replace(',', '.')
const numberOrNull = (value: string) =>
  value.trim() === '' ? null : Number(value)

export const toBenefitProgramsInput = (
  form: BenefitProgramsForm,
  expectedVersion: number
): BenefitProgramsInput => ({
  expectedVersion,
  cashback: {
    enabled: form.cashback.enabled,
    percentage: decimalOrNull(form.cashback.percentage),
    expiresAfterDays: numberOrNull(form.cashback.expiresAfterDays),
    minimumOrderAmount: decimalOrNull(form.cashback.minimumOrderAmount),
  },
  loyalty: {
    enabled: form.loyalty.enabled,
    requiredOrders: numberOrNull(form.loyalty.requiredOrders),
    minimumOrderAmount: decimalOrNull(form.loyalty.minimumOrderAmount),
    rewardType: form.loyalty.rewardType || null,
    rewardAmount:
      form.loyalty.rewardType === 'cashback'
        ? decimalOrNull(form.loyalty.rewardAmount)
        : null,
    rewardItemId:
      form.loyalty.rewardType === 'product'
        ? numberOrNull(form.loyalty.rewardItemId)
        : null,
    rewardExpiresAfterDays: numberOrNull(form.loyalty.rewardExpiresAfterDays),
  },
})

export const changeRewardType = (
  form: BenefitProgramsForm,
  rewardType: BenefitProgramsForm['loyalty']['rewardType']
): BenefitProgramsForm => ({
  ...form,
  loyalty: { ...form.loyalty, rewardType, rewardAmount: '', rewardItemId: '' },
})

export const changeLoyaltyEnabled = (
  form: BenefitProgramsForm,
  enabled: boolean,
  products: readonly { id: number }[]
): BenefitProgramsForm => {
  const missingRewardProduct =
    !enabled &&
    form.loyalty.rewardItemId !== '' &&
    !products.some(product => String(product.id) === form.loyalty.rewardItemId)
  return {
    ...form,
    loyalty: {
      ...form.loyalty,
      enabled,
      ...(missingRewardProduct
        ? { rewardType: '' as const, rewardItemId: '', rewardAmount: '' }
        : {}),
    },
  }
}
