'use client'

import { PageHeaderBlock } from '@/shared/blocks/page-header-block'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/tabs'
import { useParams, useRouter } from 'next/navigation'

const settingsPageToTitleMapping = {
  store: 'Configuração da loja',
  fiscal: 'Configuração fiscal',
}

export default function SettingsPage() {
  const router = useRouter()
  const { settingId = 'store' } = useParams<{ settingId?: string }>()

  const pageTitle =
    settingsPageToTitleMapping[
      settingId as keyof typeof settingsPageToTitleMapping
    ] ?? undefined
  return (
    <>
      <PageHeaderBlock title="Configurações" subtitle={pageTitle} />
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
