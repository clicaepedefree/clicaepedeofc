'use server'

import {
  archiveStore,
  createInternalStore,
  reactivateStoreWithAdmin,
} from '@/features/internal-operations/db'
import { internalStoreCreationSchema } from '@/features/internal-operations/internal-store-creation-policy'
import { requireInternalOperation } from '@/features/internal-operations/operation-permissions'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

const MIN_REASON_LENGTH = 8

const getRequiredString = (formData: FormData, field: string) => {
  const value = formData.get(field)
  if (typeof value !== 'string') return ''

  return value.trim()
}

const getReturnPath = (formData: FormData) => {
  const returnTo = getRequiredString(formData, 'returnTo')
  if (returnTo === '/internal-operations') return returnTo

  return '/internal/stores'
}

const redirectWithError = (returnPath: string, message: string): never => {
  redirect(`${returnPath}?error=${encodeURIComponent(message)}`)
}

type CreateInternalStoreActionResult =
  | { success: true; storeId: number }
  | { success: false; error: string }

const getInternalStoreCreationErrorMessage = (error: unknown) => {
  if (error instanceof Error) {
    if (error.message === 'RESPONSIBLE_USER_NOT_FOUND') {
      return 'O responsavel precisa ter uma conta ativa no app antes do cadastro.'
    }

    if (error.message === 'BILLING_PLAN_NOT_FOUND') {
      return 'Selecione um plano ativo para continuar.'
    }

    if (error.message === 'INVALID_MODULE_SELECTION') {
      return 'Selecione apenas modulos ativos para continuar.'
    }

    if (
      error.message.includes('stores_subdomain_unique') ||
      error.message.includes('duplicate key')
    ) {
      return 'Esse endereco publico ja esta em uso. Tente outro subdominio.'
    }
  }

  return 'Nao foi possivel cadastrar a loja agora.'
}

export async function createInternalStoreAction(
  payload: unknown
): Promise<CreateInternalStoreActionResult> {
  const operator = await requireInternalOperation('createStore')
  const parsedPayload = internalStoreCreationSchema.safeParse(payload)

  if (!parsedPayload.success) {
    return {
      success: false,
      error: parsedPayload.error.issues[0]?.message ?? 'Dados invalidos',
    }
  }

  try {
    const result = await createInternalStore({
      values: parsedPayload.data,
      operator,
    })

    revalidatePath('/internal/stores')
    revalidatePath('/internal-operations')

    return { success: true, storeId: result.store.id }
  } catch (error) {
    console.error('[internal-operations] Failed to create internal store', error)

    return {
      success: false,
      error: getInternalStoreCreationErrorMessage(error),
    }
  }
}

export async function reactivateStoreAction(formData: FormData) {
  const operator = await requireInternalOperation('reactivateStore')
  const storeId = Number(getRequiredString(formData, 'storeId'))
  const adminEmail = getRequiredString(formData, 'adminEmail')
  const reason = getRequiredString(formData, 'reason')
  const returnPath = getReturnPath(formData)

  if (!Number.isInteger(storeId) || storeId <= 0) {
    redirectWithError(returnPath, 'Loja invalida para reativacao.')
  }

  if (!adminEmail.includes('@')) {
    redirectWithError(returnPath, 'Informe o e-mail do novo administrador.')
  }

  if (reason.length < MIN_REASON_LENGTH) {
    redirectWithError(returnPath, 'Informe um motivo com pelo menos 8 caracteres.')
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
      redirectWithError(returnPath, 'Esse e-mail ainda nao tem uma conta ativa no app.')
    }

    if (
      error instanceof Error &&
      error.message === 'STORE_STATUS_NOT_REACTIVATABLE'
    ) {
      redirectWithError(returnPath, 'Essa loja nao esta em um status reativavel.')
    }

    redirectWithError(returnPath, 'Nao foi possivel reativar a loja agora.')
  }

  revalidatePath('/internal/stores')
  revalidatePath('/internal-operations')
  redirect(`${returnPath}?result=loja-reativada`)
}

export async function archiveStoreAction(formData: FormData) {
  const operator = await requireInternalOperation('archiveStore')
  const storeId = Number(getRequiredString(formData, 'storeId'))
  const confirmation = getRequiredString(formData, 'confirmation')
  const reason = getRequiredString(formData, 'reason')
  const returnPath = getReturnPath(formData)

  if (!Number.isInteger(storeId) || storeId <= 0) {
    redirectWithError(returnPath, 'Loja invalida para arquivamento.')
  }

  if (reason.length < MIN_REASON_LENGTH) {
    redirectWithError(returnPath, 'Informe um motivo com pelo menos 8 caracteres.')
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
      redirectWithError(returnPath, 'Essa loja ja esta arquivada.')
    }

    if (
      error instanceof Error &&
      error.message === 'STORE_CONFIRMATION_MISMATCH'
    ) {
      redirectWithError(returnPath, 'Confirmacao incorreta. Digite o subdominio da loja.')
    }

    redirectWithError(returnPath, 'Nao foi possivel arquivar a loja agora.')
  }

  revalidatePath('/internal/stores')
  revalidatePath('/internal-operations')
  redirect(`${returnPath}?result=loja-arquivada`)
}
