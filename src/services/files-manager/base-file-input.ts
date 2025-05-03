import { z } from 'zod'

export const baseFileInputForUpload = z.object({
  storeId: z.number(),
  tag: z.union([z.string(), z.undefined()]),
})
