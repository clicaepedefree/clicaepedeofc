import {
  normalizeStoreSubdomain,
  reservedStoreSubdomains,
} from '@/features/store/form-validation/onboarding-store-schema'
import { z } from 'zod'
import {
  isValidInternalCnpj,
  isValidInternalCpf,
  normalizeInternalCnpj,
  normalizeInternalCpf,
  normalizeInternalDigits,
  normalizeInternalEmail,
  normalizeInternalPhone,
  normalizeInternalPostalCode,
} from './internal-store-creation-policy'

const subdomainRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

const normalizeText = (value: string | null | undefined) =>
  (value ?? '').trim().replace(/\s+/g, ' ')

const optionalText = z
  .string()
  .trim()
  .max(240, 'Use ate 240 caracteres')
  .transform(value => value.replace(/\s+/g, ' '))

const optionalLongText = z
  .string()
  .trim()
  .max(1000, 'Use ate 1000 caracteres')
  .transform(value => value.replace(/\s+/g, ' '))

const requiredText = (message: string, max = 120) =>
  z
    .string()
    .trim()
    .min(2, message)
    .max(max, `Use ate ${max} caracteres`)
    .transform(value => value.replace(/\s+/g, ' '))

const optionalEmail = z
  .string()
  .trim()
  .toLowerCase()
  .max(254, 'Use ate 254 caracteres')
  .refine(
    value => !value || z.string().email().safeParse(value).success,
    'Informe um e-mail valido'
  )

const optionalPhone = z
  .string()
  .trim()
  .transform(normalizeInternalPhone)
  .refine(
    value => !value || (value.length >= 10 && value.length <= 11),
    'Informe um telefone valido'
  )

const optionalReplacementCpf = z
  .string()
  .trim()
  .transform(normalizeInternalCpf)
  .refine(value => !value || isValidInternalCpf(value), 'Informe um CPF valido')

const optionalReplacementCnpj = z
  .string()
  .trim()
  .transform(normalizeInternalCnpj)
  .refine(
    value => !value || isValidInternalCnpj(value),
    'Informe um CNPJ valido'
  )

export const internalStoreProfileEditSchema = z.object({
  storeId: z.number().int().positive(),
  storeName: requiredText('Informe o nome da loja', 80),
  subdomain: z
    .string()
    .trim()
    .toLowerCase()
    .transform(normalizeStoreSubdomain)
    .pipe(
      z
        .string()
        .min(3, 'Use pelo menos 3 caracteres')
        .max(40, 'Use ate 40 caracteres')
        .regex(
          subdomainRegex,
          'Use apenas letras, numeros e hifens, sem hifen no inicio ou fim'
        )
        .refine(
          value => !reservedStoreSubdomains.has(value),
          'Esse endereco e reservado. Tente outro nome.'
        )
    ),
  companyName: optionalText,
  companyEmail: optionalEmail,
  phone1: optionalPhone,
  phone2: optionalPhone,
  companyTaxNumberReplacement: optionalReplacementCnpj,
  responsibleName: requiredText('Informe o nome do responsavel'),
  responsibleEmail: optionalEmail,
  responsiblePhone: optionalPhone,
  responsibleTaxNumberReplacement: optionalReplacementCpf,
  postalCode: z
    .string()
    .trim()
    .transform(normalizeInternalPostalCode)
    .refine(value => value.length === 8, 'Informe um CEP valido'),
  street: requiredText('Informe o endereco'),
  number: z
    .string()
    .trim()
    .min(1, 'Informe o numero')
    .max(20, 'Use ate 20 caracteres')
    .transform(value => value.replace(/\s+/g, ' ')),
  district: requiredText('Informe o bairro'),
  city: requiredText('Informe a cidade'),
  stateCode: z
    .string()
    .trim()
    .toUpperCase()
    .length(2, 'Informe a UF com 2 letras')
    .regex(/^[A-Z]{2}$/, 'Informe uma UF valida'),
  acquisitionSource: optionalText,
  salesOwner: optionalText,
  internalNotes: optionalLongText,
  reason: z
    .string()
    .trim()
    .min(8, 'Informe um motivo com pelo menos 8 caracteres')
    .max(240, 'Use ate 240 caracteres')
    .transform(value => value.replace(/\s+/g, ' ')),
  sensitiveConfirmation: z.boolean().default(false),
})

export type InternalStoreProfileEditValues = z.infer<
  typeof internalStoreProfileEditSchema
>

export type InternalStoreProfileAuditRecord = {
  label: string
  before: string | null
  after: string | null
}

export type InternalStoreProfileSnapshot = {
  storeName: string
  subdomain: string
  companyTaxNumber: string | null
  responsibleTaxNumber: string | null
  responsibleEmail: string | null
}

export const normalizeInternalProfileNullableText = (
  value: string | null | undefined
) => {
  const normalized = normalizeText(value)
  return normalized || null
}

export const normalizeInternalProfileNullableEmail = (
  value: string | null | undefined
) => {
  const normalized = normalizeInternalEmail(value)
  return normalized || null
}

export const hasSensitiveInternalStoreProfileChange = ({
  current,
  values,
}: {
  current: InternalStoreProfileSnapshot
  values: Pick<
    InternalStoreProfileEditValues,
    | 'storeName'
    | 'subdomain'
    | 'companyTaxNumberReplacement'
    | 'responsibleTaxNumberReplacement'
    | 'responsibleEmail'
  >
}) => {
  const nextCompanyTaxNumber =
    values.companyTaxNumberReplacement ||
    normalizeInternalCnpj(current.companyTaxNumber)
  const nextResponsibleTaxNumber =
    values.responsibleTaxNumberReplacement ||
    normalizeInternalCpf(current.responsibleTaxNumber)

  return (
    normalizeText(current.storeName) !== normalizeText(values.storeName) ||
    current.subdomain !== values.subdomain ||
    normalizeInternalCnpj(current.companyTaxNumber) !== nextCompanyTaxNumber ||
    normalizeInternalCpf(current.responsibleTaxNumber) !==
      nextResponsibleTaxNumber ||
    normalizeInternalEmail(current.responsibleEmail) !==
      normalizeInternalEmail(values.responsibleEmail)
  )
}

export const buildInternalStoreProfileChangeSummary = ({
  before,
  after,
}: {
  before: Record<string, string | null>
  after: Record<string, string | null>
}) => {
  const changedLabels = Object.entries(after)
    .filter(([field, value]) => before[field] !== value)
    .map(([field]) => field)

  return changedLabels.length > 0
    ? changedLabels.join(', ')
    : 'sem alteracoes cadastrais'
}

const formatNullableAuditValue = (value: string | null | undefined) =>
  normalizeInternalProfileNullableText(value) ?? 'nao informado'

const protectedAuditValueLabels = new Set([
  'Responsavel',
  'CEP',
  'Endereco',
  'Numero',
  'Bairro',
  'Observacoes internas',
])

const formatStoreProfileProtectedAuditValue = (
  record: Pick<InternalStoreProfileAuditRecord, 'label'> & {
    value: string | null
  }
) => {
  if (!protectedAuditValueLabels.has(record.label)) {
    return formatNullableAuditValue(record.value)
  }

  if (!normalizeInternalProfileNullableText(record.value)) {
    return 'nao informado'
  }

  if (record.label === 'Responsavel') return 'responsavel informado'
  if (record.label === 'Observacoes internas') {
    return 'observacao interna informada'
  }

  return 'endereco informado'
}

export const buildInternalStoreProfileAuditReason = ({
  records,
  reason,
}: {
  records: InternalStoreProfileAuditRecord[]
  reason: string
}) => {
  const changedLabels =
    records.length > 0
      ? records.map(record => record.label).join(', ')
      : 'sem alteracoes cadastrais'
  const diff = records
    .map(
      record =>
        `${record.label}: ${formatStoreProfileProtectedAuditValue({
          label: record.label,
          value: record.before,
        })} -> ${formatStoreProfileProtectedAuditValue({
          label: record.label,
          value: record.after,
        })}`
    )
    .join('; ')

  return `Campos alterados: ${changedLabels}. Motivo: ${reason}. Antes/depois: ${diff}`
}

export const getInternalStoreProfileEditFieldErrors = (payload: unknown) => {
  const result = internalStoreProfileEditSchema.safeParse(payload)
  if (result.success) return {}

  const errors: Partial<Record<keyof InternalStoreProfileEditValues, string>> =
    {}

  for (const issue of result.error.issues) {
    const field = issue.path[0] as keyof InternalStoreProfileEditValues
    if (field && !errors[field]) errors[field] = issue.message
  }

  return errors
}

export const normalizeProfileDigitsForComparison = (
  value: string | null | undefined
) => normalizeInternalDigits(value)
