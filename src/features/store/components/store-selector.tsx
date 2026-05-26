'use client'

import { AdditionalStoreDialog } from '@/features/store/components/additional-store-dialog'
import { useAvailableStores } from '@/features/store/hooks/use-available-stores'
import { selectedStoreIdAtom } from '@/features/store/state'
import { Combobox } from '@/shared/combobox'
import { Skeleton } from '@/shared/skeleton'
import { useAtom } from 'jotai'

export const StoreSelector = () => {
  const { stores, isLoading } = useAvailableStores()
  const [selectedStoreId, setSelectedStoreId] = useAtom(selectedStoreIdAtom)

  const storesOptions = stores?.map(store => ({
    value: String(store.id),
    label: store.name,
  }))

  const onChangeStore = (storeId: string) => {
    setSelectedStoreId(Number(storeId))
  }

  const selectedStoreIdAsString = selectedStoreId ? String(selectedStoreId) : ''

  if (isLoading) {
    return <Skeleton className="h-9 w-40" />
  }

  if (!storesOptions?.length) return null

  return (
    <div className="flex items-center gap-2">
      <div className="min-w-36 max-w-52">
        <Combobox
          options={storesOptions}
          value={selectedStoreIdAsString}
          onChange={onChangeStore}
          placeholder="Selecione uma loja"
          searchPlaceholder="Buscar loja"
          noResultMessage="Nenhuma loja encontrada"
          disabled={isLoading}
          disableUnselectingOption
          contentClassName="min-w-fit"
        />
      </div>
      <AdditionalStoreDialog />
    </div>
  )
}
