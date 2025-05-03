import { createUploadthing, type FileRouter } from 'uploadthing/next'
import { fileAuthMiddleware } from './auth-middleware'
import { baseFileInputForUpload } from './base-file-input'
import { addStoreFile } from '@/features/store/api'

const f = createUploadthing()

export const filesManagerRouterService = {
  imageUploader: f({
    image: {
      maxFileSize: '4MB',
      maxFileCount: 1,
    },
  })
    .input(baseFileInputForUpload)
    .middleware(({ input }) => fileAuthMiddleware({ input }))
    .onUploadComplete(async ({ metadata, file: uploadedFile }) => {
      const createdFile = await addStoreFile({
        storeId: metadata.storeId,
        creatorId: metadata.userId,
        provider: 'uploadthing',
        type: uploadedFile.type,
        url: uploadedFile.ufsUrl,
      })
      return createdFile
    }),
} satisfies FileRouter

export type FilesManagerRouterService = typeof filesManagerRouterService
export type FilesManagerSupportedEndpoints = keyof typeof filesManagerRouterService
