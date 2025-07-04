import { selectedStoreIdAtom } from '@/features/store/state'
import { dispatchToast } from '@/shared/lib/toast'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useAtom } from 'jotai'
import { deleteCategory } from '../api'
import { categoriesCacheKey } from '../cache-keys'
import { Category, CategoryWithImage } from '../types'

export const useCategory = () => {
  const [selectedStoreId] = useAtom(selectedStoreIdAtom)
  const queryClient = useQueryClient()

  const deleteCategoryMutation = useMutation({
    mutationFn: async (category: CategoryWithImage) =>
      deleteCategory(category.id, category.storeId),
    onMutate: async () => {
      await queryClient.cancelQueries({
        queryKey: categoriesCacheKey(selectedStoreId),
      })
    },
    onError: (_, categoryToDelete) => {
      dispatchToast({
        message: `Erro ao remover categoria '${categoryToDelete.name}'`,
        type: 'error',
      })
    },
    onSuccess: (_, categoryToDelete) => {
      dispatchToast({
        message: `Categoria '${categoryToDelete.name}' removida`,
        type: 'success',
      })
    },
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: categoriesCacheKey(selectedStoreId),
      })
    },
  })

  const onUpdateCategory = (category: Category) => {
    queryClient.invalidateQueries({
      queryKey: categoriesCacheKey(selectedStoreId),
    })
    dispatchToast({
      message: `Categoria '${category.name}' atualizada`,
      type: 'success',
    })
  }

  return {
    deleteCategory: deleteCategoryMutation.mutate,
    isDeleting: deleteCategoryMutation.isPending,
    onUpdateCategory,
  }
}
