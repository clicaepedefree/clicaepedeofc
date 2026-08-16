import { describe, expect, test } from 'bun:test'
import {
  canViewInternalStoreDetailTab,
  getVisibleInternalStoreDetailTabs,
  parseInternalStoreDetailTab,
  resolveInternalStoreDetailTab,
} from './detail-tabs-policy'

describe('internal store detail tabs policy', () => {
  test('accepts only known store detail tabs', () => {
    expect(parseInternalStoreDetailTab('dados')).toBe('dados')
    expect(parseInternalStoreDetailTab('faturas')).toBe('faturas')
    expect(parseInternalStoreDetailTab('financeiro')).toBe(undefined)
    expect(parseInternalStoreDetailTab(undefined)).toBe(undefined)
  })

  test('limits financial tabs to roles with billing permissions', () => {
    expect(
      canViewInternalStoreDetailTab({ role: 'finance', tab: 'faturas' })
    ).toBe(true)
    expect(
      canViewInternalStoreDetailTab({ role: 'viewer', tab: 'faturas' })
    ).toBe(false)
    expect(canViewInternalStoreDetailTab({ role: 'viewer', tab: 'dados' })).toBe(
      true
    )
  })

  test('resolves unavailable or invalid tabs to the first visible tab', () => {
    expect(
      resolveInternalStoreDetailTab({
        role: 'viewer',
        requestedTab: 'faturas',
      })
    ).toBe('dados')
    expect(
      resolveInternalStoreDetailTab({
        role: 'finance',
        requestedTab: 'faturas',
      })
    ).toBe('faturas')
    expect(
      resolveInternalStoreDetailTab({
        role: 'support',
        requestedTab: 'nao-existe',
      })
    ).toBe('dados')
  })

  test('keeps viewer navigation read-only and operational roles scoped', () => {
    expect(
      getVisibleInternalStoreDetailTabs('viewer').map(tab => tab.value)
    ).toEqual(['dados', 'metricas', 'historico'])
    expect(
      getVisibleInternalStoreDetailTabs('implementation').map(tab => tab.value)
    ).toEqual(['dados', 'metricas', 'usuarios', 'historico'])
  })
})
