'use client'

import { UploadButton } from '@/shared/file-upload'

export default function Home() {
  return (
    <>
      <UploadButton
        onClientUploadComplete={res => {
          console.log('Files: ', res)
        }}
        onUploadError={(error: Error) => {
          console.error(`ERROR! ${error.message}`)
        }}
      />
    </>
  )
}
