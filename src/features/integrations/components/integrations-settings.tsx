'use client'

import { IFoodConnectionCard } from '@/features/ifood/components/ifood-connection-card'
import { QzTrayConnectionCard } from '@/features/qz-tray/components/qz-tray-connection-card'
import { WhatsappAutomationSettings } from '@/features/whatsapp-bot/components/whatsapp-automation-settings'
import { SettingsCategoryBlock } from '@/shared/blocks/settings-category-block'
import { useAvailableStores } from '@/features/store/hooks/use-available-stores'
import { getIntegrationsAccess } from '../integrations-access'

export const IntegrationsSettings = () => {
  const { stores, selectedStoreId, isLoading, isError } = useAvailableStores()
  const access = getIntegrationsAccess({
    stores,
    selectedStoreId,
    isLoading,
    isError,
  })

  if (access !== 'allowed') {
    return (
      <div
        role={access === 'loading' ? 'status' : 'alert'}
        className="min-w-0 border p-4 text-sm text-muted-foreground"
      >
        {access === 'loading'
          ? 'Verificando permissoes de integracoes...'
          : access === 'denied'
            ? 'Voce nao tem permissao para gerenciar integracoes desta loja. Peca acesso a um proprietario ou gerente. Estado das conexoes desconhecido; controles bloqueados.'
            : 'Nao foi possivel verificar o acesso as integracoes. Selecione uma loja ou tente novamente. Estado das conexoes desconhecido; controles bloqueados.'}
      </div>
    )
  }

  return (
    <div className="min-w-0 space-y-4">
      <SettingsCategoryBlock
        title="Plataformas de Delivery"
        contentClassName="grid-cols-1 min-w-0"
      >
        <IFoodConnectionCard />
      </SettingsCategoryBlock>

      <SettingsCategoryBlock
        title="Atendimento automatizado"
        contentClassName="grid-cols-1 min-w-0"
      >
        <WhatsappAutomationSettings />
      </SettingsCategoryBlock>

      <SettingsCategoryBlock
        title="Impressao"
        contentClassName="grid-cols-1 min-w-0"
      >
        <QzTrayConnectionCard />
      </SettingsCategoryBlock>
    </div>
  )
}
