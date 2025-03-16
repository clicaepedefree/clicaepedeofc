'use client'

import { Button } from '@/shared/button'
import Image from 'next/image'

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-between p-24">
      <Button onClick={() => console.log('Clicked')}>Test button</Button>
    </main>
  )
}
