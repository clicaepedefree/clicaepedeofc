import { z } from 'zod'

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
    customerName: z.string().min(2).max(120).transform(value => sanitizePublicText(value, 120)),
    customerPhone: z
      .string()
      .min(8)
      .max(30)
      .transform(normalizePhone)
      .refine(value => value.length >= 10, 'Informe um telefone valido.'),
    orderType: z.enum(['DELIVERY', 'TAKEOUT']),
    address: z
      .object({
        postalCode: z.string().max(16).optional(),
        street: z.string().max(160).optional(),
        number: z.string().max(30).optional(),
        neighborhood: z.string().max(120).optional(),
        reference: z.string().max(180).optional(),
        latitude: z.coerce.number().min(-90).max(90).optional(),
        longitude: z.coerce.number().min(-180).max(180).optional(),
      })
      .optional(),
    payment: z.object({
      method: z.enum(['CASH', 'PIX']),
      changeFor: z.string().max(40).optional(),
    }),
    items: z.array(cartItemSchema).min(1).max(80),
  })
  .superRefine((value, ctx) => {
    if (value.orderType === 'DELIVERY') {
      const street = sanitizePublicText(value.address?.street, 160)
      const number = sanitizePublicText(value.address?.number, 30)
      const neighborhood = sanitizePublicText(value.address?.neighborhood, 120)

      if (!street || !number || !neighborhood) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['address'],
          message: 'Informe rua, numero e bairro para entrega.',
        })
      }
    }
  })

export type SubmitDigitalMenuOrderSchema = z.infer<
  typeof submitDigitalMenuOrderSchema
>
