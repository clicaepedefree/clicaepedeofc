'use client'

import {
  getWhatsappAssistantConfig,
  saveWhatsappAssistantConfig,
  testWhatsappAssistantConfig,
} from '@/features/whatsapp-bot/api'
import type { WhatsappAssistantConfigInput } from '@/features/whatsapp-bot/assistant-config-policy'
import { dispatchToast } from '@/shared/lib/toast'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

const whatsappAssistantConfigCacheKey = (storeId: number | null) => [
  'whatsapp-assistant-config',
  storeId,
]

export const useWhatsappAssistantConfig = (storeId: number | null) => {
  const queryClient = useQueryClient()
  const queryKey = whatsappAssistantConfigCacheKey(storeId)

  const query = useQuery({
    enabled: !!storeId,
    queryKey,
    queryFn: () => {
      if (!storeId) throw new Error('Nenhuma loja selecionada.')
      return getWhatsappAssistantConfig(storeId)
    },
    retry: 1,
  })

  const saveMutation = useMutation({
    mutationFn: (values: WhatsappAssistantConfigInput) => {
      if (!storeId) throw new Error('Nenhuma loja selecionada.')
      return saveWhatsappAssistantConfig({ storeId, values })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey })
      dispatchToast({
        type: 'success',
        message: 'Personalidade do assistente salva.',
      })
    },
    onError: error => {
      dispatchToast({
        type: 'error',
        message:
          error instanceof Error
            ? error.message
            : 'Nao foi possivel salvar a personalidade.',
      })
    },
  })

  const testMutation = useMutation({
    mutationFn: (message: string) => {
      if (!storeId) throw new Error('Nenhuma loja selecionada.')
      return testWhatsappAssistantConfig({ storeId, message })
    },
    onError: error => {
      dispatchToast({
        type: 'error',
        message:
          error instanceof Error
            ? error.message
            : 'Nao foi possivel testar o assistente.',
      })
    },
  })

  return {
    config: query.data,
    error: query.error,
    isLoading: query.isLoading,
    saveConfig: saveMutation.mutateAsync,
    isSaving: saveMutation.isPending,
    testAssistant: testMutation.mutateAsync,
    testResult: testMutation.data,
    isTesting: testMutation.isPending,
  }
}
