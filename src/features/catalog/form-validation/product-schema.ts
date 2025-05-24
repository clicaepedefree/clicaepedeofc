import { fileSchema } from '@/features/store/form-validation/file-schema'
import { z } from 'zod'

export const baseCategorySchema = z.object({
  id: z.number(),
  name: z.string(),
})

export const productCategorySchema = z.object({
  category: baseCategorySchema,
  price: z.string().nonempty('Preço é obrigatório'),
  originalPrice: z.union([z.string().nonempty('Preço original é obrigatório'), z.null()]),
  index: z.number().nullable(),
})

export const productCategorySchemaWithIndex = productCategorySchema.extend({ index: z.number() })

export const createProductSchema = z.object({
  name: z.string().nonempty('Nome do produto é obrigatório').min(3, 'Nome do produto deve ter pelo menos 3 caracteres'),
  description: z.union([z.string(), z.null()]),
  isAvailable: z.boolean(),
  image: z.union([fileSchema, z.null()]),
  categories: z.array(productCategorySchema).nonempty('É necessário adicionar o preço para pelo menos uma categoria'),
})

export const updateProductSchema = createProductSchema.extend({
  id: z.number(),
  categories: z
    .array(productCategorySchemaWithIndex)
    .nonempty('É necessário adicionar o preço para pelo menos uma categoria'),
})
