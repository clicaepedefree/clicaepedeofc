import { isPermissionsError } from '@/features/store/errors'
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
    mutationFn: async ({
      name,
      isAvailable,
    }: {
      name: string
      isAvailable: boolean
    }) => {
      if (!selectedStoreId) {
        console.error('Selecione uma loja antes de criar um balcão.')
        return
      }
      await createCounterApi({ storeId: selectedStoreId, name, isAvailable })
    },
    onMutate: async () => {
      await queryClient.cancelQueries({
        queryKey: countersCacheKey(selectedStoreId),
      })
    },
    onError: (error, counterToCreate) => {
      const errorMessage = isPermissionsError(error)
        ? error.message
        : `Erro ao criar balcão '${counterToCreate.name}'`

      dispatchToast({
        message: errorMessage,
        type: 'error',
      })
    },
    onSuccess: (_, counterToCreate) => {
      dispatchToast({
        message: `Balcão '${counterToCreate.name}' criado`,
        type: 'success',
      })
    },
    onSettled: (_, error) => {
      if (error && isPermissionsError(error)) return

      queryClient.invalidateQueries({
        queryKey: countersCacheKey(selectedStoreId),
      })
    },
  })

  return {
    createCounter: createCounterMutation.mutate,
  }
}
