import { addStoreFile } from '@/features/store/api'
import { fileAuthMiddleware } from '@/services/files-manager/auth-middleware'
import { baseFileInputForUpload } from '@/services/files-manager/base-file-input'
import { createUploadthing, type FileRouter } from 'uploadthing/next'

const f = createUploadthing({
  errorFormatter: error => {
    const errorMessage = error.message.includes('FileSizeMismatch')
      ? 'Arquivo muito grande'
      : 'Erro ao fazer upload to arquivo'
    return {
      message: errorMessage,
    }
  },
})

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
        tag: metadata.tag,
      })
      return createdFile
    }),
} satisfies FileRouter

export type FilesManagerRouterService = typeof filesManagerRouterService
export type FilesManagerSupportedEndpoints = keyof typeof filesManagerRouterService
