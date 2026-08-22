import { requireInternalOperator } from '@/features/internal-operations/access'
import { InternalMonitoringPanel } from '@/features/internal-operations/components/internal-monitoring-panel'

export default async function InternalMonitoringPage() {
  await requireInternalOperator('viewer')

  return <InternalMonitoringPanel basePath="/internal/monitoring" />
}
