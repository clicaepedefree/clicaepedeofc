import { selectedStoreIdAtom } from '@/features/store/state'
import { dispatchToast } from '@/shared/lib/toast'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useAtom } from 'jotai'
import { deleteCategory } from '../api'
import { categoriesCacheKey } from '../cache-keys'
import { CategoryWithImage } from '../types'

export const useCategory = () => {
  const [selectedStoreId] = useAtom(selectedStoreIdAtom)
  const queryClient = useQueryClient()

  const deleteCategoryMutation = useMutation({
    mutationFn: async (category: CategoryWithImage) => deleteCategory(category.id),
    onMutate: async (categoryToDelete: CategoryWithImage) => {
      await queryClient.cancelQueries({ queryKey: categoriesCacheKey(selectedStoreId) })
      const previousCategories: CategoryWithImage[] | undefined = queryClient.getQueryData(
        categoriesCacheKey(selectedStoreId)
      )

      queryClient.setQueryData(
        categoriesCacheKey(selectedStoreId),
        (prevCategories: CategoryWithImage[] | undefined) => {
          return prevCategories?.filter(category => category.id !== categoryToDelete.id)
        }
      )

      return { previousCategories }
    },
    onError: (_, categoryToDelete, context) => {
      console.log('categoryToDelete', categoryToDelete)
      queryClient.setQueryData(categoriesCacheKey(selectedStoreId), context?.previousCategories)
      dispatchToast({ message: `Erro ao remover categoria '${categoryToDelete.name}'`, type: 'error' })
    },
    onSuccess: (_, categoryToDelete) => {
      console.log('categoryToDelete', categoryToDelete)
      queryClient.invalidateQueries({ queryKey: categoriesCacheKey(selectedStoreId) })
      dispatchToast({ message: `Categoria '${categoryToDelete.name}' removida`, type: 'success' })
    },
  })

  return {
    deleteCategory: deleteCategoryMutation.mutate,
    deleteCategoryAsync: deleteCategoryMutation.mutateAsync,
    isDeleting: deleteCategoryMutation.isPending,
  }
}
