import { selectedStoreIdAtom } from '@/features/store/state'
import { dispatchToast } from '@/shared/lib/toast'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useAtom } from 'jotai'
import { deleteItem } from '../api'
import { categoriesCacheKey } from '../cache-keys'
import { Item, ItemWithImage } from '../types'

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
    onItemUpdated,
  }
}
