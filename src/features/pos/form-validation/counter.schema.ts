import { z } from 'zod'

export const createCounterSchema = z.object({
  name: z
    .string()
    .nonempty('Nome do caixa é obrigatório')
    .min(3, 'Nome deve ter pelo menos 3 caracteres'),
})

export const updateCounterSchema = createCounterSchema.extend({
  id: z.number(),
})

export const openCounterSchema = z.object({
  counterId: z.number(),
  openAmount: z.string().nonempty('Valor de abertura é obrigatório'),
  openNotes: z.union([z.string(), z.null()]),
})

export const closeCounterSchema = z.object({
  counterId: z.number(),
  closeAmount: z.string().nonempty('Valor de fechamento é obrigatório'),
  closeNotes: z.union([z.string(), z.null()]),
})
