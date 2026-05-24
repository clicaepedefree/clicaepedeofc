'use server'

import { requireInternalOperator } from '@/features/internal-operations/access'
import {
  archiveStore,
  reactivateStoreWithAdmin,
} from '@/features/internal-operations/db'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

const MIN_REASON_LENGTH = 8

const getRequiredString = (formData: FormData, field: string) => {
  const value = formData.get(field)
  if (typeof value !== 'string') return ''

  return value.trim()
}

const redirectWithError = (message: string): never => {
  redirect(`/internal/stores?error=${encodeURIComponent(message)}`)
}

export async function reactivateStoreAction(formData: FormData) {
  const operator = await requireInternalOperator('support')
  const storeId = Number(getRequiredString(formData, 'storeId'))
  const adminEmail = getRequiredString(formData, 'adminEmail')
  const reason = getRequiredString(formData, 'reason')

  if (!Number.isInteger(storeId) || storeId <= 0) {
    redirectWithError('Loja invalida para reativacao.')
  }

  if (!adminEmail.includes('@')) {
    redirectWithError('Informe o e-mail do novo administrador.')
  }

  if (reason.length < MIN_REASON_LENGTH) {
    redirectWithError('Informe um motivo com pelo menos 8 caracteres.')
  }

  try {
    await reactivateStoreWithAdmin({
      storeId,
      adminEmail,
      reason,
      operator,
    })
  } catch (error) {
    if (error instanceof Error && error.message === 'TARGET_USER_NOT_FOUND') {
      redirectWithError('Esse e-mail ainda nao tem uma conta ativa no app.')
    }

    if (
      error instanceof Error &&
      error.message === 'STORE_STATUS_NOT_REACTIVATABLE'
    ) {
      redirectWithError('Essa loja nao esta em um status reativavel.')
    }

    redirectWithError('Nao foi possivel reativar a loja agora.')
  }

  revalidatePath('/internal/stores')
  redirect('/internal/stores?result=loja-reativada')
}

export async function archiveStoreAction(formData: FormData) {
  const operator = await requireInternalOperator('ops_admin')
  const storeId = Number(getRequiredString(formData, 'storeId'))
  const confirmation = getRequiredString(formData, 'confirmation')
  const reason = getRequiredString(formData, 'reason')

  if (!Number.isInteger(storeId) || storeId <= 0) {
    redirectWithError('Loja invalida para arquivamento.')
  }

  if (reason.length < MIN_REASON_LENGTH) {
    redirectWithError('Informe um motivo com pelo menos 8 caracteres.')
  }

  try {
    await archiveStore({
      storeId,
      confirmationSubdomain: confirmation,
      reason,
      operator,
    })
  } catch (error) {
    if (error instanceof Error && error.message === 'STORE_ALREADY_ARCHIVED') {
      redirectWithError('Essa loja ja esta arquivada.')
    }

    if (
      error instanceof Error &&
      error.message === 'STORE_CONFIRMATION_MISMATCH'
    ) {
      redirectWithError('Confirmacao incorreta. Digite o subdominio da loja.')
    }

    redirectWithError('Nao foi possivel arquivar a loja agora.')
  }

  revalidatePath('/internal/stores')
  redirect('/internal/stores?result=loja-arquivada')
}
