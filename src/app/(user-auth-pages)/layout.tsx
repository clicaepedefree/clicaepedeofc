import '@/app/globals.css'
import { PostHogProvider } from '@/services/product-management/provider'
import { Button } from '@/shared/button'
import {
  SignInButton,
  SignUpButton,
  SignedIn,
  SignedOut,
  UserButton,
} from '@clerk/nextjs'
import type { Metadata } from 'next'
import Providers from '../providers'

export const metadata: Metadata = {
  title: 'Clica Pedidos',
  description: 'Solução completa de vendas e gestão',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <Providers>
      <header className="flex justify-end items-center p-4 gap-4 h-16">
        <SignedOut>
          <SignInButton>
            <Button variant="outline">Entrar</Button>
          </SignInButton>
          <SignUpButton>
            <Button>Criar conta</Button>
          </SignUpButton>
        </SignedOut>
        <SignedIn>
          <UserButton
            appearance={{
              elements: { userButtonPopoverFooter: { display: 'none' } },
            }}
          />
        </SignedIn>
      </header>
      <PostHogProvider>
        <main className="flex min-h-screen flex-col items-center justify-between p-24">
          {children}
        </main>
      </PostHogProvider>
    </Providers>
  )
}
