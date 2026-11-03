import { test } from 'bun:test'
import assert from 'node:assert/strict'
import {
  assertCompletedCancellationStatus,
  completedCancellationCommandSchema,
  summarizeManualRefundPayments,
} from './manual-refund-policy'
import {
  roleHasStorePermission,
  storeUserRoleOptions,
} from '@/features/store-users/store-users-policy'

const command = {
  storeId: 1,
  orderId: 2,
  idempotencyKey: '60a20d59-0000-4000-8000-000000000001',
  reason: 'Erro operacional',
}

test('only owner and all managers have the completed cancellation permission', () => {
  for (const { value } of storeUserRoleOptions) {
    assert.equal(
      roleHasStorePermission(value, 'orders.completed.cancel'),
      ['owner', 'manager'].includes(value)
    )
  }
})

test('commands require valid identifiers, stable key and sanitized nonempty reason', () => {
  assert.equal(
    completedCancellationCommandSchema.parse({
      ...command,
      reason: '\n Erro\u0000 operacional\t',
    }).reason,
    'Erro  operacional'
  )
  for (const reason of [
    '',
    '   ',
    '\u0000\n',
    'cliente@example.com',
    'CPF 123.456.789-00',
    '11999999999',
  ]) {
    assert.throws(() =>
      completedCancellationCommandSchema.parse({ ...command, reason })
    )
  }
  for (const change of [
    { storeId: -1 },
    { orderId: 1.5 },
    { idempotencyKey: 'retry' },
    { actorUserId: 'forged' },
  ]) {
    assert.throws(() =>
      completedCancellationCommandSchema.parse({ ...command, ...change })
    )
  }
  assert.equal(
    completedCancellationCommandSchema.parse({
      ...command,
      reason: 'a'.repeat(1001),
    }).reason.length,
    1000
  )
})

test('only COMPLETED may enter the exceptional cancellation command', () => {
  assertCompletedCancellationStatus('COMPLETED')
  for (const status of [
    'CANCELLED',
    'REJECTED',
    'PENDING',
    'READY',
    'ACCEPTED',
  ])
    assert.throws(() => assertCompletedCancellationStatus(status))
})

test('every payment row requires manual review; pending never means money received', () => {
  const summary = summarizeManualRefundPayments([
    { id: 1, type: 'PREPAID', method: 'CASH', value: '0.1000' },
    { id: 2, type: 'PREPAID', method: 'PIX', value: '0.2000' },
    { id: 3, type: 'PENDING', method: 'CASH', value: '70.0000' },
  ])
  assert.equal(summary.prepaidRecordedAmount, '0.3000')
  assert.equal(summary.pendingNotReceivedAmount, '70.0000')
  assert.equal(summary.receiptVerified, false)
  assert.equal(summary.reviewStatus, 'manual_review_pending')
  assert.equal(
    summarizeManualRefundPayments([
      { id: 1, type: 'PENDING', method: 'PIX', value: '0' },
    ]).reviewStatus,
    'manual_review_pending'
  )
  assert.equal(summarizeManualRefundPayments([]).reviewStatus, 'not_required')
})
