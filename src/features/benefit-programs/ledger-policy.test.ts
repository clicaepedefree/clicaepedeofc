import { describe, test } from 'bun:test'
import assert from 'node:assert/strict'
import {
  benefitBase,
  benefitExpiry,
  benefitMoney,
  cashbackGain,
  normalizeBenefitPhone,
  refundExpiry,
  splitBenefitCredit,
  validatedDebitAmount,
} from './ledger-policy'

describe('KAN152 pure monetary and identity policies', () => {
  test('BR mobile and landline normalize equivalent local and international forms without guessing country', () => {
    for (const input of [
      '11987654321',
      '(11) 98765-4321',
      '+55 (11) 98765-4321',
      '5511987654321',
    ]) {
      assert.equal(normalizeBenefitPhone(input), '5511987654321')
    }
    for (const input of [
      '1134567890',
      '(11) 3456-7890',
      '+55 (11) 3456-7890',
      '551134567890',
    ]) {
      assert.equal(normalizeBenefitPhone(input), '551134567890')
    }
    // DDD55 mobile is 11 LOCAL digits, never a truncated country code.
    assert.equal(normalizeBenefitPhone('55987654321'), '5555987654321')
    for (const input of [
      null,
      '',
      '123',
      '+1 11987654321',
      '+55987654321',
      '0011987654321',
      '20198765432',
      '11087654321',
      '1164567890',
      'a11987654321',
      '11987654321@s.whatsapp.net',
    ]) {
      assert.equal(normalizeBenefitPhone(input), null, String(input))
    }
  })
  test('uses final server products net of delivery and future server validated spending; floors money and gain', () => {
    assert.equal(benefitBase('102.9999', '2.1234'), '100.87')
    assert.equal(benefitBase('100.00', '10.00', '20.00'), '70.00')
    assert.equal(benefitBase('1', '2'), '0.00')
    assert.equal(cashbackGain('100.87', '3.33'), '3.35')
    assert.equal(cashbackGain('0.01', '1'), '0.00')
    assert.equal(cashbackGain('9999999999.99', '100'), '9999999999.99')
    for (const amount of ['NaN', 'Infinity', '-1'])
      assert.throws(() => benefitMoney(amount))
    assert.throws(() => cashbackGain('100', '100.01'))
  })
  test('debt offsets future gains without negative available; zero and partial compensation', () => {
    assert.deepEqual(splitBenefitCredit('3.00', '5.00'), {
      available: '0.00',
      offset: '3.00',
      debt: '2.00',
    })
    assert.deepEqual(splitBenefitCredit('5.00', '3.00'), {
      available: '2.00',
      offset: '3.00',
      debt: '0.00',
    })
    assert.deepEqual(splitBenefitCredit('5.00', '0.00'), {
      available: '5.00',
      offset: '0.00',
      debt: '0.00',
    })
  })
  test('validity uses UTC 24-hour days; refund retains original or seven days at expiry boundary', () => {
    const at = new Date('2026-11-01T12:34:56.789Z')
    const end = benefitExpiry(at, 30)
    assert.equal(end.toISOString(), '2026-12-01T12:34:56.789Z')
    assert.equal(refundExpiry(end, at).getTime(), end.getTime())
    assert.equal(refundExpiry(at, at).toISOString(), '2026-11-08T12:34:56.789Z')
    assert.equal(
      benefitExpiry(at, 2147483647).toISOString(),
      '9999-12-31T23:59:59.999Z'
    )
    for (const days of [0, -1, 1.1, NaN, Infinity, 2147483648])
      assert.throws(() => benefitExpiry(at, days))
    assert.throws(() => benefitExpiry(new Date(NaN), 1))
    assert.throws(() => refundExpiry(new Date(NaN), at))
  })
  test('debit boundary rejects fractional cents, nonpositive, scientific or localized values', () => {
    assert.equal(validatedDebitAmount('10.01'), '10.01')
    for (const input of [
      '0.00',
      '-1.00',
      '1',
      '1.001',
      '1,00',
      '1e2',
      '01.00',
      'NaN',
      'Infinity',
    ]) {
      assert.throws(() => validatedDebitAmount(input))
    }
  })
})
