import { currentUser } from '@clerk/nextjs/server'
import { UploadThingError } from 'uploadthing/server'

export const fileAuthMiddleware = async () => {
  const user = await currentUser()

  if (!user) throw new UploadThingError('Unauthorized')

  return { userId: user.id }
}
