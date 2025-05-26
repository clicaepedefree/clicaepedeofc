'use client'

import { useAvailableStores } from '@/features/store/hooks/use-available-stores'
import { selectedStoreIdAtom } from '@/features/store/state'
import { Combobox } from '@/shared/combobox'
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

  return (
    <>
      {isLoading && <div>Carregando...</div>}
      {!isLoading && storesOptions?.length && (
        <Combobox
          options={storesOptions}
          value={selectedStoreIdAsString}
          onChange={onChangeStore}
          placeholder="Selecione uma loja"
          searchPlaceholder="Buscar loja"
          noResultMessage="Nenhuma loja encontrada"
          disabled={isLoading}
          disableUnselectingOption
        />
      )}
    </>
  )
}
