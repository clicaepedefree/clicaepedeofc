import { describe, expect, test } from 'bun:test'
import {
  changeLoyaltyEnabled,
  changeRewardType,
  toBenefitProgramsForm,
  toBenefitProgramsInput,
} from './benefit-programs-form'

const empty = () =>
  toBenefitProgramsForm({
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
  })

describe('benefit programs form mapping', () => {
  test('disabling clears a deleted reward product only in the new configuration payload', () => {
    const saved = empty()
    saved.loyalty = {
      ...saved.loyalty,
      enabled: true,
      rewardType: 'product',
      rewardItemId: '123',
      requiredOrders: '10',
      minimumOrderAmount: '0',
      rewardExpiresAfterDays: '30',
    }
    const next = changeLoyaltyEnabled(saved, false, [])
    const input = toBenefitProgramsInput(next, 4)
    expect(input.loyalty.enabled).toBe(false)
    expect(input.loyalty.rewardItemId).toBe(null)
    expect(input.loyalty.rewardType).toBe(null)
    expect(input.loyalty.rewardAmount).toBe(null)
    expect(input.loyalty.requiredOrders).toBe(10)
    expect(saved.loyalty.rewardItemId).toBe('123')
    expect(saved.loyalty.enabled).toBe(true)
    expect(
      toBenefitProgramsInput(
        changeLoyaltyEnabled(saved, false, [{ id: 123 }]),
        4
      ).loyalty.rewardItemId
    ).toBe(123)
    expect(changeLoyaltyEnabled(saved, true, []).loyalty.rewardItemId).toBe(
      '123'
    )
  })

  test('starts disabled without commercial defaults and sends blanks as null, not zero', () => {
    const form = empty()
    expect(form.cashback.enabled).toBe(false)
    expect(form.loyalty.enabled).toBe(false)
    expect(form.cashback.percentage).toBe('')
    expect(form.loyalty.requiredOrders).toBe('')
    const input = toBenefitProgramsInput(form, 0)
    expect(input.expectedVersion).toBe(0)
    expect(input.cashback.expiresAfterDays).toBe(null)
    expect(input.cashback.minimumOrderAmount).toBe(null)
    expect(input.loyalty.rewardType).toBe(null)
    expect(input.loyalty.rewardItemId).toBe(null)
    expect(input.loyalty.requiredOrders).toBe(null)
  })

  test('preserves configured values when disabled, including explicit zero minimum', () => {
    const form = empty()
    form.cashback.percentage = '2.50'
    form.cashback.minimumOrderAmount = '0'
    form.cashback.expiresAfterDays = '30'
    form.loyalty.requiredOrders = '10'
    form.loyalty.rewardType = 'product'
    form.loyalty.rewardItemId = '123'
    const input = toBenefitProgramsInput(form, 4)
    expect(input.cashback.enabled).toBe(false)
    expect(input.cashback.percentage).toBe('2.50')
    expect(input.cashback.minimumOrderAmount).toBe('0')
    expect(input.cashback.expiresAfterDays).toBe(30)
    expect(input.loyalty.rewardItemId).toBe(123)
    expect(input.loyalty.requiredOrders).toBe(10)
    expect(toBenefitProgramsForm(input)).toEqual(form)
  })

  test('clears the obsolete reward branch without adding a new default', () => {
    const form = empty()
    form.loyalty.rewardType = 'cashback'
    form.loyalty.rewardAmount = '12,50'
    expect(toBenefitProgramsInput(form, 2).loyalty.rewardAmount).toBe('12.50')
    const changed = changeRewardType(form, 'product')
    expect(changed.loyalty.rewardAmount).toBe('')
    expect(changed.loyalty.rewardItemId).toBe('')
    expect(toBenefitProgramsInput(changed, 2).loyalty.rewardAmount).toBe(null)
    expect(form.loyalty.rewardAmount).toBe('12,50')
  })
})
