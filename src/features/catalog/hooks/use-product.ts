import { selectedStoreIdAtom } from '@/features/store/state'
import { dispatchToast } from '@/shared/lib/toast'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useAtom } from 'jotai'
import { deleteProduct } from '../api'
import { categoriesCacheKey } from '../cache-keys'
import { CategoryWithImage, ProductWithImage } from '../types'

export const useProduct = () => {
  const [selectedStoreId] = useAtom(selectedStoreIdAtom)
  const queryClient = useQueryClient()

  const deleteProductMutation = useMutation({
    mutationFn: (product: ProductWithImage) => deleteProduct(product.id),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: categoriesCacheKey(selectedStoreId) })
    },
    onError: (_, productToDelete) => {
      dispatchToast({ message: `Erro ao remover produto '${productToDelete.name}'`, type: 'error' })
    },
    onSuccess: (_, productToDelete) => {
      dispatchToast({ message: `Produto '${productToDelete.name}' removido`, type: 'success' })
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: categoriesCacheKey(selectedStoreId) })
    },
  })

  return {
    deleteProduct: deleteProductMutation.mutate,
    deleteProductAsync: deleteProductMutation.mutateAsync,
    isDeleting: deleteProductMutation.isPending,
  }
}
