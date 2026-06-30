import { z } from 'zod'

export const digitalMenuPaymentMethodIds = [
  'CASH',
  'PIX',
  'CREDIT',
  'DEBIT',
  'MEAL_VOUCHER',
  'FOOD_VOUCHER',
  'ONLINE',
] as const

export const normalizeStoreSlug = (value: string) => {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

export const sanitizePublicText = (value: string | undefined, max = 160) => {
  if (!value) return ''

  return value.replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, max)
}

export const normalizePhone = (value: string) => {
  return value.replace(/\D/g, '').slice(0, 13)
}

export const normalizeCpf = (value: string) => value.replace(/\D/g, '').slice(0, 11)

export const isValidCpf = (value: string) => {
  const cpf = normalizeCpf(value)
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false

  const calculateDigit = (length: number) => {
    const sum = cpf
      .slice(0, length)
      .split('')
      .reduce((total, digit, index) => total + Number(digit) * (length + 1 - index), 0)
    const remainder = (sum * 10) % 11
    return remainder === 10 ? 0 : remainder
  }

  return calculateDigit(9) === Number(cpf[9]) && calculateDigit(10) === Number(cpf[10])
}

const cartOptionSchema = z.object({
  optionId: z.coerce.number().int().positive(),
  quantity: z.coerce.number().int().min(1).max(99),
})

const cartItemSchema = z.object({
  itemOfferingId: z.coerce.number().int().positive(),
  quantity: z.coerce.number().int().min(1).max(99),
  comment: z.string().max(240).optional(),
  options: z.array(cartOptionSchema).max(80).default([]),
})

export const submitDigitalMenuOrderSchema = z
  .object({
    storeSlug: z.string().min(1).max(80).transform(normalizeStoreSlug),
    idempotencyKey: z.string().min(12).max(120),
    customerName: z
      .string()
      .max(120)
      .transform(value => sanitizePublicText(value, 120))
      .refine(value => value.length >= 2, 'Informe seu nome completo.'),
    customerPhone: z
      .string()
      .min(8)
      .max(30)
      .transform(normalizePhone)
      .refine(value => value.length >= 10, 'Informe um telefone valido.'),
    customerDocument: z
      .string()
      .max(20)
      .transform(normalizeCpf)
      .refine(value => !value || isValidCpf(value), 'Informe um CPF valido.')
      .optional(),
    orderNotes: z
      .string()
      .max(500)
      .transform(value => sanitizePublicText(value, 500))
      .optional(),
    termsAccepted: z.literal(true),
    orderType: z.enum(['DELIVERY', 'TAKEOUT']),
    scheduledFor: z.string().datetime().optional(),
    address: z
      .object({
        postalCode: z.string().max(16).transform(value => sanitizePublicText(value, 16)).optional(),
        street: z.string().max(160).transform(value => sanitizePublicText(value, 160)).optional(),
        number: z.string().max(30).transform(value => sanitizePublicText(value, 30)).optional(),
        neighborhood: z.string().max(120).transform(value => sanitizePublicText(value, 120)).optional(),
        complement: z.string().max(120).transform(value => sanitizePublicText(value, 120)).optional(),
        reference: z.string().max(180).transform(value => sanitizePublicText(value, 180)).optional(),
        latitude: z.coerce.number().min(-90).max(90).optional(),
        longitude: z.coerce.number().min(-180).max(180).optional(),
      })
      .optional(),
    payment: z.object({
      method: z.enum(digitalMenuPaymentMethodIds),
      changeFor: z.string().max(40).optional(),
      needsChange: z.boolean().optional(),
    }),
    items: z.array(cartItemSchema).min(1).max(80),
  })
  .superRefine((value, ctx) => {
    if (value.orderType === 'DELIVERY') {
      const postalCode = sanitizePublicText(value.address?.postalCode, 16)
      const street = sanitizePublicText(value.address?.street, 160)
      const number = sanitizePublicText(value.address?.number, 30)
      const neighborhood = sanitizePublicText(value.address?.neighborhood, 120)

      for (const [field, fieldValue, message] of [
        ['postalCode', postalCode, 'Informe o CEP para entrega.'],
        ['street', street, 'Informe a rua para entrega.'],
        ['number', number, 'Informe o numero do endereco.'],
        ['neighborhood', neighborhood, 'Informe o bairro para entrega.'],
      ] as const) {
        if (fieldValue) continue
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['address', field],
          message,
        })
      }

      if (postalCode.replace(/\D/g, '').length !== 8) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['address', 'postalCode'],
          message: 'Informe um CEP com 8 numeros.',
        })
      }
    }

    if (
      value.payment.method === 'CASH' &&
      value.payment.needsChange &&
      !sanitizePublicText(value.payment.changeFor, 40)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['payment', 'changeFor'],
        message: 'Informe o valor para o troco.',
      })
    }
  })

export type SubmitDigitalMenuOrderSchema = z.infer<
  typeof submitDigitalMenuOrderSchema
>
