import { z } from 'zod'

export const internalStoreModuleActionTypes = ['activate', 'deactivate'] as const

export const internalStoreModuleOrigins = ['addon', 'courtesy', 'manual'] as const

export type InternalStoreModuleActionType =
  (typeof internalStoreModuleActionTypes)[number]

export type InternalStoreModuleOrigin = (typeof internalStoreModuleOrigins)[number]

const moneyRegex = /^\d+(?:[,.]\d{1,4})?$/

export const storeModuleManagementSchema = z
  .object({
    storeId: z.coerce.number().int().positive(),
    moduleId: z.coerce.number().int().positive(),
    entitlementId: z.coerce.number().int().positive().optional(),
    action: z.enum(internalStoreModuleActionTypes),
    origin: z.enum(internalStoreModuleOrigins).default('manual'),
    additionalAmount: z
      .string()
      .trim()
      .optional()
      .or(z.literal(''))
      .default(''),
    endsAt: z
      .string()
      .trim()
      .optional()
      .or(z.literal(''))
      .default(''),
    confirmation: z
      .preprocess(value => value ?? '', z.string().trim())
      .optional()
      .default(''),
    reason: z
      .string()
      .trim()
      .min(8, 'Informe um motivo com pelo menos 8 caracteres.'),
  })
  .superRefine((values, context) => {
    if (values.action === 'deactivate' && !values.entitlementId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['entitlementId'],
        message: 'Selecione um modulo liberado para desativar.',
      })
    }

    if (
      values.action === 'deactivate' &&
      values.confirmation.toLowerCase() !== 'desativar'
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['confirmation'],
        message: 'Digite DESATIVAR para confirmar o impacto.',
      })
    }

    if (values.action === 'activate' && values.origin === 'addon') {
      if (!values.additionalAmount || !moneyRegex.test(values.additionalAmount)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['additionalAmount'],
          message: 'Informe o valor adicional do modulo.',
        })
      }
    }

    if (
      values.action === 'activate' &&
      values.origin === 'courtesy' &&
      !values.endsAt
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['endsAt'],
        message: 'Informe ate quando a cortesia fica valida.',
      })
    }

    if (
      values.action === 'activate' &&
      values.origin !== 'addon' &&
      values.additionalAmount &&
      Number(values.additionalAmount.replace(/\./g, '').replace(',', '.')) > 0
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['additionalAmount'],
        message: 'Apenas modulo adicional pode ter valor.',
      })
    }
  })

export type StoreModuleManagementValues = z.infer<
  typeof storeModuleManagementSchema
>

export const normalizeModuleAdditionalAmount = ({
  origin,
  amount,
}: {
  origin: InternalStoreModuleOrigin
  amount: string
}) => {
  if (origin !== 'addon') return '0'

  return Number(amount.replace(/\./g, '').replace(',', '.')).toFixed(4)
}

export const getModuleEntitlementOriginLabel = (origin: string) => {
  const labels: Record<string, string> = {
    plan: 'Plano',
    addon: 'Adicional',
    courtesy: 'Cortesia',
    manual: 'Manual',
  }

  return labels[origin] ?? origin
}

export const getModuleEntitlementStatusLabel = (status: string) => {
  const labels: Record<string, string> = {
    active: 'Ativo',
    inactive: 'Inativo',
    expired: 'Expirado',
    revoked: 'Revogado',
    not_enabled: 'Nao liberado',
  }

  return labels[status] ?? status
}
