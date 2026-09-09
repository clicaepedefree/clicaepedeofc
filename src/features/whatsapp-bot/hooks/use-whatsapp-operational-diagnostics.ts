'use client'

import { getWhatsappOperationalDiagnostics } from '@/features/whatsapp-bot/api'
import { useQuery } from '@tanstack/react-query'

const whatsappOperationalDiagnosticsCacheKey = (storeId: number | null) => [
  'whatsapp-operational-diagnostics',
  storeId,
]

export const useWhatsappOperationalDiagnostics = (storeId: number | null) => {
  const queryKey = whatsappOperationalDiagnosticsCacheKey(storeId)

  const query = useQuery({
    enabled: !!storeId,
    queryKey,
    queryFn: () => {
      if (!storeId) throw new Error('Nenhuma loja selecionada.')
      return getWhatsappOperationalDiagnostics(storeId)
    },
    refetchInterval: 30_000,
    retry: 1,
  })

  return {
    diagnostics: query.data ?? null,
    error: query.error,
    isLoading: query.isLoading,
    refetch: query.refetch,
    isRefetching: query.isRefetching,
  }
}
