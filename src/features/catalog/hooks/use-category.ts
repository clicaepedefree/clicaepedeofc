import { selectedStoreIdAtom } from '@/features/store/state'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useAtom } from 'jotai'
import { deleteCategory } from '../api'
import { categoriesCacheKey } from '../cache-keys'
import { CategoryWithImage } from '../types'

export const useCategory = () => {
  const [selectedStoreId] = useAtom(selectedStoreIdAtom)
  const queryClient = useQueryClient()

  const deleteCategoryMutation = useMutation({
    mutationFn: async (categoryId: number) => deleteCategory(categoryId),
    onMutate: async (categoryIdToDelete: number) => {
      await queryClient.cancelQueries({ queryKey: categoriesCacheKey(selectedStoreId) })
      const previousCategories = queryClient.getQueryData(categoriesCacheKey(selectedStoreId))

      queryClient.setQueryData(
        categoriesCacheKey(selectedStoreId),
        (prevCategories: CategoryWithImage[] | undefined) => {
          return prevCategories?.filter(category => category.id !== categoryIdToDelete)
        }
      )

      return { previousCategories }
    },
    onError: (_, __, context) => {
      queryClient.setQueryData(categoriesCacheKey(selectedStoreId), context?.previousCategories)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: categoriesCacheKey(selectedStoreId) })
    },
  })

  return {
    deleteCategory: deleteCategoryMutation.mutate,
    deleteCategoryAsync: deleteCategoryMutation.mutateAsync,
    isDeleting: deleteCategoryMutation.isPending,
    deleteError: deleteCategoryMutation.isError,
  }
}
