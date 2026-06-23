'use client'

import {
  deleteStoreDeliveryZone,
  getStoreDeliveryConfiguration,
  saveStoreDeliverySettings,
  saveStoreDeliveryZone,
  type StoreDeliverySettingsInput,
  type StoreDeliveryZoneInput,
} from '@/features/store/delivery-api'
import { storeDeliveryConfigurationCacheKey } from '@/features/store/cache-keys'
import { selectedStoreIdAtom } from '@/features/store/state'
import { dispatchToast } from '@/shared/lib/toast'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAtomValue } from 'jotai'

export const useStoreDeliveryConfiguration = () => {
  const selectedStoreId = useAtomValue(selectedStoreIdAtom)
  const queryClient = useQueryClient()
  const queryKey = storeDeliveryConfigurationCacheKey(selectedStoreId)

  const query = useQuery({
    enabled: !!selectedStoreId,
    queryKey,
    queryFn: () => {
      if (!selectedStoreId) throw new Error('No store selected')
      return getStoreDeliveryConfiguration(selectedStoreId)
    },
  })

  const invalidate = () =>
    queryClient.invalidateQueries({
      queryKey,
    })

  const settingsMutation = useMutation({
    mutationFn: (values: StoreDeliverySettingsInput) => {
      if (!selectedStoreId) throw new Error('No store selected')
      return saveStoreDeliverySettings(selectedStoreId, values)
    },
    onSuccess: () => {
      dispatchToast({ type: 'success', message: 'Configurações de entrega salvas.' })
      invalidate()
    },
    onError: () => {
      dispatchToast({ type: 'error', message: 'Não foi possível salvar a entrega.' })
    },
  })

  const zoneMutation = useMutation({
    mutationFn: (values: StoreDeliveryZoneInput) => {
      if (!selectedStoreId) throw new Error('No store selected')
      return saveStoreDeliveryZone(selectedStoreId, values)
    },
    onSuccess: () => {
      dispatchToast({ type: 'success', message: 'Região de entrega salva.' })
      invalidate()
    },
    onError: () => {
      dispatchToast({ type: 'error', message: 'Não foi possível salvar a região.' })
    },
  })

  const deleteZoneMutation = useMutation({
    mutationFn: (zoneId: number) => {
      if (!selectedStoreId) throw new Error('No store selected')
      return deleteStoreDeliveryZone(selectedStoreId, zoneId)
    },
    onSuccess: () => {
      dispatchToast({ type: 'success', message: 'Região removida.' })
      invalidate()
    },
    onError: () => {
      dispatchToast({ type: 'error', message: 'Não foi possível remover a região.' })
    },
  })

  return {
    selectedStoreId,
    ...query,
    saveSettings: settingsMutation.mutate,
    saveZone: zoneMutation.mutate,
    deleteZone: deleteZoneMutation.mutate,
    isSavingSettings: settingsMutation.isPending,
    isSavingZone: zoneMutation.isPending,
    isDeletingZone: deleteZoneMutation.isPending,
  }
}
