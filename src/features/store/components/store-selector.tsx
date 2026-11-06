'use client'

import { AdditionalStoreDialog } from '@/features/store/components/additional-store-dialog'
import { useAvailableStores } from '@/features/store/hooks/use-available-stores'
import { selectedStoreIdAtom } from '@/features/store/state'
import { Combobox } from '@/shared/combobox'
import { Skeleton } from '@/shared/skeleton'
import { useAtom } from 'jotai'
import { Check } from 'lucide-react'

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
    <div className="flex min-w-0 max-w-full items-center gap-2">
      <div className="w-52 min-w-0 max-w-full flex-1">
        <Combobox
          options={storesOptions}
          value={selectedStoreIdAsString}
          onChange={onChangeStore}
          placeholder="Selecione uma loja"
          searchPlaceholder="Buscar loja"
          noResultMessage="Nenhuma loja encontrada"
          disabled={isLoading}
          disableUnselectingOption
          truncateLabel
          contentClassName="w-72 max-w-[calc(100vw-2rem)]"
          customOptionLabelComponent={option => (
            <>
              <Check
                aria-hidden="true"
                className={`mr-2 h-4 w-4 shrink-0 ${option.value === selectedStoreIdAsString ? 'opacity-100' : 'opacity-0'}`}
              />
              <span className="min-w-0 whitespace-normal break-all">
                {option.label}
              </span>
            </>
          )}
        />
      </div>
      <AdditionalStoreDialog />
    </div>
  )
}
