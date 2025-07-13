'use client'

import { AdminPageInfo } from '@/features/admin/components/admin-page-info'
import { getRevenueSummary } from '@/features/reports/api'
import { selectedStoreIdAtom } from '@/features/store/state'
import { Body } from '@/shared/typography/body'
import { Headline } from '@/shared/typography/headline'
import { useQuery } from '@tanstack/react-query'
import { useAtom } from 'jotai'

export default function Page() {
  const [selectedStoreId] = useAtom(selectedStoreIdAtom)
  const { data: revenueSummary } = useQuery({
    queryKey: ['revenue-summary', selectedStoreId],
    queryFn: () => {
      if (!selectedStoreId) throw new Error('No store selected')
      return getRevenueSummary(selectedStoreId, '2025-06-02', '2025-06-03')
    },
    enabled: !!selectedStoreId,
  })

  return (
    <>
      <AdminPageInfo pageInfo={{ title: 'Relatórios' }} />
      <div className="bg-white border-b-2 p-4 space-y-2 ">
        <Headline variant={300}>Relatórios</Headline>
        <Body fontWeight="light" highlight="secondary" variant={100}>
          Receita
        </Body>
      </div>
      <div className="">{JSON.stringify(revenueSummary, null, 2)}</div>
    </>
  )
}
