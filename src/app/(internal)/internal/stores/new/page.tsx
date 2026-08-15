import { InternalStoreCreateWizard } from '@/features/internal-operations/components/internal-store-create-wizard'
import {
  listActiveBillingPlansForInternalCreation,
  listBillingModulesForInternalCreation,
} from '@/features/internal-operations/db'
import { requireInternalOperation } from '@/features/internal-operations/operation-permissions'

export default async function NewInternalStorePage() {
  await requireInternalOperation('createStore')

  const [plans, modules] = await Promise.all([
    listActiveBillingPlansForInternalCreation(),
    listBillingModulesForInternalCreation(),
  ])

  return <InternalStoreCreateWizard plans={plans} modules={modules} />
}
