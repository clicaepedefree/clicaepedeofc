import {
  canUseInternalPermission,
  getInternalOperatorSafe,
} from '@/features/internal-operations/access'
import { InternalStoresPanel } from '@/features/internal-operations/components/internal-stores-panel'
import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

type InternalOperationsPageProps = {
  searchParams: Promise<{
    status?: string
    q?: string
    planId?: string
    access?: string
    city?: string
    createdFrom?: string
    createdTo?: string
    page?: string
    result?: string
    error?: string
  }>
}

export default async function InternalOperationsPage({
  searchParams,
}: InternalOperationsPageProps) {
  const operator = await getInternalOperatorSafe()

  if (
    !operator ||
    !canUseInternalPermission({
      currentRole: operator.role,
      permission: 'view_internal_operations',
    })
  ) {
    redirect('/unauthorized')
  }

  const params = await searchParams

  return (
    <InternalStoresPanel
      operator={operator}
      searchParams={params}
      basePath="/internal-operations"
    />
  )
}
