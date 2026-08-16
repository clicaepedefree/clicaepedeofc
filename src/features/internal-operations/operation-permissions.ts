import type { InternalPermission } from './access'
import {
  canUseInternalPermission,
  requireInternalPermission,
  type InternalOperator,
} from './access'

export const internalOperationPermissionRequirements = {
  createStore: 'create_store',
  manageStoreProfile: 'manage_store_profile',
  manageImplementationChecklist: 'manage_implementation_checklist',
  activateImplementedStore: 'activate_implemented_store',
  reactivateStore: 'reactivate_store',
  archiveStore: 'archive_store',
  manageBillingValues: 'manage_billing_values',
  manageBillingInvoices: 'manage_billing_invoices',
  applyBillingDiscounts: 'apply_billing_discounts',
  cancelBilling: 'cancel_billing',
  blockStore: 'block_store',
} as const satisfies Record<string, InternalPermission>

export type InternalOperationKey =
  keyof typeof internalOperationPermissionRequirements

export function canRunInternalOperation({
  operator,
  operation,
}: {
  operator: Pick<InternalOperator, 'role'> | null
  operation: InternalOperationKey
}) {
  return canUseInternalPermission({
    currentRole: operator?.role ?? null,
    permission: internalOperationPermissionRequirements[operation],
  })
}

export async function requireInternalOperation(
  operation: InternalOperationKey
) {
  return await requireInternalPermission(
    internalOperationPermissionRequirements[operation]
  )
}
