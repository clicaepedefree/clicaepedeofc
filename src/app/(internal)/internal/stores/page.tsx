import { requireInternalOperator } from '@/features/internal-operations/access'
import { InternalStoresPanel } from '@/features/internal-operations/components/internal-stores-panel'

type InternalStoresPageProps = {
  searchParams: Promise<{
    status?: string
    q?: string
    result?: string
    error?: string
  }>
}

export default async function InternalStoresPage({
  searchParams,
}: InternalStoresPageProps) {
  const operator = await requireInternalOperator('viewer')
  const params = await searchParams

  return (
    <InternalStoresPanel
      operator={operator}
      searchParams={params}
      basePath="/internal/stores"
    />
  )
}
