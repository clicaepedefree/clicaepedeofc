'use client'

import { ImageCropperModal } from '@/shared/image-cropper-modal'
import { Button } from '@/shared/button'
import { useState, useRef } from 'react'

export default function TestCropperInteractivePage() {
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [cropperOpen, setCropperOpen] = useState(false)
  const [croppedImageUrl, setCroppedImageUrl] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setImageFile(file)
      setCropperOpen(true)
    }
  }

  const handleCropComplete = (croppedFile: File) => {
    const url = URL.createObjectURL(croppedFile)
    setCroppedImageUrl(url)
    setImageFile(null)
  }

  const handleCancel = () => {
    setImageFile(null)
  }

  const handleSelectFile = () => {
    fileInputRef.current?.click()
  }

  return (
    <div className="min-h-screen bg-background p-4 sm:p-8">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold mb-4">Image Cropper Test Page</h1>
        <p className="text-muted-foreground mb-6">
          Test the mobile-responsive image cropper. Upload an image to test:
        </p>

        <div className="space-y-4">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileSelect}
            className="hidden"
          />

          <Button onClick={handleSelectFile}>
            Select Image to Crop
          </Button>

          {croppedImageUrl && (
            <div className="mt-6">
              <h2 className="text-lg font-semibold mb-2">Cropped Result:</h2>
              <img
                src={croppedImageUrl}
                alt="Cropped result"
                className="max-w-full rounded-lg border border-border"
              />
            </div>
          )}

          <div className="mt-8 p-4 bg-muted/50 rounded-lg">
            <h2 className="font-semibold mb-2">Feature: #73 - Mobile Responsive</h2>
            <ul className="text-sm space-y-1 text-muted-foreground">
              <li>- Canvas resizes based on viewport width</li>
              <li>- Touch gestures work for pan and zoom (pinch-to-zoom)</li>
              <li>- Buttons are larger on mobile (44px touch targets)</li>
              <li>- Modal is scrollable if content exceeds viewport</li>
              <li>- Preview section adapts to mobile sizes</li>
              <li>- Description text adapts for mobile context</li>
            </ul>
          </div>
        </div>

        <ImageCropperModal
          open={cropperOpen}
          onOpenChange={setCropperOpen}
          imageFile={imageFile}
          aspectRatio={1}
          onCropComplete={handleCropComplete}
          onCancel={handleCancel}
        />
      </div>
    </div>
  )
}
