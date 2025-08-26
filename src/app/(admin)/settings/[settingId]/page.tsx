'use client'

import { PageHeaderBlock } from '@/shared/blocks/page-header-block'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/tabs'
import { useParams, useRouter } from 'next/navigation'

export default function SettingsPage() {
  const router = useRouter()
  const { settingId } = useParams<{ settingId?: string }>()

  return (
    <>
      <PageHeaderBlock title="Configurações" subtitle="Configurações da loja" />
      <Tabs
        value={settingId ?? 'store'}
        onValueChange={settingId => router.replace(`/settings/${settingId}`)}
        className="p-3"
      >
        <TabsList className="gap-4">
          <TabsTrigger value="store" className="px-4 py-2">
            Loja
          </TabsTrigger>
          <TabsTrigger value="fiscal" className="px-4 py-2">
            Fiscal
          </TabsTrigger>
        </TabsList>
        <TabsContent value="store">Page: Loja</TabsContent>
        <TabsContent value="fiscal">Page: Fiscal</TabsContent>
      </Tabs>
    </>
  )
}
