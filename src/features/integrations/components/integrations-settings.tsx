import { IFoodConnectionCard } from '@/features/ifood/components/ifood-connection-card'
import { SettingsCategoryBlock } from '@/shared/blocks/settings-category-block'

export const IntegrationsSettings = () => {
  return (
    <div className="space-y-2">
      <SettingsCategoryBlock title="Plataformas de Delivery">
        <IFoodConnectionCard />
      </SettingsCategoryBlock>
    </div>
  )
}
