import { createUploadthing, UTFiles, type FileRouter } from 'uploadthing/next'
import { fileAuthMiddleware } from './auth-middleware'
import { baseFileInputForUpload } from './base-file-input'

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
    .onUploadComplete(async ({ metadata, file }) => {
      return { uploadedBy: metadata.userId, url: file.ufsUrl }
    }),
} satisfies FileRouter

export type FilesManagerRouterService = typeof filesManagerRouterService
export type FilesManagerSupportedEndpoints = keyof typeof filesManagerRouterService
