import { describe, expect, test } from 'bun:test'
import {
  canUseInternalPermission,
  canUseInternalRole,
  canExportInternalPersonalData,
  canViewInternalPersonalData,
  internalPermissions,
  internalRoles,
  parseInternalRole,
  requireInternalPersonalDataExportPermission,
  type InternalPermission,
  type InternalRole,
} from './access'
import {
  canRunInternalOperation,
  internalOperationPermissionRequirements,
} from './operation-permissions'

const expectPermissions = ({
  role,
  allowed,
}: {
  role: InternalRole | null
  allowed: InternalPermission[]
}) => {
  for (const permission of internalPermissions) {
    expect(canUseInternalPermission({ currentRole: role, permission })).toBe(
      allowed.includes(permission)
    )
  }
}

describe('internal operation access policy', () => {
  test('accepts only known internal roles', () => {
    expect(internalRoles).toEqual([
      'superadmin',
      'finance',
      'support',
      'sales',
      'implementation',
      'viewer',
    ])
    expect(parseInternalRole('superadmin')).toBe('superadmin')
    expect(parseInternalRole('finance')).toBe('finance')
    expect(parseInternalRole('viewer')).toBe('viewer')
    expect(parseInternalRole('support')).toBe('support')
    expect(parseInternalRole('sales')).toBe('sales')
    expect(parseInternalRole('implementation')).toBe('implementation')
    expect(parseInternalRole('ops_admin')).toBe('superadmin')
    expect(parseInternalRole('admin')).toBe(null)
    expect(parseInternalRole(undefined)).toBe(null)
  })

  test('keeps legacy role hierarchy checks only for page gates', () => {
    expect(
      canUseInternalRole({ currentRole: 'viewer', minimumRole: 'viewer' })
    ).toBe(true)
    expect(
      canUseInternalRole({ currentRole: 'viewer', minimumRole: 'support' })
    ).toBe(false)
    expect(
      canUseInternalRole({ currentRole: 'support', minimumRole: 'viewer' })
    ).toBe(true)
    expect(
      canUseInternalRole({ currentRole: 'support', minimumRole: 'superadmin' })
    ).toBe(false)
    expect(
      canUseInternalRole({ currentRole: 'superadmin', minimumRole: 'support' })
    ).toBe(true)
    expect(
      canUseInternalRole({ currentRole: 'finance', minimumRole: 'support' })
    ).toBe(false)
    expect(
      canUseInternalRole({ currentRole: null, minimumRole: 'viewer' })
    ).toBe(false)
  })

  test('grants every sensitive operation to superadmin', () => {
    expectPermissions({
      role: 'superadmin',
      allowed: [...internalPermissions],
    })
  })

  test('limits finance to values, invoices, discounts and billing cancellation', () => {
    expectPermissions({
      role: 'finance',
      allowed: [
        'view_internal_operations',
        'manage_billing_values',
        'manage_billing_invoices',
        'apply_billing_discounts',
        'cancel_billing',
        'manage_store_modules',
      ],
    })
  })

  test('limits support to support operations without billing changes', () => {
    expectPermissions({
      role: 'support',
      allowed: [
        'view_internal_operations',
        'reactivate_store',
        'block_store',
      ],
    })
  })

  test('allows sales to apply commercial discounts without changing invoices', () => {
    expectPermissions({
      role: 'sales',
      allowed: [
        'view_internal_operations',
        'view_personal_data',
        'create_store',
        'manage_store_profile',
        'manage_implementation_checklist',
        'manage_store_lifecycle',
        'apply_billing_discounts',
        'manage_store_modules',
      ],
    })
  })

  test('allows implementation to activate stores without billing access', () => {
    expectPermissions({
      role: 'implementation',
      allowed: [
        'view_internal_operations',
        'view_personal_data',
        'manage_store_profile',
        'manage_implementation_checklist',
        'activate_implemented_store',
        'manage_store_lifecycle',
        'reactivate_store',
        'manage_store_modules',
      ],
    })
  })

  test('keeps viewer read-only and denies unauthenticated operators', () => {
    expectPermissions({
      role: 'viewer',
      allowed: ['view_internal_operations'],
    })
    expectPermissions({ role: null, allowed: [] })
  })

  test('maps backend internal operations to explicit permissions', () => {
    expect(internalOperationPermissionRequirements).toEqual({
      createStore: 'create_store',
      manageImplementationChecklist: 'manage_implementation_checklist',
      activateImplementedStore: 'activate_implemented_store',
      manageStoreLifecycle: 'manage_store_lifecycle',
      reactivateStore: 'reactivate_store',
      archiveStore: 'archive_store',
      manageStoreProfile: 'manage_store_profile',
      manageBillingValues: 'manage_billing_values',
      manageBillingInvoices: 'manage_billing_invoices',
      applyBillingDiscounts: 'apply_billing_discounts',
      cancelBilling: 'cancel_billing',
      manageStoreModules: 'manage_store_modules',
      blockStore: 'block_store',
      exportPersonalData: 'export_personal_data',
    })
  })

  test('authorizes backend operations through the operation permission map', () => {
    expect(
      canRunInternalOperation({
        operator: { role: 'sales' },
        operation: 'createStore',
      })
    ).toBe(true)
    expect(
      canRunInternalOperation({
        operator: { role: 'support' },
        operation: 'createStore',
      })
    ).toBe(false)
    expect(
      canRunInternalOperation({
        operator: { role: 'implementation' },
        operation: 'activateImplementedStore',
      })
    ).toBe(true)
    expect(
      canRunInternalOperation({
        operator: { role: 'sales' },
        operation: 'activateImplementedStore',
      })
    ).toBe(false)
    expect(
      canRunInternalOperation({
        operator: { role: 'support' },
        operation: 'archiveStore',
      })
    ).toBe(false)
    expect(
      canRunInternalOperation({
        operator: { role: 'finance' },
        operation: 'manageBillingInvoices',
      })
    ).toBe(true)
    expect(
      canRunInternalOperation({
        operator: { role: 'sales' },
        operation: 'manageBillingValues',
      })
    ).toBe(false)
    expect(
      canRunInternalOperation({
        operator: { role: 'support' },
        operation: 'blockStore',
      })
    ).toBe(true)
    expect(
      canRunInternalOperation({
        operator: { role: 'implementation' },
        operation: 'manageStoreModules',
      })
    ).toBe(true)
    expect(
      canRunInternalOperation({
        operator: { role: 'viewer' },
        operation: 'manageStoreModules',
      })
    ).toBe(false)
    expect(
      canRunInternalOperation({
        operator: null,
        operation: 'applyBillingDiscounts',
      })
    ).toBe(false)
  })

  test('separates personal data visibility from export authorization', () => {
    expect(canViewInternalPersonalData({ role: 'superadmin' })).toBe(true)
    expect(canViewInternalPersonalData({ role: 'sales' })).toBe(true)
    expect(canViewInternalPersonalData({ role: 'implementation' })).toBe(true)
    expect(canViewInternalPersonalData({ role: 'finance' })).toBe(false)
    expect(canViewInternalPersonalData({ role: 'support' })).toBe(false)
    expect(canViewInternalPersonalData({ role: 'viewer' })).toBe(false)

    expect(canExportInternalPersonalData({ role: 'superadmin' })).toBe(true)
    expect(canExportInternalPersonalData({ role: 'sales' })).toBe(false)
    expect(canExportInternalPersonalData({ role: 'implementation' })).toBe(
      false
    )
    expect(canExportInternalPersonalData({ role: 'finance' })).toBe(false)
    expect(canExportInternalPersonalData({ role: 'support' })).toBe(false)
    expect(canExportInternalPersonalData({ role: 'viewer' })).toBe(false)

    expect(() =>
      requireInternalPersonalDataExportPermission({ role: 'viewer' })
    ).toThrow('INTERNAL_PERSONAL_DATA_EXPORT_FORBIDDEN')
    expect(() =>
      requireInternalPersonalDataExportPermission({ role: 'superadmin' })
    ).not.toThrow()
  })
})
