'use client'

import { selectedStoreIdAtom } from '@/features/store/state'
import { storeUsersCacheKey } from '@/features/store/cache-keys'
import { dispatchToast } from '@/shared/lib/toast'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAtomValue } from 'jotai'
import {
  getStoreUsers,
  blockStoreUserAccess,
  inviteStoreUser,
  requestStoreUserPasswordReset,
  resendStoreUserInvite,
  revokeStoreUser,
  revokeStoreUserInvite,
  unblockStoreUserAccess,
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
  const queryKey = storeUsersCacheKey(
    selectedStoreId,
    page,
    search,
    status,
    role
  )

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
          error instanceof Error &&
          error.message === 'STORE_USER_ALREADY_ACTIVE'
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

  const blockMutation = useMutation({
    mutationFn: (values: {
      userId: string
      reason: string
      notificationChannel: 'none' | 'email' | 'whatsapp' | 'manual'
      notificationNote?: string
    }) => {
      if (!selectedStoreId) throw new Error('No store selected')
      return blockStoreUserAccess(selectedStoreId, values)
    },
    onSuccess: result => {
      dispatchToast({
        type: result.sessionRevocationFailed ? 'warning' : 'success',
        message: result.sessionRevocationFailed
          ? 'Acesso bloqueado, mas nao foi possivel confirmar o encerramento das sessoes no Clerk.'
          : result.revokedSessionCount > 0
            ? `Acesso bloqueado e ${result.revokedSessionCount} sessao(oes) encerrada(s).`
            : 'Acesso bloqueado.',
      })
      invalidate()
    },
    onError: error => {
      const message =
        error instanceof Error && error.message === 'LAST_ACTIVE_STORE_OWNER'
          ? 'Nao e possivel bloquear o ultimo proprietario ativo da loja.'
          : error instanceof Error && error.message === 'LAST_ACTIVE_STORE_USER'
            ? 'Nao e possivel bloquear o ultimo usuario ativo da loja.'
            : error instanceof Error &&
                error.message === 'STORE_USER_ALREADY_BLOCKED'
              ? 'Este usuario ja esta bloqueado nesta loja.'
              : error instanceof Error && error.message === 'CANNOT_BLOCK_SELF'
                ? 'Voce nao pode bloquear o seu proprio acesso por aqui.'
                : 'Nao foi possivel bloquear o acesso.'

      dispatchToast({ type: 'error', message })
    },
  })

  const unblockMutation = useMutation({
    mutationFn: (values: { userId: string; reason: string }) => {
      if (!selectedStoreId) throw new Error('No store selected')
      return unblockStoreUserAccess(selectedStoreId, values)
    },
    onSuccess: () => {
      dispatchToast({ type: 'success', message: 'Acesso desbloqueado.' })
      invalidate()
    },
    onError: error => {
      dispatchToast({
        type: 'error',
        message:
          error instanceof Error && error.message === 'STORE_USER_NOT_BLOCKED'
            ? 'Este usuario nao possui bloqueio ativo.'
            : 'Nao foi possivel desbloquear o acesso.',
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

  const resendInviteMutation = useMutation({
    mutationFn: (values: { inviteId: number }) => {
      if (!selectedStoreId) throw new Error('No store selected')
      return resendStoreUserInvite(selectedStoreId, values)
    },
    onSuccess: () => {
      dispatchToast({
        type: 'success',
        message: 'Convite reenviado. O link anterior foi invalidado.',
      })
      invalidate()
    },
    onError: () => {
      dispatchToast({
        type: 'error',
        message: 'Nao foi possivel reenviar o convite.',
      })
    },
  })

  const passwordResetMutation = useMutation({
    mutationFn: (values: { userId: string }) => {
      if (!selectedStoreId) throw new Error('No store selected')
      return requestStoreUserPasswordReset(selectedStoreId, values)
    },
    onSuccess: () => {
      dispatchToast({
        type: 'success',
        message: 'Link temporario de redefinicao criado.',
      })
      invalidate()
    },
    onError: error => {
      dispatchToast({
        type: 'error',
        message:
          error instanceof Error &&
          error.message === 'STORE_USER_HAS_NO_CLERK_ACCOUNT'
            ? 'Este usuario ainda nao possui conta ativa no Clerk.'
            : 'Nao foi possivel criar o link de redefinicao.',
      })
    },
  })

  return {
    selectedStoreId,
    ...query,
    inviteUser: inviteMutation.mutateAsync,
    resendInvite: resendInviteMutation.mutateAsync,
    updateUser: updateMutation.mutateAsync,
    blockUser: blockMutation.mutateAsync,
    unblockUser: unblockMutation.mutateAsync,
    revokeUser: revokeMutation.mutateAsync,
    revokeInvite: revokeInviteMutation.mutateAsync,
    requestPasswordReset: passwordResetMutation.mutateAsync,
    isInvitingUser: inviteMutation.isPending,
    isResendingInvite: resendInviteMutation.isPending,
    isUpdatingUser: updateMutation.isPending,
    isBlockingUser: blockMutation.isPending,
    isUnblockingUser: unblockMutation.isPending,
    isRevokingUser: revokeMutation.isPending,
    isRevokingInvite: revokeInviteMutation.isPending,
    isRequestingPasswordReset: passwordResetMutation.isPending,
  }
}
