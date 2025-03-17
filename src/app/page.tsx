'use client'

import { Button } from '@/shared/button'
import { UploadButton } from '@/shared/file-upload'

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-between p-24">
      <UploadButton
        onClientUploadComplete={res => {
          console.log('Files: ', res)
        }}
        onUploadError={(error: Error) => {
          console.error(`ERROR! ${error.message}`)
        }}
      />
    </main>
  )
}
