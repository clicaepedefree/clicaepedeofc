'use client'

import {
  getDigitalMenuAdminOverview,
  updateDigitalMenuPublication,
} from '@/features/digital-menu/admin-api'
import { selectedStoreIdAtom } from '@/features/store/state'
import { dispatchToast } from '@/shared/lib/toast'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAtomValue } from 'jotai'

const overviewKey = (storeId: number | null) => [
  'stores',
  storeId,
  'digital-menu-admin',
]

export const useDigitalMenuAdmin = () => {
  const selectedStoreId = useAtomValue(selectedStoreIdAtom)
  const queryClient = useQueryClient()
  const queryKey = overviewKey(selectedStoreId)
  const query = useQuery({
    enabled: !!selectedStoreId,
    queryKey,
    queryFn: () => {
      if (!selectedStoreId) throw new Error('Nenhuma loja selecionada.')
      return getDigitalMenuAdminOverview(selectedStoreId)
    },
  })
  const publication = useMutation({
    mutationFn: (input: { action: 'PUBLISH' | 'PAUSE'; reason?: string }) => {
      if (!selectedStoreId) throw new Error('Nenhuma loja selecionada.')
      return updateDigitalMenuPublication(selectedStoreId, input)
    },
    onSuccess: (_, input) => {
      queryClient.invalidateQueries({ queryKey })
      dispatchToast({
        type: 'success',
        message:
          input.action === 'PAUSE'
            ? 'Cardapio pausado.'
            : 'Cardapio publicado.',
      })
    },
    onError: error => {
      dispatchToast({
        type: 'error',
        message:
          error instanceof Error
            ? error.message
            : 'Nao foi possivel atualizar a publicacao.',
      })
    },
  })

  return {
    selectedStoreId,
    ...query,
    updatePublication: publication.mutate,
    isUpdatingPublication: publication.isPending,
  }
}
