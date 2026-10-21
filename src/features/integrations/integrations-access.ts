import {
  roleHasStorePermission,
  type StoreUserRole,
} from '@/features/store-users/store-users-policy'

// Presentation gate only. Server actions must still authorize every request.
export function getIntegrationsAccess({
  stores,
  selectedStoreId,
  isLoading,
  isError,
}: {
  stores?: ReadonlyArray<{ id: number; userRole: string | null }>
  selectedStoreId: number | null
  isLoading: boolean
  isError: boolean
}): 'allowed' | 'denied' | 'loading' | 'unknown' {
  if (isLoading) return 'loading'
  if (isError) return 'unknown'
  const role = stores?.find(store => store.id === selectedStoreId)?.userRole
  if (
    !role ||
    ![
      'owner',
      'admin',
      'manager',
      'attendant',
      'cashier',
      'waiter',
      'courier',
    ].includes(role)
  )
    return 'unknown'
  return roleHasStorePermission(
    role as StoreUserRole | 'admin',
    'integrations.manage'
  )
    ? 'allowed'
    : 'denied'
}
