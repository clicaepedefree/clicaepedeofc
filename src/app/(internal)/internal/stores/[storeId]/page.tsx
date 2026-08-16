import { requireInternalOperator } from '@/features/internal-operations/access'
import { InternalStoreOverviewPanel } from '@/features/internal-operations/components/internal-store-overview-panel'
import { getInternalStoreOverview } from '@/features/internal-operations/db'
import { notFound } from 'next/navigation'

type InternalStoreDetailPageProps = {
  params: Promise<{
    storeId: string
  }>
  searchParams: Promise<{
    tab?: string
    result?: string
    error?: string
  }>
}

export default async function InternalStoreDetailPage({
  params,
  searchParams,
}: InternalStoreDetailPageProps) {
  const operator = await requireInternalOperator('viewer')
  const { storeId } = await params
  const { tab, result, error } = await searchParams
  const parsedStoreId = Number(storeId)

  if (!Number.isInteger(parsedStoreId) || parsedStoreId <= 0) {
    notFound()
  }

  const store = await getInternalStoreOverview(parsedStoreId)

  if (!store) {
    notFound()
  }

  return (
    <InternalStoreOverviewPanel
      operator={operator}
      store={store}
      requestedTab={tab}
      result={result}
      error={error}
      basePath={`/internal/stores/${store.id}`}
    />
  )
}
