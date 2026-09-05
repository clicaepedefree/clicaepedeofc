import { IFoodConnectionCard } from '@/features/ifood/components/ifood-connection-card'
import { QzTrayConnectionCard } from '@/features/qz-tray/components/qz-tray-connection-card'
import { WhatsappAutomationSettings } from '@/features/whatsapp-bot/components/whatsapp-automation-settings'
import { SettingsCategoryBlock } from '@/shared/blocks/settings-category-block'

export const IntegrationsSettings = () => {
  return (
    <div className="space-y-4">
      <SettingsCategoryBlock title="Plataformas de Delivery">
        <IFoodConnectionCard />
      </SettingsCategoryBlock>

      <SettingsCategoryBlock
        title="Atendimento automatizado"
        contentClassName="grid-cols-1"
      >
        <WhatsappAutomationSettings />
      </SettingsCategoryBlock>

      <SettingsCategoryBlock title="Impressao">
        <QzTrayConnectionCard />
      </SettingsCategoryBlock>
    </div>
  )
}
