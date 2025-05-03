import { z } from 'zod'

export const fileSchema = z.object({
  id: z.number(),
  url: z.string(),
})
