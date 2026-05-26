'use client'

import { createAdditionalStoreForCurrentUser } from '@/features/store/api'
import { storesCacheKey } from '@/features/store/cache-keys'
import { selectedStoreIdAtom } from '@/features/store/state'
import type { OnboardingStoreFormValues } from '@/features/store/form-validation/onboarding-store-schema'
import { dispatchToast } from '@/shared/lib/toast'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useSetAtom } from 'jotai'

export const useCreateAdditionalStore = () => {
  const queryClient = useQueryClient()
  const setSelectedStoreId = useSetAtom(selectedStoreIdAtom)

  return useMutation({
    mutationFn: async (values: OnboardingStoreFormValues) => {
      const result = await createAdditionalStoreForCurrentUser(values)

      if (!result.success) throw new Error(result.error)

      return result
    },
    onSuccess: async ({ storeId }, values) => {
      await queryClient.invalidateQueries({ queryKey: storesCacheKey() })
      setSelectedStoreId(storeId)
      dispatchToast({
        type: 'success',
        message: `Loja '${values.name}' criada. Voce esta administrando ela agora.`,
      })
    },
    onError: error => {
      dispatchToast({
        type: 'error',
        message:
          error instanceof Error
            ? error.message
            : 'Nao foi possivel criar a loja agora.',
      })
    },
  })
}
