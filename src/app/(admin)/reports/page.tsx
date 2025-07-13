'use client'

import { AdminPageInfo } from '@/features/admin/components/admin-page-info'
import { selectedStoreIdAtom } from '@/features/store/state'
import { Body } from '@/shared/typography/body'
import { Headline } from '@/shared/typography/headline'
import { useAtom } from 'jotai'

export default function Page() {
  const [selectedStoreId] = useAtom(selectedStoreIdAtom)

  return (
    <>
      <AdminPageInfo pageInfo={{ title: 'Relatórios' }} />
      <div className="bg-white border-b-2 p-4 space-y-2 ">
        <Headline variant={300}>Relatórios</Headline>
        <Body fontWeight="light" highlight="secondary" variant={100}>
          Receita
        </Body>
      </div>
      <div className="">Gráfico</div>
    </>
  )
}
