import { requireInternalOperator } from '@/features/internal-operations/access'
import { InternalStoreOverviewPanel } from '@/features/internal-operations/components/internal-store-overview-panel'
import {
  getInternalStoreOverview,
  listActiveBillingPlansForInternalCreation,
} from '@/features/internal-operations/db'
import { canRunInternalOperation } from '@/features/internal-operations/operation-permissions'
import { notFound } from 'next/navigation'

type InternalStoreDetailPageProps = {
  params: Promise<{
    storeId: string
  }>
  searchParams: Promise<{
    tab?: string
    invoiceStatus?: string
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
  const { tab, invoiceStatus, result, error } = await searchParams
  const parsedStoreId = Number(storeId)

  if (!Number.isInteger(parsedStoreId) || parsedStoreId <= 0) {
    notFound()
  }

  const [store, billingPlans] = await Promise.all([
    getInternalStoreOverview(parsedStoreId, {
      includeBillingInvoices: canRunInternalOperation({
        operator,
        operation: 'manageBillingInvoices',
      }),
      invoiceStatus,
    }),
    listActiveBillingPlansForInternalCreation(),
  ])

  if (!store) {
    notFound()
  }

  return (
    <InternalStoreOverviewPanel
      operator={operator}
      store={store}
      billingPlans={billingPlans}
      requestedTab={tab}
      invoiceStatus={invoiceStatus}
      result={result}
      error={error}
      basePath={`/internal/stores/${store.id}`}
    />
  )
}
