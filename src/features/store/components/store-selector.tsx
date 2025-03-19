'use client'

import { Combobox } from '@/shared/combobox'
import { useAvailableStores } from '../hooks/use-available-stores'
import { useAtom } from 'jotai'
import { selectedStoreIdAtom } from '../state'

export const StoreSelector = () => {
  const { stores, isLoading } = useAvailableStores()
  const [selectedStoreId, setSelectedStoreId] = useAtom(selectedStoreIdAtom)

  const storesOptions = stores?.map(store => ({
    value: String(store.id),
    label: store.name,
  }))
  return (
    <>
      {isLoading && <div>Carregando...</div>}
      {!isLoading && storesOptions?.length && (
        <Combobox
          options={storesOptions}
          value={selectedStoreId ?? ''}
          onChange={setSelectedStoreId}
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
