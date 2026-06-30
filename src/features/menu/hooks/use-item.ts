import { selectedStoreIdAtom } from '@/features/store/state'
import { dispatchToast } from '@/shared/lib/toast'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useAtom } from 'jotai'
import { deleteItem, duplicateItem, updateItemOfferingAvailability } from '../api'
import { categoriesCacheKey, menuCacheKey } from '../cache-keys'
import {
  CategoryWithImage,
  Item,
  ItemOfferingWithImage,
  ItemWithImage,
} from '../types'

export const useItem = () => {
  const [selectedStoreId] = useAtom(selectedStoreIdAtom)
  const queryClient = useQueryClient()

  const deleteItemMutation = useMutation({
    mutationFn: (item: ItemWithImage) => deleteItem(item.id, item.storeId),
    onMutate: async () => {
      await queryClient.cancelQueries({
        queryKey: categoriesCacheKey(selectedStoreId),
      })
    },
    onError: (_, itemToDelete) => {
      dispatchToast({
        message: `Erro ao remover item '${itemToDelete.name}'`,
        type: 'error',
      })
    },
    onSuccess: (_, itemToDelete) => {
      dispatchToast({
        message: `Item '${itemToDelete.name}' removido`,
        type: 'success',
      })
    },
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: categoriesCacheKey(selectedStoreId),
      })
    },
  })

  const updateItemOfferingAvailabilityMutation = useMutation({
    mutationFn: ({
      item,
      isAvailable,
    }: {
      item: ItemOfferingWithImage
      isAvailable: boolean
    }) => {
      if (!selectedStoreId) throw new Error('No store selected')

      return updateItemOfferingAvailability({
        itemOfferingId: item.itemOfferingId,
        storeId: selectedStoreId,
        isAvailable,
      })
    },
    onMutate: async ({ item, isAvailable }) => {
      await queryClient.cancelQueries({
        queryKey: categoriesCacheKey(selectedStoreId),
      })
      await queryClient.cancelQueries({
        queryKey: menuCacheKey(selectedStoreId),
      })

      const previousCategories = queryClient.getQueryData<CategoryWithImage[]>(
        categoriesCacheKey(selectedStoreId)
      )

      queryClient.setQueryData<CategoryWithImage[]>(
        categoriesCacheKey(selectedStoreId),
        currentCategories =>
          currentCategories?.map(category => ({
            ...category,
            items: category.items?.map((categoryItem: ItemOfferingWithImage) =>
              categoryItem.itemOfferingId === item.itemOfferingId
                ? { ...categoryItem, isAvailable }
                : categoryItem
            ),
          }))
      )

      return { previousCategories }
    },
    onError: (_, { item }, context) => {
      if (context?.previousCategories) {
        queryClient.setQueryData(
          categoriesCacheKey(selectedStoreId),
          context.previousCategories
        )
      }

      dispatchToast({
        message: `Erro ao atualizar status de venda de '${item.name}'`,
        type: 'error',
      })
    },
    onSuccess: (_, { item, isAvailable }) => {
      dispatchToast({
        message: `Item '${item.name}' ${isAvailable ? 'ativado' : 'desativado'} para venda`,
        type: 'success',
      })
    },
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: categoriesCacheKey(selectedStoreId),
      })
      queryClient.invalidateQueries({
        queryKey: menuCacheKey(selectedStoreId),
      })
    },
  })

  const duplicateItemMutation = useMutation({
    mutationFn: (item: ItemOfferingWithImage) => {
      if (!selectedStoreId) throw new Error('No store selected')

      return duplicateItem({
        itemId: item.id,
        itemOfferingId: item.itemOfferingId,
        storeId: selectedStoreId,
      })
    },
    onMutate: async () => {
      await queryClient.cancelQueries({
        queryKey: categoriesCacheKey(selectedStoreId),
      })
    },
    onError: (_, item) => {
      dispatchToast({
        message: `Erro ao duplicar item '${item.name}'`,
        type: 'error',
      })
    },
    onSuccess: (_, item) => {
      dispatchToast({
        message: `Item '${item.name}' duplicado`,
        type: 'success',
      })
    },
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: categoriesCacheKey(selectedStoreId),
      })
      queryClient.invalidateQueries({
        queryKey: menuCacheKey(selectedStoreId),
      })
    },
  })

  const onItemUpdated = (item: Item) => {
    queryClient.invalidateQueries({
      queryKey: categoriesCacheKey(selectedStoreId),
    })
    dispatchToast({
      message: `Item '${item.name}' atualizado`,
      type: 'success',
    })
  }

  return {
    deleteItem: deleteItemMutation.mutate,
    isDeleting: deleteItemMutation.isPending,
    updateItemOfferingAvailability:
      updateItemOfferingAvailabilityMutation.mutate,
    duplicateItem: duplicateItemMutation.mutate,
    isUpdatingItemOfferingAvailability:
      updateItemOfferingAvailabilityMutation.isPending,
    isDuplicatingItem: duplicateItemMutation.isPending,
    onItemUpdated,
  }
}
