import {
  normalizeStoreSubdomain,
  reservedStoreSubdomains,
} from '@/features/store/form-validation/onboarding-store-schema'
import { z } from 'zod'

export const internalStoreCreationSteps = [
  'responsible',
  'establishment',
  'billing',
  'modules',
  'review',
] as const

export type InternalStoreCreationStep =
  (typeof internalStoreCreationSteps)[number]

const subdomainRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const optionalText = z
  .string()
  .trim()
  .transform(value => value.replace(/\s+/g, ' '))
  .optional()
  .or(z.literal(''))
const moneyRegex = /^\d+(?:[,.]\d{1,2})?$/
const parseDecimalNumber = (value: string) =>
  Number(value.trim().replace(',', '.'))

export const normalizeInternalDigits = (value: string | null | undefined) =>
  (value ?? '').replace(/\D/g, '')

export const normalizeInternalPhone = (value: string | null | undefined) =>
  normalizeInternalDigits(value)

export const normalizeInternalCpf = (value: string | null | undefined) =>
  normalizeInternalDigits(value)

export const normalizeInternalCnpj = (value: string | null | undefined) =>
  normalizeInternalDigits(value)

export const normalizeInternalEmail = (value: string | null | undefined) =>
  (value ?? '').trim().toLowerCase()

export const normalizeInternalPostalCode = (value: string | null | undefined) =>
  normalizeInternalDigits(value)

const normalizedRequiredText = (message: string) =>
  z
    .string()
    .trim()
    .transform(value => value.replace(/\s+/g, ' '))
    .refine(value => value.length >= 2, message)

export const isValidInternalCpf = (value: string | null | undefined) => {
  const cpf = normalizeInternalCpf(value)
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false

  const calculateDigit = (length: number) => {
    const sum = cpf
      .slice(0, length)
      .split('')
      .reduce(
        (total, digit, index) => total + Number(digit) * (length + 1 - index),
        0
      )
    const remainder = (sum * 10) % 11
    return remainder === 10 ? 0 : remainder
  }

  return (
    calculateDigit(9) === Number(cpf[9]) &&
    calculateDigit(10) === Number(cpf[10])
  )
}

export const isValidInternalCnpj = (value: string | null | undefined) => {
  const cnpj = normalizeInternalCnpj(value)
  if (cnpj.length !== 14 || /^(\d)\1{13}$/.test(cnpj)) return false

  const calculateDigit = (length: number) => {
    const weights =
      length === 12
        ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
        : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
    const sum = cnpj
      .slice(0, length)
      .split('')
      .reduce(
        (total, digit, index) => total + Number(digit) * weights[index],
        0
      )
    const remainder = sum % 11
    return remainder < 2 ? 0 : 11 - remainder
  }

  return (
    calculateDigit(12) === Number(cnpj[12]) &&
    calculateDigit(13) === Number(cnpj[13])
  )
}

const normalizedOptionalCpf = z
  .string()
  .trim()
  .transform(normalizeInternalCpf)
  .refine(value => !value || isValidInternalCpf(value), 'Informe um CPF valido')
  .optional()
  .or(z.literal(''))

const normalizedOptionalCnpj = z
  .string()
  .trim()
  .transform(normalizeInternalCnpj)
  .refine(
    value => !value || isValidInternalCnpj(value),
    'Informe um CNPJ valido'
  )
  .optional()
  .or(z.literal(''))

const normalizedOptionalPhone = z
  .string()
  .trim()
  .transform(normalizeInternalPhone)
  .refine(
    value => !value || (value.length >= 10 && value.length <= 11),
    'Informe um telefone valido'
  )
  .optional()
  .or(z.literal(''))

export const internalStoreCreationSchema = z
  .object({
    responsibleName: z
      .string()
      .trim()
      .min(2, 'Informe o nome do responsavel')
      .max(120, 'Use ate 120 caracteres'),
    responsibleEmail: z
      .string()
      .trim()
      .toLowerCase()
      .email('Informe um e-mail valido do responsavel'),
    responsiblePhone: normalizedOptionalPhone,
    responsibleTaxNumber: normalizedOptionalCpf,
    storeName: z
      .string()
      .trim()
      .min(2, 'Informe o nome da loja')
      .max(80, 'Use ate 80 caracteres'),
    subdomain: z
      .string()
      .trim()
      .toLowerCase()
      .min(3, 'Use pelo menos 3 caracteres')
      .max(40, 'Use ate 40 caracteres')
      .regex(
        subdomainRegex,
        'Use apenas letras, numeros e hifens, sem hifen no inicio ou fim'
      )
      .refine(
        subdomain => !reservedStoreSubdomains.has(subdomain),
        'Esse endereco e reservado. Tente outro nome.'
      ),
    companyTaxNumber: normalizedOptionalCnpj,
    companyName: optionalText,
    phone1: normalizedOptionalPhone,
    companyEmail: z
      .string()
      .trim()
      .toLowerCase()
      .email('Informe um e-mail valido da loja')
      .optional()
      .or(z.literal('')),
    postalCode: z
      .string()
      .trim()
      .transform(normalizeInternalPostalCode)
      .refine(value => value.length === 8, 'Informe um CEP valido'),
    street: normalizedRequiredText('Informe o endereco'),
    number: z
      .string()
      .trim()
      .transform(value => value.replace(/\s+/g, ' '))
      .refine(value => value.length >= 1, 'Informe o numero'),
    district: normalizedRequiredText('Informe o bairro'),
    city: normalizedRequiredText('Informe a cidade'),
    stateCode: z
      .string()
      .trim()
      .toUpperCase()
      .length(2, 'Informe a UF com 2 letras')
      .regex(/^[A-Z]{2}$/, 'Informe uma UF valida'),
    planId: z.number().int('Selecione um plano').positive('Selecione um plano'),
    contractedAmount: z
      .string()
      .trim()
      .regex(moneyRegex, 'Informe um valor valido')
      .refine(
        amount => parseDecimalNumber(amount) > 0,
        'Informe um valor maior que zero'
      ),
    discountType: z.enum(['none', 'fixed_amount', 'percentage']),
    discountValue: z.string().trim().optional().or(z.literal('')),
    selectedModuleIds: z.array(z.number().int().positive()).default([]),
    duplicateOverrideConfirmed: z.boolean().default(false),
    duplicateReviewToken: z.string().trim().optional().or(z.literal('')),
    provisioningIdempotencyKey: z
      .string()
      .trim()
      .min(12, 'Recarregue a pagina antes de tentar novamente')
      .max(120, 'Recarregue a pagina antes de tentar novamente'),
    reason: z
      .string()
      .trim()
      .min(8, 'Informe um motivo com pelo menos 8 caracteres')
      .max(240, 'Use ate 240 caracteres'),
  })
  .superRefine((values, context) => {
    if (values.discountType !== 'none') {
      if (!values.discountValue || !moneyRegex.test(values.discountValue)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['discountValue'],
          message: 'Informe o desconto contratado',
        })
        return
      }

      if (
        values.discountType === 'percentage' &&
        parseDecimalNumber(values.discountValue) > 100
      ) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['discountValue'],
          message: 'Informe um percentual ate 100',
        })
      }
    }
  })

export type InternalStoreCreationValues = z.infer<
  typeof internalStoreCreationSchema
>

export type InternalStoreCreationField = keyof InternalStoreCreationValues

export const internalStoreCreationStepFields: Record<
  InternalStoreCreationStep,
  InternalStoreCreationField[]
> = {
  responsible: [
    'responsibleName',
    'responsibleEmail',
    'responsiblePhone',
    'responsibleTaxNumber',
  ],
  establishment: [
    'storeName',
    'subdomain',
    'companyTaxNumber',
    'companyName',
    'phone1',
    'companyEmail',
    'postalCode',
    'street',
    'number',
    'district',
    'city',
    'stateCode',
  ],
  billing: ['planId', 'contractedAmount', 'discountType', 'discountValue'],
  modules: ['selectedModuleIds'],
  review: ['reason'],
}

export const internalStoreCreationInitialValues: InternalStoreCreationValues = {
  responsibleName: '',
  responsibleEmail: '',
  responsiblePhone: '',
  responsibleTaxNumber: '',
  storeName: '',
  subdomain: '',
  companyTaxNumber: '',
  companyName: '',
  phone1: '',
  companyEmail: '',
  postalCode: '',
  street: '',
  number: '',
  district: '',
  city: '',
  stateCode: '',
  planId: 0,
  contractedAmount: '',
  discountType: 'none',
  discountValue: '',
  selectedModuleIds: [],
  duplicateOverrideConfirmed: false,
  duplicateReviewToken: '',
  provisioningIdempotencyKey: '',
  reason: '',
}

export const buildSubdomainFromStoreName = (storeName: string) =>
  normalizeStoreSubdomain(storeName)

export const normalizeCurrencyAmount = (amount: string) => {
  const normalized = amount.trim().replace(',', '.')
  const [integerPart, decimalPart = ''] = normalized.split('.')
  const cents = decimalPart.padEnd(2, '0').slice(0, 2)

  return `${Number(integerPart)}.${cents}00`
}

export const getInternalStoreCreationFieldErrors = (
  values: InternalStoreCreationValues
) => {
  const result = internalStoreCreationSchema.safeParse(values)

  if (result.success) return {}

  const errors: Partial<Record<InternalStoreCreationField | 'root', string>> =
    {}

  for (const issue of result.error.issues) {
    const field = issue.path[0] as InternalStoreCreationField | undefined
    if (field && !errors[field]) {
      errors[field] = issue.message
    }
  }

  return errors
}

export const getInternalStoreCreationStepErrors = ({
  step,
  values,
}: {
  step: InternalStoreCreationStep
  values: InternalStoreCreationValues
}) => {
  const errors = getInternalStoreCreationFieldErrors(values)
  const fields = new Set(internalStoreCreationStepFields[step])

  return Object.fromEntries(
    Object.entries(errors).filter(([field]) =>
      fields.has(field as InternalStoreCreationField)
    )
  ) as Partial<Record<InternalStoreCreationField, string>>
}

export const isInternalStoreCreationStepValid = ({
  step,
  values,
}: {
  step: InternalStoreCreationStep
  values: InternalStoreCreationValues
}) =>
  Object.keys(getInternalStoreCreationStepErrors({ step, values })).length === 0
