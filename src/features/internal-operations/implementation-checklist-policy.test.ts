import { describe, expect, test } from 'bun:test'
import {
  getStoreImplementationChecklistProgress,
  isStoreImplementationChecklistItemKey,
  storeImplementationChecklistDefinitions,
} from './implementation-checklist-policy'

describe('store implementation checklist policy', () => {
  test('requires every configured required item before activation', () => {
    const pendingItems = storeImplementationChecklistDefinitions.map(
      definition => ({
        status: 'pending' as const,
        requiredForActivation: definition.requiredForActivation,
      })
    )

    expect(getStoreImplementationChecklistProgress(pendingItems)).toEqual({
      total: 5,
      completed: 0,
      requiredTotal: 5,
      requiredCompleted: 0,
      percent: 0,
      canActivate: false,
    })

    const completedItems = pendingItems.map(item => ({
      ...item,
      status: 'completed' as const,
    }))

    expect(
      getStoreImplementationChecklistProgress(completedItems).canActivate
    ).toBe(true)
  })

  test('calculates visible progress independently from activation rules', () => {
    const progress = getStoreImplementationChecklistProgress([
      { status: 'completed', requiredForActivation: true },
      { status: 'pending', requiredForActivation: true },
      { status: 'completed', requiredForActivation: false },
    ])

    expect(progress.percent).toBe(67)
    expect(progress.completed).toBe(2)
    expect(progress.requiredCompleted).toBe(1)
    expect(progress.canActivate).toBe(false)
  })

  test('accepts only configured checklist keys', () => {
    expect(isStoreImplementationChecklistItemKey('menu')).toBe(true)
    expect(isStoreImplementationChecklistItemKey('training')).toBe(true)
    expect(isStoreImplementationChecklistItemKey('billing')).toBe(false)
  })
})
