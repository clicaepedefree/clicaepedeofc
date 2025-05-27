import { selectedStoreIdAtom } from '@/features/store/state'
import { dispatchToast } from '@/shared/lib/toast'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useAtom } from 'jotai'
import { createCounter as createCounterApi } from '../api'
import { countersCacheKey } from '../cache-keys'

export const useCounter = () => {
  const [selectedStoreId] = useAtom(selectedStoreIdAtom)
  const queryClient = useQueryClient()

  const createCounterMutation = useMutation({
    mutationFn: async ({ name, isAvailable }: { name: string; isAvailable: boolean }) => {
      if (!selectedStoreId) {
        console.error('Selecione uma loja antes de criar um balcão.')
        return
      }
      await createCounterApi({ storeId: selectedStoreId, name, isAvailable })
    },
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: countersCacheKey(selectedStoreId) })
    },
    onError: (_, counterToDelete) => {
      dispatchToast({ message: `Erro ao remover balcão '${counterToDelete.name}'`, type: 'error' })
    },
    onSuccess: (_, counterToDelete) => {
      dispatchToast({ message: `Balcão '${counterToDelete.name}' removido`, type: 'success' })
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: countersCacheKey(selectedStoreId) })
    },
  })

  return {
    createCounter: createCounterMutation.mutateAsync,
  }
}
