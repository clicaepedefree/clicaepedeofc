'use client'

import { selectedStoreIdAtom } from '@/features/store/state'
import { storeUsersCacheKey } from '@/features/store/cache-keys'
import { dispatchToast } from '@/shared/lib/toast'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAtomValue } from 'jotai'
import {
  getStoreUsers,
  inviteStoreUser,
  revokeStoreUser,
  revokeStoreUserInvite,
  updateStoreUser,
  type StoreUsersStatusFilter,
} from './api'
import type { StoreUserRole } from './store-users-policy'

export function useStoreUsers({
  page,
  search,
  status,
  role,
}: {
  page: number
  search: string
  status: StoreUsersStatusFilter
  role: StoreUserRole | 'all'
}) {
  const selectedStoreId = useAtomValue(selectedStoreIdAtom)
  const queryClient = useQueryClient()
  const queryKey = storeUsersCacheKey(selectedStoreId, page, search, status, role)

  const query = useQuery({
    enabled: !!selectedStoreId,
    queryKey,
    queryFn: () => {
      if (!selectedStoreId) throw new Error('No store selected')
      return getStoreUsers(selectedStoreId, { page, search, status, role })
    },
  })

  const invalidate = () =>
    Promise.all([
      queryClient.invalidateQueries({
        queryKey: ['stores', selectedStoreId, 'users'],
      }),
      queryClient.invalidateQueries({
        queryKey: ['stores'],
      }),
    ])

  const inviteMutation = useMutation({
    mutationFn: (values: {
      email: string
      name?: string
      phone?: string
      role: StoreUserRole
    }) => {
      if (!selectedStoreId) throw new Error('No store selected')
      return inviteStoreUser(selectedStoreId, values)
    },
    onSuccess: () => {
      dispatchToast({ type: 'success', message: 'Convite de acesso criado.' })
      invalidate()
    },
    onError: error => {
      dispatchToast({
        type: 'error',
        message:
          error instanceof Error && error.message === 'STORE_USER_ALREADY_ACTIVE'
            ? 'Este e-mail ja possui acesso ativo nesta loja.'
            : 'Nao foi possivel criar o convite.',
      })
    },
  })

  const updateMutation = useMutation({
    mutationFn: (values: {
      userId: string
      name?: string
      phone?: string
      role: StoreUserRole
      isPrimaryResponsible: boolean
    }) => {
      if (!selectedStoreId) throw new Error('No store selected')
      return updateStoreUser(selectedStoreId, values)
    },
    onSuccess: () => {
      dispatchToast({ type: 'success', message: 'Usuario atualizado.' })
      invalidate()
    },
    onError: error => {
      const message =
        error instanceof Error &&
        error.message === 'PRIMARY_RESPONSIBLE_TRANSFER_REQUIRED'
          ? 'Defina outro responsavel principal antes de remover este papel.'
          : error instanceof Error &&
              error.message === 'LAST_ACTIVE_STORE_OWNER'
            ? 'Nao e possivel rebaixar o ultimo proprietario ativo da loja.'
            : error instanceof Error &&
                error.message === 'PRIMARY_RESPONSIBLE_REQUIRES_OWNER'
              ? 'Apenas proprietarios podem ser responsaveis principais.'
              : 'Nao foi possivel atualizar o usuario.'

      dispatchToast({
        type: 'error',
        message,
      })
    },
  })

  const revokeMutation = useMutation({
    mutationFn: (values: { userId: string; reason: string }) => {
      if (!selectedStoreId) throw new Error('No store selected')
      return revokeStoreUser(selectedStoreId, values)
    },
    onSuccess: () => {
      dispatchToast({ type: 'success', message: 'Acesso desvinculado.' })
      invalidate()
    },
    onError: error => {
      dispatchToast({
        type: 'error',
        message:
          error instanceof Error && error.message === 'LAST_ACTIVE_STORE_OWNER'
            ? 'Nao e possivel remover o ultimo proprietario ativo da loja.'
            : 'Nao foi possivel desvincular o usuario.',
      })
    },
  })

  const revokeInviteMutation = useMutation({
    mutationFn: (values: { inviteId: number; reason: string }) => {
      if (!selectedStoreId) throw new Error('No store selected')
      return revokeStoreUserInvite(selectedStoreId, values)
    },
    onSuccess: () => {
      dispatchToast({ type: 'success', message: 'Convite cancelado.' })
      invalidate()
    },
    onError: () => {
      dispatchToast({
        type: 'error',
        message: 'Nao foi possivel cancelar o convite.',
      })
    },
  })

  return {
    selectedStoreId,
    ...query,
    inviteUser: inviteMutation.mutateAsync,
    updateUser: updateMutation.mutateAsync,
    revokeUser: revokeMutation.mutateAsync,
    revokeInvite: revokeInviteMutation.mutateAsync,
    isInvitingUser: inviteMutation.isPending,
    isUpdatingUser: updateMutation.isPending,
    isRevokingUser: revokeMutation.isPending,
    isRevokingInvite: revokeInviteMutation.isPending,
  }
}
