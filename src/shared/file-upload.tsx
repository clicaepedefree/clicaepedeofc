'use client'
import { Button } from '@/shared/button'
import { ImageCropperModal } from '@/shared/image-cropper-modal'
import { cn } from '@/shared/lib/utils'
import { Progress } from '@/shared/progress'
import { LargeText } from '@/shared/typography/large-text'
import { SmallDescription } from '@/shared/typography/small-description'
import { ImageOff, ImageUp, Trash2 } from 'lucide-react'
import Image from 'next/image'
import { useCallback, useEffect, useRef, useState } from 'react'

export type UploadTarget = 'imageUploader'
export type UploadedFile = {
  serverData: {
    id: number
    url: string
  }
}

interface SingleFileUploadedProps {
  target?: UploadTarget
  fileUrl?: string | null
  fileTag?: string
  onFileUploaded(file: UploadedFile): void
  onUploadError?(error: Error): void
  onFileDeleted?(): void
  onUploadBegin?(files?: File[]): void
  className?: string
  error?: string
  enableCropper?: boolean
  cropperAspectRatio?: number
}

export const SingleFileUploader = ({
  storeId,
  fileUrl,
  fileTag,
  onFileUploaded,
  onUploadError,
  onFileDeleted,
  onUploadBegin,
  className,
  error,
  enableCropper = false,
  cropperAspectRatio = 1,
}: SingleFileUploadedProps & { storeId: number }) => {
  const [uploadProgress, setUploadProgress] = useState(0)
  const [isUploading, setIsUploading] = useState(false)
  const [isImageLoaded, setIsImageLoaded] = useState(false)
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [isCropperOpen, setIsCropperOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const uploadFile = useCallback(
    async (file: File) => {
      onUploadBegin?.([file])
      setUploadProgress(15)
      setIsUploading(true)

      try {
        const formData = new FormData()
        formData.append('file', file)
        formData.append('storeId', String(storeId))
        if (fileTag) {
          formData.append('tag', fileTag)
        }

        setUploadProgress(45)
        const response = await fetch('/api/files', {
          method: 'POST',
          body: formData,
        })
        const payload = await response.json()

        if (!response.ok) {
          throw new Error(payload.error ?? 'Erro ao fazer upload do arquivo')
        }

        if (!payload.serverData?.id || !payload.serverData?.url) {
          throw new Error('Upload concluido, mas os dados do servidor estao ausentes')
        }

        setUploadProgress(100)
        onFileUploaded(payload)
      } catch (caughtError) {
        onUploadError?.(
          caughtError instanceof Error
            ? caughtError
            : new Error('Erro ao fazer upload do arquivo')
        )
      } finally {
        setIsUploading(false)
        setUploadProgress(0)
        if (inputRef.current) {
          inputRef.current.value = ''
        }
      }
    },
    [fileTag, onFileUploaded, onUploadBegin, onUploadError, storeId]
  )

  const handleFilesSelected = (files: File[]) => {
    if (files.length === 0 || isUploading) return

    const file = files[0]
    if (!file.type.startsWith('image/')) {
      onUploadError?.(new Error('Formato de imagem nao suportado'))
      return
    }

    if (enableCropper) {
      setPendingFile(file)
      setIsCropperOpen(true)
      return
    }

    void uploadFile(file)
  }

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    handleFilesSelected(Array.from(event.dataTransfer.files))
  }

  const handleFileInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    handleFilesSelected(Array.from(event.target.files ?? []))
  }

  const handleCropComplete = (croppedFile: File) => {
    setPendingFile(null)
    void uploadFile(croppedFile)
  }

  const handleCropCancel = () => {
    setPendingFile(null)
    setIsCropperOpen(false)
  }

  const handleOpenFileDialog = () => {
    if (!isUploading) {
      inputRef.current?.click()
    }
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      handleOpenFileDialog()
    }
  }

  useEffect(() => {
    setIsImageLoaded(false)
  }, [fileUrl])

  const isDisplayPlaceholderLayout = !fileUrl || isUploading

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        onClick={handleOpenFileDialog}
        onKeyDown={handleKeyDown}
        onDragOver={event => event.preventDefault()}
        onDrop={handleDrop}
        className={cn(
          'flex flex-col items-center justify-center gap-4 m-2 border-dashed border border-gray-900/25 rounded-lg min-h-56 max-h-72 relative',
          className,
          { 'px-6 py-10': isDisplayPlaceholderLayout, 'group cursor-pointer': !isUploading }
        )}
      >
        {fileUrl && (
          <>
            <Image
              src={fileUrl}
              alt="Arquivo"
              width="0"
              height="0"
              sizes="100vw"
              className={cn('w-full h-full overflow-y-hidden max-h-[inherit] object-contain rounded-lg', {
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
                Adicione ou arraste uma foto para ca!
              </LargeText>
              <SmallDescription>Tamanho maximo: 4MB</SmallDescription>
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
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          disabled={isUploading}
          className="hidden"
          onChange={handleFileInputChange}
        />
      </div>
      {enableCropper && (
        <ImageCropperModal
          open={isCropperOpen}
          onOpenChange={setIsCropperOpen}
          imageFile={pendingFile}
          aspectRatio={cropperAspectRatio}
          onCropComplete={handleCropComplete}
          onCancel={handleCropCancel}
        />
      )}
    </>
  )
}
