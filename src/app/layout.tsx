import '@/app/globals.css'
import Providers from '@/app/providers'
import { cn } from '@/shared/lib/utils'
import { Inter } from 'next/font/google'
import type { Viewport } from 'next'

const inter = Inter({ subsets: ['latin'] })

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body className={cn(inter.className, 'h-dvh text-foreground')}>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
