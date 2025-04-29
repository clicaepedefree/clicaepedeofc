'use client'
import { FilesManagerRouterService } from '@/services/files-manager'
import { generateReactHelpers, useDropzone } from '@uploadthing/react'
import { generateClientDropzoneAccept, generatePermittedFileTypes } from 'uploadthing/client'
import { cn } from '@/lib/utils'
import { useEffect, useState } from 'react'
import { ClientUploadedFileData, inferEndpointOutput } from 'uploadthing/types'
import { LargeText } from './typography/large-text'
import { SmallDescription } from './typography/small-description'
import { Button } from './button'
import { ImageUp, Trash2 } from 'lucide-react'
import { Progress } from './progress'

export const { useUploadThing } = generateReactHelpers<FilesManagerRouterService>({ url: '/api/files' })

export type UploadTarget = keyof FilesManagerRouterService
export type UploadedFile<Target extends UploadTarget = 'imageUploader'> = ClientUploadedFileData<
  inferEndpointOutput<FilesManagerRouterService[Target]>
>

interface SingleFileUploadedProps<Target extends UploadTarget> {
  target?: Target
  fileUrl?: string | null
  onFileUploaded(file: UploadedFile<Target>): void
  onFileDeleted?(): void
  className?: string
}

export const SingleFileUploader = <Target extends UploadTarget = 'imageUploader'>({
  target = 'imageUploader' as Target,
  fileUrl,
  onFileUploaded,
  onFileDeleted,
  className,
}: SingleFileUploadedProps<Target>) => {
  const [uploadProgress, setUploadProgress] = useState(0)
  const [isImageLoaded, setIsImageLoaded] = useState(false)

  const { startUpload, routeConfig, isUploading } = useUploadThing(target, {
    onClientUploadComplete: files => {
      const [uploadedFile] = files
      onFileUploaded(uploadedFile)
    },
    onUploadError: error => {
      console.log('error occurred while uploading', error)
    },
    onUploadBegin: file => {
      console.log('upload has begun', file)
    },
    onUploadProgress: progress => {
      console.log('upload progress', progress)
      setUploadProgress(progress)
    },
  })

  const { getRootProps, getInputProps } = useDropzone({
    // @ts-ignore
    onDrop: startUpload,
    accept: generateClientDropzoneAccept(generatePermittedFileTypes(routeConfig).fileTypes),
    multiple: false,
  })

  useEffect(() => {
    setIsImageLoaded(false)
  }, [fileUrl])

  return (
    <div
      {...getRootProps()}
      className={cn(
        'flex flex-col items-center justify-center gap-4 m-2 border-dashed border border-gray-900/25 rounded-lg min-h-56 max-h-72',
        className,
        { 'px-6 py-10': !fileUrl, 'group cursor-pointer': !isUploading }
      )}
    >
      <input {...getInputProps()} disabled={isUploading} />
      {fileUrl && (
        <div className="relative">
          <img
            src={fileUrl}
            alt="Arquivo"
            className="w-full h-auto object-contain rounded-lg"
            onLoad={() => setIsImageLoaded(true)}
          />
          {isImageLoaded && (
            <Button
              variant="destructive"
              size="icon"
              className="absolute -top-2 -right-2"
              onClick={event => {
                event.preventDefault()
                event.stopPropagation()
                onFileDeleted?.()
              }}
            >
              <Trash2 />
            </Button>
          )}
        </div>
      )}
      {!fileUrl && (
        <>
          <ImageUp size={32} className="transition-all group-hover:text-primary/80 group-hover:scale-105" />
          <div className="flex flex-col items-center mt-2">
            <LargeText variant="sm" hoverBehavior="clickable" className="transition-colors group-hover:opacity-90">
              Adicione ou arraste uma foto para cá!
            </LargeText>
            <SmallDescription>Tamanho máximo: 4MB</SmallDescription>
          </div>
          {!isUploading && (
            <Button variant="secondary" isClickable className="group-hover:scale-105">
              Adicionar arquivo
            </Button>
          )}
          {isUploading && <Progress value={uploadProgress} />}
        </>
      )}
    </div>
  )
}
