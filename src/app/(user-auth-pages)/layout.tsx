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
      <header className="flex justify-end items-center p-4 gap-4 h-16">
        <SignedOut>
          <SignUpButton>
            <Button>Criar conta</Button>
          </SignUpButton>
        </SignedOut>
      </header>
      <PostHogProvider>
        <main className="flex min-h-screen flex-col items-center justify-between p-24">
          {children}
        </main>
      </PostHogProvider>
    </AuthProviders>
  )
}
