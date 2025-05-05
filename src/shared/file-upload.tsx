'use client'
import { FilesManagerRouterService } from '@/services/files-manager'
import { cn } from '@/shared/lib/utils'
import { generateReactHelpers, useDropzone } from '@uploadthing/react'
import { ImageOff, ImageUp, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { generateClientDropzoneAccept, generatePermittedFileTypes } from 'uploadthing/client'
import { ClientUploadedFileData, inferEndpointOutput } from 'uploadthing/types'
import { Button } from './button'
import { Progress } from './progress'
import { LargeText } from './typography/large-text'
import { SmallDescription } from './typography/small-description'

export const { useUploadThing } = generateReactHelpers<FilesManagerRouterService>({ url: '/api/files' })

export type UploadTarget = keyof FilesManagerRouterService
export type UploadedFile<Target extends UploadTarget = 'imageUploader'> = ClientUploadedFileData<
  inferEndpointOutput<FilesManagerRouterService[Target]>
>

interface SingleFileUploadedProps<Target extends UploadTarget> {
  target?: Target
  fileUrl?: string | null
  fileTag?: string
  onFileUploaded(file: UploadedFile<Target>): void
  onUploadError?(error: Error): void
  onFileDeleted?(): void
  onUploadBegin?(files?: File[]): void
  className?: string
  error?: string
}

export const SingleFileUploader = <Target extends UploadTarget = 'imageUploader'>({
  target = 'imageUploader' as Target,
  storeId,
  fileUrl,
  fileTag,
  onFileUploaded,
  onUploadError,
  onFileDeleted,
  onUploadBegin,
  className,
  error,
}: SingleFileUploadedProps<Target> & { storeId: number }) => {
  const [uploadProgress, setUploadProgress] = useState(0)
  const [isImageLoaded, setIsImageLoaded] = useState(false)

  const { startUpload, routeConfig, isUploading } = useUploadThing(target, {
    onBeforeUploadBegin: files => {
      onUploadBegin?.()
      return files
    },
    onUploadProgress: setUploadProgress,
    onUploadError,
    onClientUploadComplete: ([updatedFile]) => onFileUploaded(updatedFile),
  })

  const { getRootProps, getInputProps } = useDropzone({
    onDrop: files => {
      // @ts-ignore
      startUpload(files, { storeId, tag: fileTag })
    },
    accept: generateClientDropzoneAccept(generatePermittedFileTypes(routeConfig).fileTypes),
    multiple: false,
  })

  useEffect(() => {
    setIsImageLoaded(false)
  }, [fileUrl])

  const isDisplayPlaceholderLayout = !fileUrl || isUploading

  return (
    <div
      {...getRootProps()}
      className={cn(
        'flex flex-col items-center justify-center gap-4 m-2 border-dashed border border-gray-900/25 rounded-lg min-h-56 max-h-72 relative',
        className,
        { 'px-6 py-10': isDisplayPlaceholderLayout, 'group cursor-pointer': !isUploading }
      )}
    >
      {fileUrl && (
        <>
          <img
            src={fileUrl}
            alt="Arquivo"
            className={cn('w-full h-auto overflow-y-hidden max-h-[inherit] object-contain rounded-lg', {
              hidden: isUploading,
            })}
            onLoad={() => setIsImageLoaded(true)}
          />
          {error && (
            <span className="flex items-center justify-center gap-2 absolute bottom-2 right-1/2 translate-x-1/2 translate-y-1/2 text-destructive text-xs px-4 py-2 bg-white border border-destructive/10 rounded">
              <ImageOff size={16} /> {error}
            </span>
          )}
          {isImageLoaded && (
            <Button
              variant="destructive"
              size="icon"
              className={cn('absolute -top-2 -right-2', {
                hidden: isUploading,
              })}
              onClick={event => {
                event.preventDefault()
                event.stopPropagation()
                onFileDeleted?.()
              }}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </>
      )}
      {isDisplayPlaceholderLayout && (
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
          {error && (
            <span className="flex items-center justify-center gap-2 text-destructive text-xs">
              <ImageOff size={16} /> {error}
            </span>
          )}
        </>
      )}
      <input {...getInputProps()} disabled={isUploading} />
    </div>
  )
}
