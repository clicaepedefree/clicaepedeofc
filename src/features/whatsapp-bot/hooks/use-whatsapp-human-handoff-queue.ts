'use client'

import {
  getWhatsappHumanHandoffQueue,
  returnWhatsappConversationToBot,
} from '@/features/whatsapp-bot/api'
import { dispatchToast } from '@/shared/lib/toast'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

const whatsappHumanHandoffQueueCacheKey = (storeId: number | null) => [
  'whatsapp-human-handoff-queue',
  storeId,
]

export const useWhatsappHumanHandoffQueue = (storeId: number | null) => {
  const queryClient = useQueryClient()
  const queryKey = whatsappHumanHandoffQueueCacheKey(storeId)

  const query = useQuery({
    enabled: !!storeId,
    queryKey,
    queryFn: () => {
      if (!storeId) throw new Error('Nenhuma loja selecionada.')
      return getWhatsappHumanHandoffQueue(storeId)
    },
    refetchInterval: 20_000,
    retry: 1,
  })

  const returnToBotMutation = useMutation({
    mutationFn: (conversationId: string) => {
      if (!storeId) throw new Error('Nenhuma loja selecionada.')
      return returnWhatsappConversationToBot({ storeId, conversationId })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey })
      dispatchToast({
        type: 'success',
        message: 'Conversa devolvida ao robo.',
      })
    },
    onError: error => {
      dispatchToast({
        type: 'error',
        message:
          error instanceof Error
            ? error.message
            : 'Nao foi possivel devolver a conversa ao robo.',
      })
    },
  })

  return {
    conversations: query.data ?? [],
    error: query.error,
    isLoading: query.isLoading,
    refetch: query.refetch,
    returnToBot: returnToBotMutation.mutateAsync,
    isReturningToBot: returnToBotMutation.isPending,
  }
}
