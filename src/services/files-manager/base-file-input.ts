import { z } from 'zod'

export const baseFileInputForUpload = z.object({
  storeId: z.number(),
})
