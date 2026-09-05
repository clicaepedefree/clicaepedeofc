import { IFoodConnectionCard } from '@/features/ifood/components/ifood-connection-card'
import { QzTrayConnectionCard } from '@/features/qz-tray/components/qz-tray-connection-card'
import { WhatsappConnectionCard } from '@/features/whatsapp-bot/components/whatsapp-connection-card'
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
        <WhatsappConnectionCard />
      </SettingsCategoryBlock>

      <SettingsCategoryBlock title="Impressao">
        <QzTrayConnectionCard />
      </SettingsCategoryBlock>
    </div>
  )
}
