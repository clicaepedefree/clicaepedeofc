'use client'

import {
  disconnectWhatsappConnection,
  getWhatsappConnectionStatus,
  pauseWhatsappConnection,
  renewWhatsappConnectionQrCode,
  startWhatsappConnection,
} from '@/features/whatsapp-bot/api'
import { getWhatsappPollingInterval } from '@/features/whatsapp-bot/connection-panel-policy'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

const whatsappConnectionCacheKey = (storeId: number | null) => [
  'whatsapp-connection',
  storeId,
]

export const useWhatsappConnection = (storeId: number | null) => {
  const queryClient = useQueryClient()
  const queryKey = whatsappConnectionCacheKey(storeId)

  const query = useQuery({
    enabled: !!storeId,
    queryKey,
    queryFn: () => {
      if (!storeId) throw new Error('No store selected')
      return getWhatsappConnectionStatus(storeId)
    },
    refetchInterval: query =>
      getWhatsappPollingInterval(query.state.data?.status),
    retry: 1,
  })

  const invalidate = () => queryClient.invalidateQueries({ queryKey })

  const startMutation = useMutation({
    mutationFn: (input: {
      phoneNumber: string
      displayName?: string | null
    }) => {
      if (!storeId) throw new Error('No store selected')
      return startWhatsappConnection({ storeId, ...input })
    },
    onSuccess: invalidate,
  })

  const renewQrMutation = useMutation({
    mutationFn: (sessionId: number) => {
      if (!storeId) throw new Error('No store selected')
      return renewWhatsappConnectionQrCode({ storeId, sessionId })
    },
    onSuccess: invalidate,
  })

  const pauseMutation = useMutation({
    mutationFn: (sessionId: number) => {
      if (!storeId) throw new Error('No store selected')
      return pauseWhatsappConnection({ storeId, sessionId })
    },
    onSuccess: invalidate,
  })

  const disconnectMutation = useMutation({
    mutationFn: (sessionId: number) => {
      if (!storeId) throw new Error('No store selected')
      return disconnectWhatsappConnection({ storeId, sessionId })
    },
    onSuccess: invalidate,
  })

  const isMutating =
    startMutation.isPending ||
    renewQrMutation.isPending ||
    pauseMutation.isPending ||
    disconnectMutation.isPending

  return {
    connection: query.data,
    error: query.error,
    isLoading: query.isLoading,
    isMutating,
    refetch: query.refetch,
    startConnection: startMutation.mutateAsync,
    renewQrCode: renewQrMutation.mutateAsync,
    pauseConnection: pauseMutation.mutateAsync,
    disconnectConnection: disconnectMutation.mutateAsync,
  }
}
