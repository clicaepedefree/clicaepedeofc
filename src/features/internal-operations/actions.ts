'use server'

import {
  archiveStore,
  activateStoreAfterImplementation,
  blockStoreAccess,
  changeStoreSubscriptionPlan,
  createInternalStore,
  findInternalStoreCreationDuplicates,
  findInternalStoreProfileUpdateDuplicates,
  reactivateStoreWithAdmin,
  resendStoreAccessInvite,
  unblockStoreAccess,
  updateInternalStoreProfile,
  updateStoreCommercialLifecycle,
  updateStoreImplementationChecklistItem,
  updateStoreSubscriptionTerms,
  type InternalStoreDuplicateMatch,
} from '@/features/internal-operations/db'
import {
  canUseInternalPermission,
  getInternalOperator,
} from '@/features/internal-operations/access'
import { isStoreImplementationChecklistItemKey } from '@/features/internal-operations/implementation-checklist-policy'
import {
  internalStoreCreationSchema,
  isInternalStoreCreationReviewConfirmed,
} from '@/features/internal-operations/internal-store-creation-policy'
import { requireInternalOperation } from '@/features/internal-operations/operation-permissions'
import {
  internalStoreProfileEditSchema,
  type InternalStoreProfileEditValues,
} from '@/features/internal-operations/store-profile-edit-policy'
import {
  storeLifecycleTransitionSchema,
  type StoreLifecycleTransitionValues,
} from '@/features/internal-operations/store-lifecycle-policy'
import {
  storeAccessBlockActionSchema,
  storeAccessUnblockActionSchema,
  type StoreAccessBlockActionValues,
  type StoreAccessUnblockActionValues,
} from '@/features/internal-operations/store-access-block-policy'
import {
  storeSubscriptionTermsSchema,
  type StoreSubscriptionTermsValues,
} from '@/features/internal-operations/subscription-terms-policy'
import {
  storeSubscriptionPlanChangeSchema,
  type StoreSubscriptionPlanChangeValues,
} from '@/features/internal-operations/subscription-plan-change-policy'
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
  if (
    returnTo === '/internal/stores' ||
    /^\/internal\/stores(?:\/\d+)?(?:\?[A-Za-z0-9=&_%.-]+)?$/.test(returnTo)
  ) {
    return returnTo
  }

  return '/internal/stores'
}

const appendRouteParam = (returnPath: string, key: string, value: string) =>
  `${returnPath}${returnPath.includes('?') ? '&' : '?'}${key}=${encodeURIComponent(value)}`

const redirectWithError = (returnPath: string, message: string): never => {
  redirect(appendRouteParam(returnPath, 'error', message))
}

const redirectWithResult = (returnPath: string, result: string): never => {
  redirect(appendRouteParam(returnPath, 'result', result))
}

const requireSubscriptionTermsOperator = async () => {
  const operator = await getInternalOperator()
  const canManageBillingValues = canUseInternalPermission({
    currentRole: operator?.role ?? null,
    permission: 'manage_billing_values',
  })
  const canApplyBillingDiscounts = canUseInternalPermission({
    currentRole: operator?.role ?? null,
    permission: 'apply_billing_discounts',
  })

  if (!operator || (!canManageBillingValues && !canApplyBillingDiscounts)) {
    redirect('/unauthorized')
  }

  return operator
}

type CreateInternalStoreActionResult =
  | {
      success: true
      storeId: number
      accessInvite?: {
        inviteUrl: string
        targetEmail: string
        expiresAt: string
      }
    }
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

type ResendStoreAccessInviteActionResult =
  | {
      success: true
      inviteUrl: string
      targetEmail: string
      expiresAt: string
    }
  | { success: false; error: string }

const getInternalStoreCreationErrorMessage = (error: unknown) => {
  if (error instanceof Error) {
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

  if (!isInternalStoreCreationReviewConfirmed(parsedPayload.data)) {
    return {
      success: false,
      error: 'Confirme novamente a revisao final antes de cadastrar a loja.',
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

    return {
      success: true,
      storeId: result.store.id,
      accessInvite: result.accessInvite
        ? {
            inviteUrl: result.accessInvite.inviteUrl,
            targetEmail: result.accessInvite.targetEmail,
            expiresAt: result.accessInvite.expiresAt.toISOString(),
          }
        : undefined,
    }
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

export async function resendStoreAccessInviteAction(
  payload: unknown
): Promise<ResendStoreAccessInviteActionResult> {
  const operator = await requireInternalOperation('createStore')

  if (
    typeof payload !== 'object' ||
    !payload ||
    !('storeId' in payload) ||
    !('targetEmail' in payload)
  ) {
    return { success: false, error: 'Dados invalidos para reenviar convite.' }
  }

  const storeId = Number((payload as { storeId: unknown }).storeId)
  const targetEmail = (payload as { targetEmail: unknown }).targetEmail

  if (!Number.isInteger(storeId) || storeId <= 0) {
    return { success: false, error: 'Loja invalida para convite.' }
  }

  if (typeof targetEmail !== 'string' || !targetEmail.includes('@')) {
    return { success: false, error: 'Informe um e-mail valido.' }
  }

  try {
    const invite = await resendStoreAccessInvite({
      storeId,
      targetEmail,
      operator,
    })

    revalidatePath('/internal/stores')
    revalidatePath('/internal-operations')

    return {
      success: true,
      inviteUrl: invite.inviteUrl,
      targetEmail: invite.targetEmail,
      expiresAt: invite.expiresAt.toISOString(),
    }
  } catch (error) {
    console.error('[internal-operations] Failed to resend access invite', error)

    if (error instanceof Error && error.message === 'STORE_ARCHIVED') {
      return { success: false, error: 'Loja arquivada nao recebe convite.' }
    }

    return { success: false, error: 'Nao foi possivel gerar novo convite.' }
  }
}

export async function updateInternalStoreProfileAction(formData: FormData) {
  const operator = await requireInternalOperation('manageStoreProfile')
  const returnPath = getReturnPath(formData)
  const parsedPayload = internalStoreProfileEditSchema.safeParse({
    storeId: Number(getRequiredString(formData, 'storeId')),
    storeName: getRequiredString(formData, 'storeName'),
    subdomain: getRequiredString(formData, 'subdomain'),
    companyName: getRequiredString(formData, 'companyName'),
    companyEmail: getRequiredString(formData, 'companyEmail'),
    phone1: getRequiredString(formData, 'phone1'),
    phone2: getRequiredString(formData, 'phone2'),
    companyTaxNumberReplacement: getRequiredString(
      formData,
      'companyTaxNumberReplacement'
    ),
    responsibleName: getRequiredString(formData, 'responsibleName'),
    responsibleEmail: getRequiredString(formData, 'responsibleEmail'),
    responsiblePhone: getRequiredString(formData, 'responsiblePhone'),
    responsibleTaxNumberReplacement: getRequiredString(
      formData,
      'responsibleTaxNumberReplacement'
    ),
    postalCode: getRequiredString(formData, 'postalCode'),
    street: getRequiredString(formData, 'street'),
    number: getRequiredString(formData, 'number'),
    district: getRequiredString(formData, 'district'),
    city: getRequiredString(formData, 'city'),
    stateCode: getRequiredString(formData, 'stateCode'),
    acquisitionSource: getRequiredString(formData, 'acquisitionSource'),
    salesOwner: getRequiredString(formData, 'salesOwner'),
    internalNotes: getRequiredString(formData, 'internalNotes'),
    reason: getRequiredString(formData, 'reason'),
    sensitiveConfirmation: formData.get('sensitiveConfirmation') === 'on',
  })

  if (!parsedPayload.success) {
    redirectWithError(
      returnPath,
      parsedPayload.error.issues[0]?.message ?? 'Dados invalidos.'
    )
  }
  const values = parsedPayload.data as InternalStoreProfileEditValues

  const duplicates = await findInternalStoreProfileUpdateDuplicates(values)
  if (duplicates.length > 0) {
    const duplicateSummary = duplicates
      .map(
        duplicate =>
          `${duplicate.storeName}: ${duplicate.matchedFields
            .map(field => field.label)
            .join(', ')}`
      )
      .join(' | ')

    redirectWithError(
      returnPath,
      `Existe duplicidade cadastral em outra loja. ${duplicateSummary}`
    )
  }

  try {
    await updateInternalStoreProfile({
      values,
      operator,
    })
  } catch (error) {
    if (error instanceof Error && error.message === 'STORE_ARCHIVED') {
      redirectWithError(
        returnPath,
        'Loja arquivada nao permite alteracao cadastral.'
      )
    }

    if (
      error instanceof Error &&
      error.message === 'SENSITIVE_CONFIRMATION_REQUIRED'
    ) {
      redirectWithError(
        returnPath,
        'Confirme explicitamente as mudancas sensiveis antes de salvar.'
      )
    }

    if (
      error instanceof Error &&
      error.message === 'STORE_PROFILE_NO_CHANGES'
    ) {
      redirectWithError(
        returnPath,
        'Nenhuma alteracao cadastral foi detectada.'
      )
    }

    if (
      error instanceof Error &&
      (error.message.includes('stores_subdomain_unique') ||
        error.message.includes('duplicate key'))
    ) {
      redirectWithError(
        returnPath,
        'Esse endereco publico ja esta em uso. Tente outro subdominio.'
      )
    }

    console.error('[internal-operations] Failed to update store profile', error)
    redirectWithError(
      returnPath,
      'Nao foi possivel atualizar os dados da loja agora.'
    )
  }

  revalidatePath('/internal/stores')
  revalidatePath(returnPath.split('?')[0] ?? '/internal/stores')
  revalidatePath('/internal-operations')
  redirectWithResult(returnPath, 'dados-atualizados')
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
  redirectWithResult(returnPath, 'loja-reativada')
}

export async function updateStoreImplementationChecklistItemAction(
  formData: FormData
) {
  const operator = await requireInternalOperation(
    'manageImplementationChecklist'
  )
  const storeId = Number(getRequiredString(formData, 'storeId'))
  const itemKey = getRequiredString(formData, 'itemKey')
  const observation = getRequiredString(formData, 'observation')
  const completed = formData.get('completed') === 'on'
  const returnPath = getReturnPath(formData)
  const checklistItemKey = isStoreImplementationChecklistItemKey(itemKey)
    ? itemKey
    : null

  if (!Number.isInteger(storeId) || storeId <= 0) {
    redirectWithError(returnPath, 'Loja invalida para checklist.')
  }

  if (!checklistItemKey) {
    redirectWithError(returnPath, 'Item de checklist invalido.')
  }

  try {
    await updateStoreImplementationChecklistItem({
      storeId,
      itemKey: checklistItemKey!,
      completed,
      observation,
      operator,
    })
  } catch (error) {
    if (error instanceof Error && error.message === 'STORE_ARCHIVED') {
      redirectWithError(
        returnPath,
        'Loja arquivada nao pode ter checklist alterado.'
      )
    }

    redirectWithError(returnPath, 'Nao foi possivel atualizar o checklist.')
  }

  revalidatePath('/internal/stores')
  revalidatePath('/internal-operations')
  redirectWithResult(returnPath, 'checklist-atualizado')
}

export async function activateStoreAfterImplementationAction(
  formData: FormData
) {
  const operator = await requireInternalOperation('activateImplementedStore')
  const storeId = Number(getRequiredString(formData, 'storeId'))
  const reason = getRequiredString(formData, 'reason')
  const returnPath = getReturnPath(formData)

  if (!Number.isInteger(storeId) || storeId <= 0) {
    redirectWithError(returnPath, 'Loja invalida para ativacao.')
  }

  if (reason.length < MIN_REASON_LENGTH) {
    redirectWithError(
      returnPath,
      'Informe um motivo com pelo menos 8 caracteres.'
    )
  }

  try {
    await activateStoreAfterImplementation({
      storeId,
      reason,
      operator,
    })
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === 'STORE_STATUS_NOT_IMPLEMENTING'
    ) {
      redirectWithError(
        returnPath,
        'A loja precisa estar em implantacao para ser ativada por este fluxo.'
      )
    }

    if (
      error instanceof Error &&
      error.message === 'STORE_IMPLEMENTATION_CHECKLIST_INCOMPLETE'
    ) {
      redirectWithError(
        returnPath,
        'Conclua todos os itens obrigatorios antes de ativar a loja.'
      )
    }

    redirectWithError(returnPath, 'Nao foi possivel ativar a loja agora.')
  }

  revalidatePath('/internal/stores')
  revalidatePath('/internal-operations')
  redirectWithResult(returnPath, 'loja-ativada')
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
  redirectWithResult(returnPath, 'loja-arquivada')
}

export async function blockStoreAccessAction(formData: FormData) {
  const operator = await requireInternalOperation('blockStore')
  const returnPath = getReturnPath(formData)
  const values: StoreAccessBlockActionValues = (() => {
    try {
      return storeAccessBlockActionSchema.parse({
        storeId: formData.get('storeId'),
        reason: formData.get('reason'),
        notifyStoreOwner: formData.get('notifyStoreOwner') === 'on',
        notificationNote: formData.get('notificationNote'),
        scheduledUnblockAt: formData.get('scheduledUnblockAt'),
      })
    } catch {
      redirectWithError(
        returnPath,
        'Informe loja, motivo e data programada valida quando houver.'
      )
      throw new Error('INVALID_STORE_ACCESS_BLOCK_FORM')
    }
  })()

  try {
    await blockStoreAccess({
      values,
      operator,
    })
  } catch (error) {
    if (error instanceof Error && error.message === 'STORE_ARCHIVED') {
      redirectWithError(
        returnPath,
        'Loja arquivada nao permite bloqueio de acesso.'
      )
    }

    if (
      error instanceof Error &&
      error.message === 'STORE_ACCESS_BLOCK_ALREADY_ACTIVE'
    ) {
      redirectWithError(returnPath, 'Essa loja ja possui bloqueio ativo.')
    }

    if (
      error instanceof Error &&
      error.message === 'STORE_ACCESS_BLOCK_SCHEDULE_IN_PAST'
    ) {
      redirectWithError(
        returnPath,
        'A data programada de desbloqueio precisa ser futura.'
      )
    }

    redirectWithError(returnPath, 'Nao foi possivel bloquear a loja agora.')
  }

  revalidatePath('/internal/stores')
  revalidatePath('/internal-operations')
  redirectWithResult(returnPath, 'acesso-loja-bloqueado')
}

export async function unblockStoreAccessAction(formData: FormData) {
  const operator = await requireInternalOperation('blockStore')
  const returnPath = getReturnPath(formData)
  const values: StoreAccessUnblockActionValues = (() => {
    try {
      return storeAccessUnblockActionSchema.parse({
        storeId: formData.get('storeId'),
        reason: formData.get('reason'),
      })
    } catch {
      redirectWithError(
        returnPath,
        'Informe uma justificativa com pelo menos 8 caracteres.'
      )
      throw new Error('INVALID_STORE_ACCESS_UNBLOCK_FORM')
    }
  })()

  try {
    await unblockStoreAccess({
      values,
      operator,
    })
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === 'STORE_ACCESS_BLOCK_NOT_ACTIVE'
    ) {
      redirectWithError(returnPath, 'Essa loja nao possui bloqueio ativo.')
    }

    redirectWithError(returnPath, 'Nao foi possivel desbloquear a loja agora.')
  }

  revalidatePath('/internal/stores')
  revalidatePath('/internal-operations')
  redirectWithResult(returnPath, 'acesso-loja-desbloqueado')
}

export async function updateStoreCommercialLifecycleAction(formData: FormData) {
  const operator = await requireInternalOperation('manageStoreLifecycle')
  const returnPath = getReturnPath(formData)
  const values: StoreLifecycleTransitionValues = (() => {
    try {
      return storeLifecycleTransitionSchema.parse({
        storeId: formData.get('storeId'),
        targetStatus: formData.get('targetStatus'),
        reason: formData.get('reason'),
        subscriptionEffect: formData.get('subscriptionEffect'),
        accessEffect: formData.get('accessEffect'),
        confirmation: formData.get('confirmation'),
      })
    } catch {
      redirectWithError(
        returnPath,
        'Revise status, motivo e efeitos antes de confirmar.'
      )
      throw new Error('INVALID_STORE_LIFECYCLE_FORM')
    }
  })()

  try {
    await updateStoreCommercialLifecycle({
      ...values,
      operator,
    })
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === 'STORE_LIFECYCLE_TRANSITION_INVALID'
    ) {
      redirectWithError(
        returnPath,
        'Transicao comercial invalida para o status atual da loja.'
      )
    }

    if (
      error instanceof Error &&
      error.message === 'STORE_LIFECYCLE_CONFIRMATION_MISMATCH'
    ) {
      redirectWithError(
        returnPath,
        'Confirmacao incorreta. Digite o subdominio da loja.'
      )
    }

    if (
      error instanceof Error &&
      error.message === 'STORE_LIFECYCLE_FINANCIAL_CONFIG_INVALID'
    ) {
      redirectWithError(
        returnPath,
        'A loja precisa ter assinatura, plano, valor e periodo financeiro validos para ativacao.'
      )
    }

    if (
      error instanceof Error &&
      error.message === 'STORE_IMPLEMENTATION_CHECKLIST_INCOMPLETE'
    ) {
      redirectWithError(
        returnPath,
        'Conclua os itens obrigatorios de implantacao antes de ativar.'
      )
    }

    if (
      error instanceof Error &&
      (error.message === 'STORE_LIFECYCLE_SUBSCRIPTION_EFFECT_INVALID' ||
        error.message === 'STORE_LIFECYCLE_ACCESS_EFFECT_INVALID')
    ) {
      redirectWithError(returnPath, 'Efeito escolhido nao combina com a acao.')
    }

    redirectWithError(
      returnPath,
      'Nao foi possivel atualizar o ciclo comercial agora.'
    )
  }

  revalidatePath('/internal/stores')
  revalidatePath('/internal-operations')
  redirectWithResult(returnPath, 'ciclo-comercial-atualizado')
}

export async function updateStoreSubscriptionTermsAction(formData: FormData) {
  const operator = await requireSubscriptionTermsOperator()
  const returnPath = getReturnPath(formData)
  const values: StoreSubscriptionTermsValues = (() => {
    try {
      return storeSubscriptionTermsSchema.parse({
        storeId: formData.get('storeId'),
        subscriptionId: formData.get('subscriptionId'),
        contractedAmount: formData.get('contractedAmount'),
        discountType: formData.get('discountType'),
        discountValue: formData.get('discountValue'),
        discountValidUntil: formData.get('discountValidUntil'),
        paymentGraceDays: formData.get('paymentGraceDays'),
        reason: formData.get('reason'),
      })
    } catch (error) {
      const message =
        error instanceof Error && 'issues' in error
          ? String(
              (error as { issues?: { message?: string }[] }).issues?.[0]
                ?.message
            )
          : 'Revise valor, desconto, validade, tolerancia e motivo.'

      redirectWithError(returnPath, message)
      throw new Error('INVALID_STORE_SUBSCRIPTION_TERMS_FORM')
    }
  })()

  try {
    await updateStoreSubscriptionTerms({
      values,
      operator,
    })
  } catch (error) {
    if (error instanceof Error && error.message === 'STORE_ARCHIVED') {
      redirectWithError(
        returnPath,
        'Loja arquivada nao permite alteracao de plano.'
      )
    }

    if (
      error instanceof Error &&
      error.message === 'STORE_SUBSCRIPTION_NOT_FOUND'
    ) {
      redirectWithError(
        returnPath,
        'Assinatura ativa nao encontrada para esta loja.'
      )
    }

    if (
      error instanceof Error &&
      error.message === 'STORE_SUBSCRIPTION_FINANCE_PERMISSION_REQUIRED'
    ) {
      redirectWithError(
        returnPath,
        'Seu perfil pode editar descontos, mas valor contratado e tolerancia exigem permissao financeira.'
      )
    }

    console.error(
      '[internal-operations] Failed to update subscription terms',
      error
    )
    redirectWithError(
      returnPath,
      'Nao foi possivel atualizar a condicao do plano agora.'
    )
  }

  revalidatePath('/internal/stores')
  revalidatePath('/internal-operations')
  redirectWithResult(returnPath, 'condicao-plano-atualizada')
}

export async function changeStoreSubscriptionPlanAction(formData: FormData) {
  const operator = await requireInternalOperation('manageBillingValues')
  const returnPath = getReturnPath(formData)
  let wasAppliedImmediately = false
  const values: StoreSubscriptionPlanChangeValues = (() => {
    try {
      return storeSubscriptionPlanChangeSchema.parse({
        storeId: formData.get('storeId'),
        subscriptionId: formData.get('subscriptionId'),
        targetPlanId: formData.get('targetPlanId'),
        timing: formData.get('timing'),
        valueMode: formData.get('valueMode'),
        customContractedAmount: formData.get('customContractedAmount'),
        moduleTreatment: formData.get('moduleTreatment'),
        prorationPolicy: formData.get('prorationPolicy'),
        confirmation: formData.get('confirmation'),
        reason: formData.get('reason'),
      })
    } catch (error) {
      const message =
        error instanceof Error && 'issues' in error
          ? String(
              (error as { issues?: { message?: string }[] }).issues?.[0]
                ?.message
            )
          : 'Revise plano, vigencia, valor, modulos e motivo.'

      redirectWithError(returnPath, message)
      throw new Error('INVALID_STORE_SUBSCRIPTION_PLAN_CHANGE_FORM')
    }
  })()

  try {
    const result = await changeStoreSubscriptionPlan({
      values,
      operator,
    })

    wasAppliedImmediately = Boolean(result.appliedSubscription)
    revalidatePath('/internal/stores')
    revalidatePath('/internal-operations')
  } catch (error) {
    if (error instanceof Error && error.message === 'STORE_ARCHIVED') {
      redirectWithError(
        returnPath,
        'Loja arquivada nao permite mudanca de plano.'
      )
    }

    if (
      error instanceof Error &&
      error.message === 'STORE_SUBSCRIPTION_NOT_FOUND'
    ) {
      redirectWithError(
        returnPath,
        'Assinatura ativa nao encontrada para esta loja.'
      )
    }

    if (
      error instanceof Error &&
      error.message === 'STORE_SUBSCRIPTION_PLAN_UNCHANGED'
    ) {
      redirectWithError(returnPath, 'Escolha um plano diferente do atual.')
    }

    if (
      error instanceof Error &&
      error.message === 'STORE_SUBSCRIPTION_PLAN_CHANGE_PENDING'
    ) {
      redirectWithError(
        returnPath,
        'Ja existe uma mudanca de plano programada para esta assinatura.'
      )
    }

    if (
      error instanceof Error &&
      error.message === 'NEXT_BILLING_DATE_REQUIRED'
    ) {
      redirectWithError(
        returnPath,
        'A assinatura precisa ter proxima cobranca para programar mudanca.'
      )
    }

    console.error(
      '[internal-operations] Failed to change subscription plan',
      error
    )
    redirectWithError(returnPath, 'Nao foi possivel mudar o plano agora.')
  }

  redirectWithResult(
    returnPath,
    wasAppliedImmediately
      ? 'mudanca-plano-aplicada'
      : 'mudanca-plano-programada'
  )
}
