'use client'

import {
  getWhatsappAssistantConfig,
  saveWhatsappAssistantConfig,
  testWhatsappAssistantConfig,
} from '@/features/whatsapp-bot/api'
import {
  assistantConfigLimits,
  validateWhatsappAssistantConfigInput,
  type WhatsappAssistantConfigInput,
} from '@/features/whatsapp-bot/assistant-config-policy'
import { dispatchToast } from '@/shared/lib/toast'
import { sanitizeWhatsappConnectionError } from '@/features/whatsapp-bot/connection-panel-policy'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useRef, useState } from 'react'
import { z } from 'zod'

const dryRunResultSchema = z.object({
  mode: z.literal('dry_run'),
  status: z.enum(['unavailable', 'responded', 'fallback', 'handoff']),
  reason: z.string().nullable(),
  reply: z.string().nullable(),
  sentToCustomer: z.literal(false),
  businessEffects: z.literal(false),
  assistantName: z.string(),
  latencyMs: z.number().nonnegative(),
  usage: z
    .object({
      inputTokens: z.number().nonnegative().nullable(),
      outputTokens: z.number().nonnegative().nullable(),
      totalTokens: z.number().nonnegative().nullable(),
    })
    .nullable(),
})

export type AssistantDraftTestResult = z.infer<typeof dryRunResultSchema> & {
  message: string
}

const whatsappAssistantConfigCacheKey = (storeId: number | null) => [
  'whatsapp-assistant-config',
  storeId,
]

export const useWhatsappAssistantConfig = (storeId: number | null) => {
  const queryClient = useQueryClient()
  const queryKey = whatsappAssistantConfigCacheKey(storeId)
  const activeStore = useRef(storeId)
  activeStore.current = storeId
  const mounted = useRef(true)
  const requestId = useRef(0)
  const [testState, setTestState] = useState<{
    storeId: number
    pending: boolean
    result: AssistantDraftTestResult | null
    error: string | null
  } | null>(null)
  const resetTest = useCallback(() => {
    requestId.current++
    setTestState(null)
  }, [])

  useEffect(() => {
    mounted.current = true
    resetTest()
    return () => {
      mounted.current = false
      requestId.current++
    }
  }, [storeId, resetTest])

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
    mutationFn: (input: {
      storeId: number
      values: WhatsappAssistantConfigInput
    }) => {
      return saveWhatsappAssistantConfig(input)
    },
    onSuccess: (_, input) => {
      queryClient.invalidateQueries({
        queryKey: whatsappAssistantConfigCacheKey(input.storeId),
      })
      if (!mounted.current || activeStore.current !== input.storeId) return
      dispatchToast({
        type: 'success',
        message: 'Personalidade do assistente salva.',
      })
    },
    onError: (error, input) => {
      if (!mounted.current || activeStore.current !== input.storeId) return
      dispatchToast({
        type: 'error',
        message:
          error instanceof Error
            ? (sanitizeWhatsappConnectionError(error.message) ??
              'Nao foi possivel salvar a personalidade.')
            : 'Nao foi possivel salvar a personalidade.',
      })
    },
  })

  const testAssistant = async ({
    message,
    values,
  }: {
    message: string
    values: WhatsappAssistantConfigInput
  }) => {
    const parsed = validateWhatsappAssistantConfigInput(values)
    if (
      !storeId ||
      !parsed.success ||
      !message.trim() ||
      message.length > assistantConfigLimits.testMessage
    )
      return
    const id = ++requestId.current
    const isCurrent = () =>
      mounted.current &&
      activeStore.current === storeId &&
      requestId.current === id
    setTestState({ storeId, pending: true, result: null, error: null })
    try {
      const response: unknown = await testWhatsappAssistantConfig({
        storeId,
        message: message.trim(),
        values: parsed.data,
      })
      if (!isCurrent()) return
      const result = dryRunResultSchema.safeParse(response)
      // Legacy static previews must never be presented as generated replies.
      const data: z.infer<typeof dryRunResultSchema> = result.success
        ? result.data
        : {
            mode: 'dry_run',
            status: 'unavailable',
            reason: null,
            reply: null,
            sentToCustomer: false,
            businessEffects: false,
            assistantName: parsed.data.assistantName,
            latencyMs: 0,
            usage: null,
          }
      setTestState({
        storeId,
        pending: false,
        result: { ...data, message: message.trim() },
        error: null,
      })
    } catch {
      if (!isCurrent()) return
      setTestState({
        storeId,
        pending: false,
        result: null,
        error: 'Nao foi possivel testar o rascunho. Tente novamente.',
      })
    }
  }

  const saveConfig = async (values: WhatsappAssistantConfigInput) => {
    resetTest()
    if (!storeId) return
    await saveMutation.mutateAsync({ storeId, values })
  }
  const currentTest = testState?.storeId === storeId ? testState : null

  return {
    config: query.data,
    error: query.error,
    isLoading: query.isLoading,
    saveConfig,
    isSaving: saveMutation.isPending,
    testAssistant,
    resetTest,
    testResult: currentTest?.result ?? null,
    testError: currentTest?.error ?? null,
    isTesting: currentTest?.pending ?? false,
  }
}
