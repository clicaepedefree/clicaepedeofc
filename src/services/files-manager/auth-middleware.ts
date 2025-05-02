import { currentUser } from '@clerk/nextjs/server'
import { UploadThingError } from 'uploadthing/server'
import { baseFileInputForUpload } from './base-file-input'
import { z } from 'zod'

export const fileAuthMiddleware = async ({ input }: { input: z.infer<typeof baseFileInputForUpload> }) => {
  const user = await currentUser()

  if (!user) throw new UploadThingError('Unauthorized')

  return { userId: user.id, storeId: input.storeId }
}
