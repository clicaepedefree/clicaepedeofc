import { fileSchema } from '@/features/store/form-validation/file-schema'
import { z } from 'zod'

export const baseCategorySchema = z.object({
  id: z.number(),
  name: z.string(),
})

export const itemOfferingSchema = z.object({
  category: baseCategorySchema,
  price: z.string().nonempty('Preço é obrigatório'),
  originalPrice: z.union([z.string().nonempty('Preço original é obrigatório'), z.null()]),
  index: z.number().nullable(),
})

export const itemOfferingSchemaWithIndex = itemOfferingSchema.extend({ index: z.number() })

export const createItemSchema = z.object({
  name: z.string().nonempty('Nome do produto é obrigatório').min(3, 'Nome do produto deve ter pelo menos 3 caracteres'),
  description: z.union([z.string(), z.null()]),
  isAvailable: z.boolean(),
  image: z.union([fileSchema, z.null()]),
  offerings: z.array(itemOfferingSchema).nonempty('É necessário adicionar o preço para pelo menos uma categoria'),
})

export const updateItemSchema = createItemSchema.extend({
  id: z.number(),
  offerings: z
    .array(itemOfferingSchemaWithIndex)
    .nonempty('É necessário adicionar o preço para pelo menos uma categoria'),
})
