import { describe, test } from 'bun:test'
import assert from 'node:assert/strict'
import {
  ProductRewardError,
  productRewardAvailability,
  productRewardIdentity,
  productRewardState,
  productRewardVoucherCode,
} from './product-rewards-policy'

const at = new Date('2026-11-03T12:00:00Z')
const grant = {
  state: 'confirmed' as const,
  confirmedAt: new Date('2026-11-01T12:00:00Z'),
  expiresAt: new Date('2026-11-10T12:00:00Z'),
}

describe('product reward rights policy', () => {
  test('pending participation is never a right available for reservation', () => {
    assert.equal(
      productRewardState(
        { state: 'pending', confirmedAt: null, expiresAt: null },
        undefined,
        at
      ),
      'pending'
    )
    assert.equal(
      productRewardState({ ...grant, state: 'pending' }, undefined, at),
      'suspended'
    )
    assert.equal(
      productRewardState({ ...grant, state: 'reversed' }, undefined, at),
      'reversed'
    )
  })
  test('validity is original and exclusive, including a returned expired right', () => {
    assert.equal(productRewardState(grant, undefined, at), 'available')
    assert.equal(
      productRewardState(grant, { state: 'refunded' }, grant.expiresAt),
      'expired'
    )
    assert.equal(
      productRewardState(grant, { state: 'refunded' }, at),
      'available'
    )
    assert.equal(
      productRewardState(grant, { state: 'refunded' }, new Date('2026-12-01')),
      'expired'
    )
  })
  test('an allocated/consumed right cannot be reused after expiry or suspension', () => {
    const suspended = { ...grant, state: 'pending' as const }
    assert.equal(
      productRewardState(suspended, { state: 'reserved' }, grant.expiresAt),
      'reserved'
    )
    assert.equal(
      productRewardState(suspended, { state: 'completed' }, grant.expiresAt),
      'consumed'
    )
    assert.equal(
      productRewardState(suspended, { state: 'refunded' }, at),
      'suspended'
    )
  })
  test('deleted/unavailable/out of stock products retain distinct catalog states', () => {
    assert.equal(productRewardAvailability(undefined, false), 'deleted')
    assert.equal(
      productRewardAvailability({ inventory: 0 }, true),
      'out_of_stock'
    )
    assert.equal(
      productRewardAvailability({ inventory: 1 }, false),
      'unavailable'
    )
    assert.equal(productRewardAvailability({ inventory: 1 }, true), 'available')
    assert.equal(
      productRewardAvailability({ inventory: null }, true),
      'available'
    )
  })
  test('identity normalization is strict and errors reveal no phone, store or voucher', () => {
    assert.equal(
      productRewardIdentity(1, '+55 (11) 98765-4321'),
      '5511987654321'
    )
    for (const [storeId, phone] of [
      [0, '11987654321'],
      [1, '123'],
      [NaN, '11987654321'],
    ] as const) {
      assert.throws(
        () => productRewardIdentity(storeId, phone),
        error => {
          assert(error instanceof ProductRewardError)
          assert.equal(error.code, 'PRODUCT_REWARD_UNAVAILABLE')
          assert.equal(
            error.message,
            'Este premio nao esta disponivel para este pedido.'
          )
          return true
        }
      )
    }
    assert.equal(productRewardVoucherCode('fixture-grant'), 'FID-fixture-grant')
  })
})
