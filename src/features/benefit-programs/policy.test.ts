import { describe, test } from 'bun:test'
import assert from 'node:assert/strict'
import {
  assertBenefitModules,
  benefitProgramsInputSchema as schema,
  unconfiguredBenefitPrograms,
  type BenefitProgramsInput,
} from './policy'

const empty = (): BenefitProgramsInput => ({
  expectedVersion: 0,
  ...unconfiguredBenefitPrograms(),
})
const enabled = (): BenefitProgramsInput => ({
  expectedVersion: 0,
  cashback: {
    enabled: true,
    percentage: '5.25',
    expiresAfterDays: 30,
    minimumOrderAmount: '0',
  },
  loyalty: {
    enabled: true,
    requiredOrders: 5,
    minimumOrderAmount: '10.00',
    rewardType: 'cashback',
    rewardAmount: '15.50',
    rewardItemId: null,
    rewardExpiresAfterDays: 30,
  },
})

describe('benefit configuration validation', () => {
  test('no commercial defaults; accepts disabled null configuration and cumulative programs', () => {
    assert(schema.safeParse(empty()).success)
    assert(schema.safeParse(enabled()).success)
    assert.equal(empty().cashback.percentage, null)
  })
  test('rejects incomplete enabled programs without silently supplying defaults', () => {
    for (const program of ['cashback', 'loyalty'] as const) {
      const value = empty()
      value[program].enabled = true
      assert.equal(schema.safeParse(value).success, false)
    }
    for (const field of [
      'percentage',
      'expiresAfterDays',
      'minimumOrderAmount',
    ]) {
      const value = enabled()
      Object.assign(value.cashback, { [field]: null })
      assert.equal(schema.safeParse(value).success, false)
    }
    for (const field of [
      'requiredOrders',
      'minimumOrderAmount',
      'rewardType',
      'rewardAmount',
      'rewardExpiresAfterDays',
    ]) {
      const value = enabled()
      Object.assign(value.loyalty, { [field]: null })
      assert.equal(schema.safeParse(value).success, false)
    }
  })
  test('decimal strings reject coercion, signs, comma, exponent and excessive precision/size', () => {
    for (const bad of [
      '-1',
      '+1',
      '.5',
      '01',
      '1.',
      '1e2',
      '1,25',
      ' 5',
      'NaN',
      'Infinity',
      '1.001',
      '10000000000',
      '',
      5,
      null,
    ]) {
      const value = enabled()
      Object.assign(value.cashback, { minimumOrderAmount: bad })
      assert.equal(schema.safeParse(value).success, false, String(bad))
    }
    for (const bad of ['0', '0.00', '100.01', '101', '1.001']) {
      const value = enabled()
      value.cashback.percentage = bad
      assert.equal(schema.safeParse(value).success, false)
    }
    const value = enabled()
    value.cashback.percentage = '100.00'
    value.loyalty.rewardAmount = '9999999999.99'
    assert(schema.safeParse(value).success)
    value.loyalty.rewardAmount = '0'
    assert.equal(schema.safeParse(value).success, false)
  })
  test('bounds every integer and rejects malformed request shapes', () => {
    for (const bad of [-1, 0, 1.5, NaN, Infinity, 2147483648, '1']) {
      const value = enabled()
      Object.assign(value.loyalty, { requiredOrders: bad })
      assert.equal(schema.safeParse(value).success, false)
    }
    for (const bad of [-1, 0.5, NaN, Infinity, 2147483647, '0']) {
      assert.equal(
        schema.safeParse({ ...empty(), expectedVersion: bad }).success,
        false
      )
    }
    for (const value of [
      null,
      {},
      { ...empty(), storeId: 99 },
      { ...empty(), cashback: { enabled: 'false' } },
    ]) {
      assert.equal(schema.safeParse(value).success, false)
    }
  })
  test('enforces reward discrimination, including stale fields while disabled', () => {
    const value = enabled()
    value.loyalty.rewardType = 'product'
    value.loyalty.rewardAmount = null
    assert.equal(schema.safeParse(value).success, false)
    value.loyalty.rewardItemId = 7
    assert(schema.safeParse(value).success)
    value.loyalty.rewardAmount = '10'
    assert.equal(schema.safeParse(value).success, false)
    value.loyalty.enabled = false
    assert.equal(schema.safeParse(value).success, false)
    value.loyalty.rewardType = 'cashback'
    value.loyalty.rewardItemId = null
    assert(schema.safeParse(value).success)
  })
  test('inactive modules cannot enable programs but can disable them', () => {
    assert.throws(() =>
      assertBenefitModules(enabled(), { cashback: false, loyalty: true })
    )
    assert.throws(() =>
      assertBenefitModules(enabled(), { cashback: true, loyalty: false })
    )
    assert.doesNotThrow(() =>
      assertBenefitModules(empty(), { cashback: false, loyalty: false })
    )
  })
})
