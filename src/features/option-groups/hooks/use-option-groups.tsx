'use client'

import {
  createOptionGroup,
  deleteOptionGroup,
  linkOptionGroupsToItemOffering,
  listOptionGroups,
  updateOptionGroup,
} from '@/features/option-groups/api'
import { optionGroupsCacheKey } from '@/features/option-groups/cache-keys'
import {
  LinkOptionGroupsToItemOffering,
  NewOptionGroup,
  OptionGroupWithOptions,
  UpdateOptionGroup,
} from '@/features/option-groups/types'
import { categoriesCacheKey, menuCacheKey } from '@/features/menu/cache-keys'
import { selectedStoreIdAtom } from '@/features/store/state'
import { dispatchToast } from '@/shared/lib/toast'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAtom } from 'jotai'

export const useOptionGroups = () => {
  const [selectedStoreId] = useAtom(selectedStoreIdAtom)
  const queryClient = useQueryClient()

  const result = useQuery({
    enabled: !!selectedStoreId,
    queryKey: optionGroupsCacheKey(selectedStoreId),
    queryFn: async () => {
      if (!selectedStoreId) throw new Error('No store selected')
      return listOptionGroups(selectedStoreId)
    },
  })

  const invalidateRelatedCaches = () => {
    queryClient.invalidateQueries({
      queryKey: optionGroupsCacheKey(selectedStoreId),
    })
    queryClient.invalidateQueries({
      queryKey: categoriesCacheKey(selectedStoreId),
    })
    queryClient.invalidateQueries({
      queryKey: menuCacheKey(selectedStoreId),
    })
  }

  const createMutation = useMutation({
    mutationFn: (data: NewOptionGroup) => createOptionGroup(data),
    onError: () => {
      dispatchToast({
        message: 'Erro ao criar grupo de opções',
        type: 'error',
      })
    },
    onSuccess: (group) => {
      dispatchToast({
        message: `Grupo '${group.name}' criado`,
        type: 'success',
      })
    },
    onSettled: invalidateRelatedCaches,
  })

  const updateMutation = useMutation({
    mutationFn: (data: UpdateOptionGroup) => updateOptionGroup(data),
    onError: () => {
      dispatchToast({
        message: 'Erro ao atualizar grupo de opções',
        type: 'error',
      })
    },
    onSuccess: (group) => {
      dispatchToast({
        message: `Grupo '${group.name}' atualizado`,
        type: 'success',
      })
    },
    onSettled: invalidateRelatedCaches,
  })

  const deleteMutation = useMutation({
    mutationFn: (group: OptionGroupWithOptions) =>
      deleteOptionGroup(group.id, group.storeId),
    onError: (_, group) => {
      dispatchToast({
        message: `Erro ao remover grupo '${group.name}'`,
        type: 'error',
      })
    },
    onSuccess: (_, group) => {
      dispatchToast({
        message: `Grupo '${group.name}' removido`,
        type: 'success',
      })
    },
    onSettled: invalidateRelatedCaches,
  })

  const linkMutation = useMutation({
    mutationFn: (data: LinkOptionGroupsToItemOffering) =>
      linkOptionGroupsToItemOffering(data),
    onError: () => {
      dispatchToast({
        message: 'Erro ao vincular grupos de opções',
        type: 'error',
      })
    },
    onSettled: invalidateRelatedCaches,
  })

  return {
    optionGroups: result.data,
    isLoading: result.isLoading,
    refetch: result.refetch,
    createOptionGroup: createMutation.mutateAsync,
    isCreating: createMutation.isPending,
    updateOptionGroup: updateMutation.mutateAsync,
    isUpdating: updateMutation.isPending,
    deleteOptionGroup: deleteMutation.mutate,
    isDeleting: deleteMutation.isPending,
    linkOptionGroups: linkMutation.mutateAsync,
    isLinking: linkMutation.isPending,
  }
}
