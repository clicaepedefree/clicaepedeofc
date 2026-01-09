'use client'

import { CompanySettings } from '@/features/legal-entity/components/company-settings'
import { LegalSettings } from '@/features/legal-entity/components/legal-settings'
import { PageHeaderBlock } from '@/shared/blocks/page-header-block'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/tabs'
import { useParams, useRouter } from 'next/navigation'
import { useMemo } from 'react'

const settingsPages = [
  {
    id: 'store',
    title: 'Configuração da loja',
    label: 'Loja',
    pageComponent: () => <>Loja</>,
  },
  {
    id: 'company',
    title: 'Configuração da empresa',
    label: 'Empresa',
    pageComponent: () => <CompanySettings />,
  },
  {
    id: 'fiscal',
    title: 'Configuração fiscal',
    label: 'Fiscal',
    pageComponent: () => <LegalSettings />,
  },
]

const getPageContentById = (id: string) =>
  settingsPages.find(page => page.id === id)

export default function SettingsPage() {
  const router = useRouter()
  const { settingId = 'store' } = useParams<{ settingId?: string }>()

  const settingsPageContent = useMemo(
    () => getPageContentById(settingId),
    [settingId]
  )

  const pageTitle = settingsPageContent?.title ?? undefined

  return (
    <>
      <PageHeaderBlock title="Configurações" subtitle={pageTitle} />
      <Tabs
        value={settingId ?? 'store'}
        onValueChange={settingId => router.replace(`/settings/${settingId}`)}
        className="p-3 relative w-full"
      >
        <TabsList className="gap-2">
          {settingsPages.map(page => (
            <TabsTrigger key={page.id} value={page.id} className="px-4 py-3">
              {page.label}
            </TabsTrigger>
          ))}
        </TabsList>
        {settingsPages.map(page => (
          <TabsContent key={page.id} value={page.id}>
            {page.pageComponent()}
          </TabsContent>
        ))}
      </Tabs>
    </>
  )
}
