import { baseFileInputForUpload } from '@/services/files-manager/base-file-input'
import { UploadThingError } from 'uploadthing/server'
import { z } from 'zod'
import { AuthenticatedUser, getAuthenticatedUser } from '../auth'

export const fileAuthMiddleware = async ({ input }: { input: z.infer<typeof baseFileInputForUpload> }) => {
  let user: AuthenticatedUser | null = null
  try {
    user = await getAuthenticatedUser()
  } catch (error) {
    console.error('File service auth error', error)
  }

  if (!user) throw new UploadThingError('Unauthorized')

  return { userId: user.id, storeId: input.storeId, tag: input.tag }
}
