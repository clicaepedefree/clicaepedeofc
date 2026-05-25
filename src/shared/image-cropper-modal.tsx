'use client'

import { Button } from '@/shared/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/dialog'
import { cn } from '@/shared/lib/utils'
import { LoadingSpinner } from '@/shared/spinner'
import { Minus, Plus, RotateCcw } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'

// Zoom configuration
const MIN_ZOOM = 0.5
const MAX_ZOOM = 3
const ZOOM_STEP = 0.1

// Preview configuration
const PREVIEW_MAX_SIZE = 100 // Maximum preview dimension in pixels

// Responsive canvas dimensions
const MOBILE_BREAKPOINT = 640 // matches Tailwind's sm breakpoint
const CANVAS_MAX_WIDTH = 400
const CANVAS_MAX_HEIGHT = 300
const CANVAS_MOBILE_PADDING = 32 // 16px padding on each side

interface ImageCropperModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  imageFile: File | null
  aspectRatio?: number
  onCropComplete: (croppedFile: File) => void
  onCancel: () => void
}

export const ImageCropperModal = ({
  open,
  onOpenChange,
  imageFile,
  aspectRatio = 1,
  onCropComplete,
  onCancel,
}: ImageCropperModalProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const previewCanvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [imageSrc, setImageSrc] = useState<string | null>(null)
  const [imageElement, setImageElement] = useState<HTMLImageElement | null>(null)
  const [scale, setScale] = useState(1)
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const [cropSize, setCropSize] = useState({ width: 200, height: 200 })
  const [isProcessing, setIsProcessing] = useState(false)

  // Pinch-to-zoom state
  const [lastPinchDistance, setLastPinchDistance] = useState<number | null>(null)

  // Responsive canvas dimensions
  const [canvasDimensions, setCanvasDimensions] = useState({
    width: CANVAS_MAX_WIDTH,
    height: CANVAS_MAX_HEIGHT
  })
  const [isMobile, setIsMobile] = useState(false)

  // Calculate responsive canvas dimensions based on viewport
  useEffect(() => {
    const updateDimensions = () => {
      const viewportWidth = window.innerWidth
      const isMobileViewport = viewportWidth < MOBILE_BREAKPOINT
      setIsMobile(isMobileViewport)

      if (isMobileViewport) {
        // On mobile, use available viewport width minus padding
        const availableWidth = viewportWidth - CANVAS_MOBILE_PADDING
        const canvasWidth = Math.min(availableWidth, CANVAS_MAX_WIDTH)
        const canvasHeight = Math.round(canvasWidth * (CANVAS_MAX_HEIGHT / CANVAS_MAX_WIDTH))
        setCanvasDimensions({ width: canvasWidth, height: canvasHeight })
      } else {
        // On desktop, use fixed dimensions
        setCanvasDimensions({ width: CANVAS_MAX_WIDTH, height: CANVAS_MAX_HEIGHT })
      }
    }

    updateDimensions()
    window.addEventListener('resize', updateDimensions)
    return () => window.removeEventListener('resize', updateDimensions)
  }, [])

  // Load image when file changes
  useEffect(() => {
    if (!imageFile) {
      setImageSrc(null)
      setImageElement(null)
      return
    }

    const reader = new FileReader()
    reader.onload = e => {
      const src = e.target?.result as string
      setImageSrc(src)

      const img = new Image()
      img.onload = () => {
        setImageElement(img)
        // Reset position and scale
        setPosition({ x: 0, y: 0 })
        setScale(1)
      }
      img.src = src
    }
    reader.readAsDataURL(imageFile)
  }, [imageFile])

  // Calculate crop size based on container and aspect ratio
  useEffect(() => {
    if (!containerRef.current) return

    const containerWidth = canvasDimensions.width
    const containerHeight = canvasDimensions.height

    let cropWidth: number
    let cropHeight: number

    if (aspectRatio >= 1) {
      cropWidth = Math.min(containerWidth * 0.8, containerHeight * 0.8 * aspectRatio)
      cropHeight = cropWidth / aspectRatio
    } else {
      cropHeight = Math.min(containerHeight * 0.8, containerWidth * 0.8 / aspectRatio)
      cropWidth = cropHeight * aspectRatio
    }

    setCropSize({ width: cropWidth, height: cropHeight })
  }, [aspectRatio, open, canvasDimensions])

  // Draw canvas
  const drawCanvas = useCallback(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx || !imageElement) return

    const containerWidth = canvasDimensions.width
    const containerHeight = canvasDimensions.height

    canvas.width = containerWidth
    canvas.height = containerHeight

    // Clear canvas
    ctx.fillStyle = '#1a1a1a'
    ctx.fillRect(0, 0, containerWidth, containerHeight)

    // Calculate scaled image dimensions
    const scaledWidth = imageElement.width * scale
    const scaledHeight = imageElement.height * scale

    // Calculate image position to center it, then apply user position offset
    const centerX = (containerWidth - scaledWidth) / 2 + position.x
    const centerY = (containerHeight - scaledHeight) / 2 + position.y

    // Draw the image
    ctx.drawImage(imageElement, centerX, centerY, scaledWidth, scaledHeight)

    // Draw dark overlay
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)'
    ctx.fillRect(0, 0, containerWidth, containerHeight)

    // Calculate crop area position (centered)
    const cropX = (containerWidth - cropSize.width) / 2
    const cropY = (containerHeight - cropSize.height) / 2

    // Clear the crop area (show the image)
    ctx.save()
    ctx.beginPath()
    ctx.rect(cropX, cropY, cropSize.width, cropSize.height)
    ctx.clip()
    ctx.clearRect(0, 0, containerWidth, containerHeight)
    ctx.drawImage(imageElement, centerX, centerY, scaledWidth, scaledHeight)
    ctx.restore()

    // Draw crop border
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = 2
    ctx.strokeRect(cropX, cropY, cropSize.width, cropSize.height)

    // Draw corner handles - larger on mobile for touch
    const handleSize = isMobile ? 14 : 10
    ctx.fillStyle = '#ffffff'
    // Top-left
    ctx.fillRect(cropX - handleSize / 2, cropY - handleSize / 2, handleSize, handleSize)
    // Top-right
    ctx.fillRect(cropX + cropSize.width - handleSize / 2, cropY - handleSize / 2, handleSize, handleSize)
    // Bottom-left
    ctx.fillRect(cropX - handleSize / 2, cropY + cropSize.height - handleSize / 2, handleSize, handleSize)
    // Bottom-right
    ctx.fillRect(cropX + cropSize.width - handleSize / 2, cropY + cropSize.height - handleSize / 2, handleSize, handleSize)
  }, [imageElement, scale, position, cropSize, canvasDimensions, isMobile])

  useEffect(() => {
    drawCanvas()
  }, [drawCanvas])

  // Draw preview canvas - shows cropped result in real-time
  const drawPreview = useCallback(() => {
    const previewCanvas = previewCanvasRef.current
    const previewCtx = previewCanvas?.getContext('2d')
    if (!previewCanvas || !previewCtx || !imageElement) return

    const containerWidth = canvasDimensions.width
    const containerHeight = canvasDimensions.height

    // Calculate crop area in canvas coordinates
    const cropX = (containerWidth - cropSize.width) / 2
    const cropY = (containerHeight - cropSize.height) / 2

    // Calculate scaled image dimensions and position
    const scaledWidth = imageElement.width * scale
    const scaledHeight = imageElement.height * scale
    const imageX = (containerWidth - scaledWidth) / 2 + position.x
    const imageY = (containerHeight - scaledHeight) / 2 + position.y

    // Convert crop area to original image coordinates
    const sourceX = (cropX - imageX) / scale
    const sourceY = (cropY - imageY) / scale
    const sourceWidth = cropSize.width / scale
    const sourceHeight = cropSize.height / scale

    // Calculate preview size (scale down to fit within PREVIEW_MAX_SIZE while maintaining aspect ratio)
    // Use smaller preview on mobile
    const maxPreviewSize = isMobile ? 70 : PREVIEW_MAX_SIZE
    let previewWidth: number
    let previewHeight: number
    if (cropSize.width >= cropSize.height) {
      previewWidth = maxPreviewSize
      previewHeight = maxPreviewSize * (cropSize.height / cropSize.width)
    } else {
      previewHeight = maxPreviewSize
      previewWidth = maxPreviewSize * (cropSize.width / cropSize.height)
    }

    // Set canvas dimensions
    previewCanvas.width = previewWidth
    previewCanvas.height = previewHeight

    // Draw background
    previewCtx.fillStyle = '#f0f0f0'
    previewCtx.fillRect(0, 0, previewWidth, previewHeight)

    // Draw cropped image preview
    previewCtx.drawImage(
      imageElement,
      sourceX,
      sourceY,
      sourceWidth,
      sourceHeight,
      0,
      0,
      previewWidth,
      previewHeight
    )
  }, [imageElement, scale, position, cropSize, canvasDimensions, isMobile])

  // Update preview whenever crop parameters change
  useEffect(() => {
    drawPreview()
  }, [drawPreview])

  // Handle mouse/touch events
  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true)
    setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y })
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return
    setPosition({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y,
    })
  }

  const handleMouseUp = () => {
    setIsDragging(false)
  }

  // Handle mouse wheel zoom
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault()
    const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP
    setScale(prev => Math.min(Math.max(prev + delta, MIN_ZOOM), MAX_ZOOM))
  }

  // Handle touch events with pinch-to-zoom support
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      // Start pinch gesture
      e.preventDefault()
      const distance = getTouchDistance(e.touches)
      setLastPinchDistance(distance)
    } else if (e.touches.length === 1) {
      // Start drag
      const touch = e.touches[0]
      setIsDragging(true)
      setDragStart({ x: touch.clientX - position.x, y: touch.clientY - position.y })
    }
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      // Handle pinch-to-zoom
      e.preventDefault()
      const currentDistance = getTouchDistance(e.touches)
      if (currentDistance && lastPinchDistance) {
        const delta = currentDistance - lastPinchDistance
        const zoomSensitivity = 0.01 // Adjust this for more/less sensitivity
        const newScale = scale + delta * zoomSensitivity
        setScale(Math.min(Math.max(newScale, MIN_ZOOM), MAX_ZOOM))
        setLastPinchDistance(currentDistance)
      }
    } else if (isDragging && e.touches.length === 1) {
      // Handle drag
      const touch = e.touches[0]
      setPosition({
        x: touch.clientX - dragStart.x,
        y: touch.clientY - dragStart.y,
      })
    }
  }

  const handleTouchEnd = () => {
    setIsDragging(false)
    setLastPinchDistance(null)
  }

  // Zoom controls
  const handleZoomIn = () => {
    setScale(prev => Math.min(prev + ZOOM_STEP, MAX_ZOOM))
  }

  const handleZoomOut = () => {
    setScale(prev => Math.max(prev - ZOOM_STEP, MIN_ZOOM))
  }

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setScale(parseFloat(e.target.value))
  }

  const handleReset = () => {
    setScale(1)
    setPosition({ x: 0, y: 0 })
  }

  // Calculate distance between two touch points for pinch gesture
  const getTouchDistance = (touches: React.TouchList) => {
    if (touches.length < 2) return null
    const dx = touches[0].clientX - touches[1].clientX
    const dy = touches[0].clientY - touches[1].clientY
    return Math.sqrt(dx * dx + dy * dy)
  }

  // Generate cropped image
  const handleCrop = async () => {
    if (!imageElement || !imageFile) return

    setIsProcessing(true)

    try {
      const containerWidth = canvasDimensions.width
      const containerHeight = canvasDimensions.height

      // Calculate crop area in canvas coordinates
      const cropX = (containerWidth - cropSize.width) / 2
      const cropY = (containerHeight - cropSize.height) / 2

      // Calculate scaled image dimensions and position
      const scaledWidth = imageElement.width * scale
      const scaledHeight = imageElement.height * scale
      const imageX = (containerWidth - scaledWidth) / 2 + position.x
      const imageY = (containerHeight - scaledHeight) / 2 + position.y

      // Convert crop area to original image coordinates
      const sourceX = (cropX - imageX) / scale
      const sourceY = (cropY - imageY) / scale
      const sourceWidth = cropSize.width / scale
      const sourceHeight = cropSize.height / scale

      // Create output canvas with desired dimensions
      const outputCanvas = document.createElement('canvas')
      const outputCtx = outputCanvas.getContext('2d')
      if (!outputCtx) throw new Error('Could not get canvas context')

      // Output size (use crop size or a reasonable default)
      const outputWidth = Math.min(cropSize.width * 2, 800)
      const outputHeight = Math.min(cropSize.height * 2, 800)
      outputCanvas.width = outputWidth
      outputCanvas.height = outputHeight

      // Draw cropped image
      outputCtx.drawImage(
        imageElement,
        sourceX,
        sourceY,
        sourceWidth,
        sourceHeight,
        0,
        0,
        outputWidth,
        outputHeight
      )

      // Convert canvas to blob
      const blob = await new Promise<Blob>((resolve, reject) => {
        outputCanvas.toBlob(
          blob => {
            if (blob) resolve(blob)
            else reject(new Error('Failed to create blob'))
          },
          'image/jpeg',
          0.9
        )
      })

      // Create new file with original name
      const fileName = imageFile.name.replace(/\.[^/.]+$/, '') + '_cropped.jpg'
      const croppedFile = new File([blob], fileName, { type: 'image/jpeg' })

      onCropComplete(croppedFile)
      onOpenChange(false)
    } catch (error) {
      console.error('Error cropping image:', error)
    } finally {
      setIsProcessing(false)
    }
  }

  // Handle dialog close (e.g., from Escape key, clicking outside, or Cancel button)
  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      // Dialog is being closed, call onCancel to reset state
      onCancel()
    }
    onOpenChange(isOpen)
  }

  const handleCancel = () => {
    // Just close the dialog - handleOpenChange will call onCancel
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className={cn(
        'max-h-[90vh] overflow-y-auto',
        // Responsive max-width: full width on mobile, limited on larger screens
        'w-full max-w-[calc(100%-1rem)] sm:max-w-[500px]'
      )}>
        <DialogHeader>
          <DialogTitle>Recortar imagem</DialogTitle>
          <DialogDescription className={cn(isMobile && 'text-xs')}>
            {isMobile
              ? 'Arraste para posicionar. Use dois dedos para zoom.'
              : 'Arraste a imagem para posicioná-la. Use os controles de zoom para ajustar.'}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3 sm:gap-4">
          {/* Canvas container - responsive height based on canvas dimensions */}
          <div
            ref={containerRef}
            className="relative overflow-hidden rounded-lg bg-neutral-900 flex items-center justify-center touch-none"
            style={{ height: canvasDimensions.height }}
          >
            <canvas
              ref={canvasRef}
              className={cn('cursor-move', { 'cursor-grabbing': isDragging })}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
              onWheel={handleWheel}
            />
          </div>

          {/* Zoom controls */}
          <div className="flex flex-col gap-2 sm:gap-3">
            {/* Zoom slider */}
            <div className="flex items-center gap-2 sm:gap-3">
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={handleZoomOut}
                disabled={scale <= MIN_ZOOM}
                aria-label="Diminuir zoom"
                className={cn(
                  // Larger touch targets on mobile (min 44px)
                  isMobile && 'h-11 w-11'
                )}
              >
                <Minus className={cn('h-4 w-4', isMobile && 'h-5 w-5')} />
              </Button>
              <div className="flex-1 flex items-center gap-2">
                <input
                  type="range"
                  min={MIN_ZOOM}
                  max={MAX_ZOOM}
                  step={ZOOM_STEP}
                  value={scale}
                  onChange={handleSliderChange}
                  className={cn(
                    'w-full bg-muted rounded-lg appearance-none cursor-pointer accent-primary',
                    // Larger slider track and thumb on mobile
                    isMobile
                      ? 'h-3 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-6 [&::-webkit-slider-thumb]:h-6 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:cursor-pointer [&::-moz-range-thumb]:w-6 [&::-moz-range-thumb]:h-6 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-primary [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:cursor-pointer'
                      : 'h-2 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:cursor-pointer [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-primary [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:cursor-pointer'
                  )}
                  aria-label="Ajustar zoom"
                />
              </div>
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={handleZoomIn}
                disabled={scale >= MAX_ZOOM}
                aria-label="Aumentar zoom"
                className={cn(
                  // Larger touch targets on mobile (min 44px)
                  isMobile && 'h-11 w-11'
                )}
              >
                <Plus className={cn('h-4 w-4', isMobile && 'h-5 w-5')} />
              </Button>
            </div>
            {/* Zoom level indicator and reset */}
            <div className="flex items-center justify-center gap-2">
              <span className={cn(
                'text-muted-foreground min-w-[50px] text-center font-medium',
                isMobile ? 'text-xs' : 'text-sm'
              )}>
                {Math.round(scale * 100)}%
              </span>
              <Button
                type="button"
                variant="outline"
                size={isMobile ? 'default' : 'sm'}
                onClick={handleReset}
                className={cn('gap-1', isMobile && 'h-10 px-4')}
              >
                <RotateCcw className={cn(isMobile ? 'h-4 w-4' : 'h-3 w-3')} />
                Resetar
              </Button>
            </div>
          </div>

          {/* Preview section - simplified on mobile */}
          {imageElement && (
            <div className={cn(
              'flex items-center gap-3 p-2 sm:p-3 bg-muted/50 rounded-lg',
              isMobile ? 'flex-row' : 'gap-4'
            )}>
              <div className="flex-shrink-0">
                <div className="text-xs text-muted-foreground mb-1">Pré-visualização:</div>
                <div
                  className="border border-border rounded overflow-hidden bg-card"
                  style={{
                    maxWidth: isMobile ? 70 : PREVIEW_MAX_SIZE,
                    maxHeight: isMobile ? 70 : PREVIEW_MAX_SIZE
                  }}
                >
                  <canvas ref={previewCanvasRef} className="block" />
                </div>
              </div>
              <div className="flex-1 text-muted-foreground">
                <p className={cn(isMobile ? 'text-xs' : 'text-sm')}>
                  {isMobile ? 'Prévia do resultado' : 'Esta é uma prévia do resultado final.'}
                </p>
                <p className="text-xs mt-1">
                  {Math.round(cropSize.width * 2)}×{Math.round(cropSize.height * 2)} px
                </p>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className={cn(isMobile && 'gap-2')}>
          <Button
            type="button"
            variant="secondary"
            onClick={handleCancel}
            className={cn(isMobile && 'h-12 text-base flex-1')}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={handleCrop}
            disabled={isProcessing || !imageElement}
            className={cn(isMobile && 'h-12 text-base flex-1')}
          >
            {isProcessing ? (
              <>
                <LoadingSpinner size={isMobile ? 18 : 16} className="mr-2" />
                {isMobile ? 'Processando' : 'Processando...'}
              </>
            ) : (
              'Confirmar'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
