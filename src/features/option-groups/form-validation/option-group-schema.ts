import { z } from 'zod'

export const optionSchema = z.object({
  id: z.number().optional(),
  itemId: z.number({ required_error: 'Selecione um item' }),
  itemName: z.string().optional(),
  price: z.string().default('0'),
  originalPrice: z.union([z.string(), z.null()]).default(null),
  minQuantity: z.number().min(0).default(0),
  maxQuantity: z.number().min(1).default(1),
  index: z.number(),
})

export const createOptionGroupSchema = z
  .object({
    name: z
      .string()
      .nonempty('Nome do grupo é obrigatório')
      .min(3, 'Nome do grupo deve ter pelo menos 3 caracteres'),
    minQuantity: z.number().min(0, 'Quantidade mínima não pode ser negativa').default(0),
    maxQuantity: z.number().min(1, 'Quantidade máxima deve ser pelo menos 1').default(1),
    options: z
      .array(optionSchema)
      .nonempty('É necessário adicionar pelo menos uma opção'),
  })
  .refine((data) => data.maxQuantity >= data.minQuantity, {
    message: 'Quantidade máxima deve ser maior ou igual à mínima',
    path: ['maxQuantity'],
  })

export const updateOptionGroupSchema = createOptionGroupSchema.and(
  z.object({ id: z.number() })
)
