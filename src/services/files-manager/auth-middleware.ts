import { baseFileInputForUpload } from '@/services/files-manager/base-file-input'
import { currentUser } from '@clerk/nextjs/server'
import { UploadThingError } from 'uploadthing/server'
import { z } from 'zod'

export const fileAuthMiddleware = async ({ input }: { input: z.infer<typeof baseFileInputForUpload> }) => {
  const user = await currentUser()

  if (!user) throw new UploadThingError('Unauthorized')

  return { userId: user.id, storeId: input.storeId, tag: input.tag }
}
