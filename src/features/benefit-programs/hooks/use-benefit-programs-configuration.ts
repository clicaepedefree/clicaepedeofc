'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useStore } from 'jotai'
import { useEffect, useRef } from 'react'
import { selectedStoreIdAtom } from '@/features/store/state'
import { dispatchToast } from '@/shared/lib/toast'
import {
  getBenefitProgramsConfiguration,
  saveBenefitProgramsConfiguration,
} from '../api'
import type { BenefitProgramsInput } from '../policy'

export const benefitProgramsKey = (storeId: number) =>
  ['benefit-programs', storeId] as const

export const useBenefitProgramsConfiguration = (storeId: number) => {
  const queryClient = useQueryClient()
  const store = useStore()
  const active = useRef(true)
  const saving = useRef(false)
  const isCurrentStore = () =>
    active.current && store.get(selectedStoreIdAtom) === storeId

  useEffect(() => {
    active.current = true
    return () => {
      active.current = false
      void queryClient.cancelQueries({
        queryKey: benefitProgramsKey(storeId),
        exact: true,
      })
    }
  }, [queryClient, storeId])

  const query = useQuery({
    queryKey: benefitProgramsKey(storeId),
    retry: false,
    queryFn: async ({ signal }) => {
      const data = await getBenefitProgramsConfiguration(storeId)
      // Server actions cannot abort the transport; never publish an obsolete result.
      if (signal.aborted || !isCurrentStore())
        throw new Error('Consulta cancelada.')
      return data
    },
  })

  const mutation = useMutation({
    retry: false,
    mutationFn: async (input: BenefitProgramsInput) => {
      if (!isCurrentStore() || saving.current) return null
      saving.current = true
      try {
        const result = await saveBenefitProgramsConfiguration(storeId, input)
        if (!isCurrentStore()) return null
        if (!result.success) throw new Error(result.error)
        await queryClient.cancelQueries({
          queryKey: benefitProgramsKey(storeId),
          exact: true,
        })
        if (!isCurrentStore()) return null
        queryClient.setQueryData<
          Awaited<ReturnType<typeof getBenefitProgramsConfiguration>>
        >(benefitProgramsKey(storeId), previous =>
          previous
            ? {
                ...previous,
                cashback: input.cashback,
                loyalty: input.loyalty,
                version: result.version,
              }
            : previous
        )
        dispatchToast({
          type: 'success',
          message: 'Programas de benefícios salvos.',
        })
        return result
      } catch (error) {
        if (!isCurrentStore()) return null
        dispatchToast({
          type: 'error',
          message: 'Não foi possível salvar. Confira o aviso na configuração.',
        })
        throw error
      } finally {
        saving.current = false
      }
    },
  })

  return {
    ...query,
    save: mutation.mutateAsync,
    isSaving: mutation.isPending,
    isCurrentStore,
  }
}
