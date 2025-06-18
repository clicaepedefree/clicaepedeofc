import { baseFileInputForUpload } from '@/services/files-manager/base-file-input'
import { UploadThingError } from 'uploadthing/server'
import { z } from 'zod'
import { getAuthenticatedUser } from '../auth'

export const fileAuthMiddleware = async ({ input }: { input: z.infer<typeof baseFileInputForUpload> }) => {
  const user = await getAuthenticatedUser()

  if (!user) throw new UploadThingError('Unauthorized')

  return { userId: user.id, storeId: input.storeId, tag: input.tag }
}
