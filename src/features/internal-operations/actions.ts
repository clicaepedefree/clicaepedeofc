'use server'

import {
  archiveStore,
  createInternalStore,
  findInternalStoreCreationDuplicates,
  reactivateStoreWithAdmin,
  type InternalStoreDuplicateMatch,
} from '@/features/internal-operations/db'
import { internalStoreCreationSchema } from '@/features/internal-operations/internal-store-creation-policy'
import { requireInternalOperation } from '@/features/internal-operations/operation-permissions'
import {
  lookupBrazilianPostalCode,
  type InternalPostalCodeAddress,
} from '@/features/internal-operations/postal-code-lookup'
import { createHmac, timingSafeEqual } from 'node:crypto'
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
  | {
      success: false
      code: 'DUPLICATE_REVIEW_REQUIRED'
      error: string
      duplicates: InternalStoreDuplicateMatch[]
      duplicateReviewToken: string
    }
  | { success: false; error: string }

type LookupInternalPostalCodeActionResult =
  | { success: true; address: InternalPostalCodeAddress }
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

    if (error.message === 'IDEMPOTENCY_KEY_REUSED') {
      return 'Essa tentativa de cadastro ja foi usada com outros dados. Recarregue a pagina e tente novamente.'
    }

    if (error.message === 'PROVISIONING_REQUEST_IN_PROGRESS') {
      return 'Esse cadastro ainda esta sendo processado. Aguarde alguns segundos e tente novamente.'
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

const duplicateReviewTokenTtlMs = 10 * 60 * 1000

const getDuplicateReviewSecret = () =>
  process.env.CLERK_SECRET_KEY ??
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  process.env.NEXT_SERVER_ACTIONS_ENCRYPTION_KEY ??
  (process.env.NODE_ENV === 'production'
    ? (() => {
        throw new Error('DUPLICATE_REVIEW_SECRET_NOT_CONFIGURED')
      })()
    : 'internal-store-duplicate-review-dev-secret')

const toBase64Url = (value: string) => Buffer.from(value).toString('base64url')

const fromBase64Url = (value: string) =>
  Buffer.from(value, 'base64url').toString('utf8')

const getDuplicateFingerprint = ({
  values,
  duplicates,
}: {
  values: unknown
  duplicates: InternalStoreDuplicateMatch[]
}) =>
  JSON.stringify({
    values,
    duplicates: duplicates.map(duplicate => ({
      storeId: duplicate.storeId,
      fields: duplicate.matchedFields
        .map(field => field.field)
        .sort((left, right) => left.localeCompare(right)),
    })),
  })

const signDuplicateReviewToken = ({
  operatorClerkId,
  fingerprint,
}: {
  operatorClerkId: string
  fingerprint: string
}) => {
  const payload = JSON.stringify({
    operatorClerkId,
    fingerprint,
    expiresAt: Date.now() + duplicateReviewTokenTtlMs,
  })
  const encodedPayload = toBase64Url(payload)
  const signature = createHmac('sha256', getDuplicateReviewSecret())
    .update(encodedPayload)
    .digest('base64url')

  return `${encodedPayload}.${signature}`
}

const verifyDuplicateReviewToken = ({
  token,
  operatorClerkId,
  fingerprint,
}: {
  token: string | undefined
  operatorClerkId: string
  fingerprint: string
}) => {
  if (!token) return false

  const [encodedPayload, signature] = token.split('.')
  if (!encodedPayload || !signature) return false

  const expectedSignature = createHmac('sha256', getDuplicateReviewSecret())
    .update(encodedPayload)
    .digest('base64url')
  const signatureBuffer = Buffer.from(signature)
  const expectedSignatureBuffer = Buffer.from(expectedSignature)

  if (
    signatureBuffer.length !== expectedSignatureBuffer.length ||
    !timingSafeEqual(signatureBuffer, expectedSignatureBuffer)
  ) {
    return false
  }

  try {
    const payload = JSON.parse(fromBase64Url(encodedPayload)) as {
      operatorClerkId?: string
      fingerprint?: string
      expiresAt?: number
    }

    return (
      payload.operatorClerkId === operatorClerkId &&
      payload.fingerprint === fingerprint &&
      typeof payload.expiresAt === 'number' &&
      payload.expiresAt > Date.now()
    )
  } catch {
    return false
  }
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
    const duplicates = await findInternalStoreCreationDuplicates(
      parsedPayload.data
    )

    if (duplicates.length > 0) {
      const fingerprint = getDuplicateFingerprint({
        values: {
          ...parsedPayload.data,
          duplicateOverrideConfirmed: undefined,
          duplicateReviewToken: undefined,
        },
        duplicates,
      })
      const hasValidDuplicateReview =
        parsedPayload.data.duplicateOverrideConfirmed &&
        verifyDuplicateReviewToken({
          token: parsedPayload.data.duplicateReviewToken,
          operatorClerkId: operator.clerkId,
          fingerprint,
        })

      if (!hasValidDuplicateReview) {
        return {
          success: false,
          code: 'DUPLICATE_REVIEW_REQUIRED',
          error:
            'Encontramos possivel duplicidade. Revise os registros antes de confirmar a excecao.',
          duplicates,
          duplicateReviewToken: signDuplicateReviewToken({
            operatorClerkId: operator.clerkId,
            fingerprint,
          }),
        }
      }
    }

    const result = await createInternalStore({
      values: parsedPayload.data,
      operator,
    })

    revalidatePath('/internal/stores')
    revalidatePath('/internal-operations')

    return { success: true, storeId: result.store.id }
  } catch (error) {
    console.error(
      '[internal-operations] Failed to create internal store',
      error
    )

    return {
      success: false,
      error: getInternalStoreCreationErrorMessage(error),
    }
  }
}

export async function lookupInternalPostalCodeAction(
  postalCode: unknown
): Promise<LookupInternalPostalCodeActionResult> {
  await requireInternalOperation('createStore')

  if (typeof postalCode !== 'string') {
    return { success: false, error: 'Informe um CEP com 8 digitos.' }
  }

  const result = await lookupBrazilianPostalCode(postalCode)

  if (!result.success) {
    return { success: false, error: result.error }
  }

  return { success: true, address: result.address }
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
    redirectWithError(
      returnPath,
      'Informe um motivo com pelo menos 8 caracteres.'
    )
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
      redirectWithError(
        returnPath,
        'Esse e-mail ainda nao tem uma conta ativa no app.'
      )
    }

    if (
      error instanceof Error &&
      error.message === 'STORE_STATUS_NOT_REACTIVATABLE'
    ) {
      redirectWithError(
        returnPath,
        'Essa loja nao esta em um status reativavel.'
      )
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
    redirectWithError(
      returnPath,
      'Informe um motivo com pelo menos 8 caracteres.'
    )
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
      redirectWithError(
        returnPath,
        'Confirmacao incorreta. Digite o subdominio da loja.'
      )
    }

    redirectWithError(returnPath, 'Nao foi possivel arquivar a loja agora.')
  }

  revalidatePath('/internal/stores')
  revalidatePath('/internal-operations')
  redirect(`${returnPath}?result=loja-arquivada`)
}
