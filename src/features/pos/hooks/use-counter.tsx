import { selectedStoreIdAtom } from '@/features/store/state'
import { isPermissionsError } from '@/shared/errors/permissions-error'
import { dispatchToast } from '@/shared/lib/toast'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useAtom } from 'jotai'
import { createCounter as createCounterApi } from '../api'
import { countersCacheKey } from '../cache-keys'

export const useCounter = () => {
  const [selectedStoreId] = useAtom(selectedStoreIdAtom)
  const queryClient = useQueryClient()

  const createCounterMutation = useMutation({
    mutationFn: async ({ name }: { name: string }) => {
      if (!selectedStoreId) {
        console.error('Selecione uma loja antes de criar um caixa.')
        return
      }
      await createCounterApi({ storeId: selectedStoreId, name })
    },
    onMutate: async () => {
      await queryClient.cancelQueries({
        queryKey: countersCacheKey(selectedStoreId),
      })
    },
    onError: (error, counterToCreate) => {
      const errorMessage = isPermissionsError(error)
        ? error.message
        : `Erro ao criar caixa '${counterToCreate.name}'`

      dispatchToast({
        message: errorMessage,
        type: 'error',
      })
    },
    onSuccess: (_, counterToCreate) => {
      dispatchToast({
        message: `Caixa '${counterToCreate.name}' criado`,
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
