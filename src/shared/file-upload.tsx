'use client'
import { FilesManagerRouterService } from '@/services/files-manager'
import { generateUploadButton } from '@uploadthing/react'

const BaseUploadButton = generateUploadButton<FilesManagerRouterService>({ url: '/api/files' })

type UploadButtonProps = Omit<Parameters<typeof BaseUploadButton>[0], 'content' | 'endpoint'>
export const UploadButton = ({ onClientUploadComplete }: UploadButtonProps) => {
  return (
    <BaseUploadButton
      content={{
        button: ({ ready, isUploading }) => {
          if (!ready) return 'Preparando...'
          if (isUploading) return 'Enviando...'
          return 'Enviar arquivo'
        },
        allowedContent: ({ ready, fileTypes, isUploading }) => {
          if (!ready) return 'Verificando tipos de arquivo permitidos...'
          if (isUploading) return 'Enviando arquivo...'
          return `Tipos de arquivo permitidos: ${fileTypes.join(', ')}`
        },
      }}
      endpoint="imageUploader"
      className="ut-button:w-fit ut-button:px-4"
      onClientUploadComplete={onClientUploadComplete}
      onUploadError={(error: Error) => {
        console.error(`ERROR! ${error.message}`)
      }}
    />
  )
}
