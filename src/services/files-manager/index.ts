import { createUploadthing, type FileRouter } from 'uploadthing/next'
import { DeepPartial, ExpandedRouteConfig, FileRouterInputKey } from '@uploadthing/shared'
import { UploadThingError } from 'uploadthing/server'

const f = createUploadthing()

const endpointsToTypesConfigs: Record<string, DeepPartial<ExpandedRouteConfig>> = {
  imageUploader: {
    image: {
      maxFileSize: '4MB',
      maxFileCount: 1,
    },
  },
  second: {
    image: {
      maxFileSize: '4MB',
      maxFileCount: 1,
    },
  },
}

// FileRouter for your app, can contain multiple FileRoutes
export const filesManagerRouterService = {
  // Define as many FileRoutes as you like, each with a unique routeSlug
  imageUploader: f(endpointsToTypesConfigs.imageUploader)
    // Set permissions and file types for this FileRoute
    .middleware(async ({ req }) => {
      // This code runs on your server before upload
      const auth = async (req: Request) => ({ id: 'fakeId' }) // Fake auth function
      const user = await auth(req)

      // If you throw, the user will not be able to upload
      if (!user) throw new UploadThingError('Unauthorized')

      // Whatever is returned here is accessible in onUploadComplete as `metadata`
      return { userId: user.id }
    })
    .onUploadComplete(async ({ metadata, file }) => {
      // This code RUNS ON YOUR SERVER after upload
      console.log('Upload complete for userId:', metadata.userId)

      console.log('file url', file.ufsUrl)

      // !!! Whatever is returned here is sent to the clientside `onClientUploadComplete` callback
      return { uploadedBy: metadata.userId, url: file.ufsUrl }
    }),
  second: f(endpointsToTypesConfigs.second)
    // Set permissions and file types for this FileRoute
    .middleware(async ({ req }) => {
      // This code runs on your server before upload
      const auth = async (req: Request) => ({ id: 'fakeId' }) // Fake auth function
      const user = await auth(req)

      // If you throw, the user will not be able to upload
      if (!user) throw new UploadThingError('Unauthorized')

      // Whatever is returned here is accessible in onUploadComplete as `metadata`
      return { userId: user.id }
    })
    .onUploadComplete(async ({ metadata, file }) => {
      // This code RUNS ON YOUR SERVER after upload
      console.log('Upload complete for userId:', metadata.userId)

      console.log('file url', file.ufsUrl)

      // !!! Whatever is returned here is sent to the clientside `onClientUploadComplete` callback
      return { uploadedBy: metadata.userId, url: file.ufsUrl }
    }),
} satisfies FileRouter

export type FilesManagerRouterService = typeof filesManagerRouterService
export type FilesManagerSupportedEndpoints = keyof typeof filesManagerRouterService

export const getMaxFileSizeForType = (endpoint: FilesManagerSupportedEndpoints, type: string) => {
  const endpointConfig = endpointsToTypesConfigs[endpoint]
  const fileTypeConfig = endpointConfig[type as FileRouterInputKey]
  return fileTypeConfig!.maxFileSize
}
