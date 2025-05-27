import { z } from 'zod'

export const createCounterSchema = z.object({
  name: z.string().nonempty('Nome do balcão é obrigatório').min(3, 'Nome deve ter pelo menos 3 caracteres'),
  isAvailable: z.boolean(),
})

export const updateCounterSchema = createCounterSchema.extend({ id: z.number() })
