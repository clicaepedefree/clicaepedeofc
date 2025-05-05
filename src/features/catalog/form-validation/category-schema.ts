import { fileSchema } from '@/features/store/form-validation/file-schema'
import { z } from 'zod'

export const createCategorySchema = z.object({
  name: z
    .string()
    .nonempty('Nome da categoria é obrigatório')
    .min(3, 'Nome da categoria deve ter pelo menos 3 caracteres'),
  description: z.union([z.string(), z.null()]),
  isAvailable: z.boolean(),
  image: z.union([fileSchema, z.null()]),
})

export const updateCategorySchema = createCategorySchema.extend({ id: z.number() })
