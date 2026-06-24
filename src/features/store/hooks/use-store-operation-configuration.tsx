'use client'

import { storeOperationConfigurationCacheKey } from '@/features/store/cache-keys'
import {
  deleteStoreBusinessHour,
  deleteStoreSpecialHour,
  getStoreOperationConfiguration,
  saveStoreBusinessHour,
  saveStoreOperationSettings,
  saveStorePublicProfile,
  saveStoreSpecialHour,
  type StoreBusinessHourInput,
  type StoreOperationSettingsInput,
  type StorePublicProfileInput,
  type StoreSpecialHourInput,
} from '@/features/store/operation-api'
import { selectedStoreIdAtom } from '@/features/store/state'
import { dispatchToast } from '@/shared/lib/toast'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAtomValue } from 'jotai'

export const useStoreOperationConfiguration = () => {
  const selectedStoreId = useAtomValue(selectedStoreIdAtom)
  const queryClient = useQueryClient()
  const queryKey = storeOperationConfigurationCacheKey(selectedStoreId)

  const query = useQuery({
    enabled: !!selectedStoreId,
    queryKey,
    queryFn: () => {
      if (!selectedStoreId) throw new Error('No store selected')
      return getStoreOperationConfiguration(selectedStoreId)
    },
  })

  const invalidate = () => queryClient.invalidateQueries({ queryKey })

  const settingsMutation = useMutation({
    mutationFn: (values: StoreOperationSettingsInput) => {
      if (!selectedStoreId) throw new Error('No store selected')
      return saveStoreOperationSettings(selectedStoreId, values)
    },
    onSuccess: () => {
      dispatchToast({ type: 'success', message: 'Funcionamento salvo.' })
      invalidate()
    },
    onError: () => {
      dispatchToast({ type: 'error', message: 'Não foi possível salvar o funcionamento.' })
    },
  })

  const publicProfileMutation = useMutation({
    mutationFn: (values: StorePublicProfileInput) => {
      if (!selectedStoreId) throw new Error('No store selected')
      return saveStorePublicProfile(selectedStoreId, values)
    },
    onSuccess: () => {
      dispatchToast({ type: 'success', message: 'Identidade publica salva.' })
      invalidate()
    },
    onError: () => {
      dispatchToast({
        type: 'error',
        message: 'Nao foi possivel salvar a identidade publica.',
      })
    },
  })

  const businessHourMutation = useMutation({
    mutationFn: (values: StoreBusinessHourInput) => {
      if (!selectedStoreId) throw new Error('No store selected')
      return saveStoreBusinessHour(selectedStoreId, values)
    },
    onSuccess: () => {
      dispatchToast({ type: 'success', message: 'Horário salvo.' })
      invalidate()
    },
    onError: () => {
      dispatchToast({ type: 'error', message: 'Não foi possível salvar o horário.' })
    },
  })

  const specialHourMutation = useMutation({
    mutationFn: (values: StoreSpecialHourInput) => {
      if (!selectedStoreId) throw new Error('No store selected')
      return saveStoreSpecialHour(selectedStoreId, values)
    },
    onSuccess: () => {
      dispatchToast({ type: 'success', message: 'Data especial salva.' })
      invalidate()
    },
    onError: () => {
      dispatchToast({ type: 'error', message: 'Não foi possível salvar a data especial.' })
    },
  })

  const deleteBusinessHourMutation = useMutation({
    mutationFn: (id: number) => {
      if (!selectedStoreId) throw new Error('No store selected')
      return deleteStoreBusinessHour(selectedStoreId, id)
    },
    onSuccess: () => {
      dispatchToast({ type: 'success', message: 'Horário removido.' })
      invalidate()
    },
    onError: () => {
      dispatchToast({ type: 'error', message: 'Não foi possível remover o horário.' })
    },
  })

  const deleteSpecialHourMutation = useMutation({
    mutationFn: (id: number) => {
      if (!selectedStoreId) throw new Error('No store selected')
      return deleteStoreSpecialHour(selectedStoreId, id)
    },
    onSuccess: () => {
      dispatchToast({ type: 'success', message: 'Data especial removida.' })
      invalidate()
    },
    onError: () => {
      dispatchToast({ type: 'error', message: 'Não foi possível remover a data especial.' })
    },
  })

  return {
    selectedStoreId,
    ...query,
    saveSettings: settingsMutation.mutate,
    savePublicProfile: publicProfileMutation.mutate,
    saveBusinessHour: businessHourMutation.mutate,
    saveSpecialHour: specialHourMutation.mutate,
    deleteBusinessHour: deleteBusinessHourMutation.mutate,
    deleteSpecialHour: deleteSpecialHourMutation.mutate,
    isSavingSettings: settingsMutation.isPending,
    isSavingPublicProfile: publicProfileMutation.isPending,
    isSavingBusinessHour: businessHourMutation.isPending,
    isSavingSpecialHour: specialHourMutation.isPending,
    isDeletingBusinessHour: deleteBusinessHourMutation.isPending,
    isDeletingSpecialHour: deleteSpecialHourMutation.isPending,
  }
}
