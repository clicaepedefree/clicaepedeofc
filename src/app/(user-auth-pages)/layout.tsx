import '@/app/globals.css'
import { PostHogProvider } from '@/services/product-management/provider'
import { Button } from '@/shared/button'
import { SignUpButton, SignedOut } from '@clerk/nextjs'
import type { Metadata } from 'next'
import { AuthProviders } from '../providers'

export const metadata: Metadata = {
  title: 'Clica Pedidos',
  description: 'Solução completa de vendas e gestão',
}

export default function UserAuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <AuthProviders>
      <header className="flex h-16 items-center justify-end gap-4 bg-muted/40 px-4 dark:bg-background">
        <SignedOut>
          <SignUpButton>
            <Button>Criar conta</Button>
          </SignUpButton>
        </SignedOut>
      </header>
      <PostHogProvider>
        <main className="flex min-h-[calc(100dvh-4rem)] flex-col items-center justify-center bg-muted/40 p-4 dark:bg-background sm:p-6">
          {children}
        </main>
      </PostHogProvider>
    </AuthProviders>
  )
}
