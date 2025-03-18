import '@/app/globals.css'
import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import { ClerkProvider, SignInButton, SignUpButton, SignedIn, SignedOut, UserButton } from '@clerk/nextjs'
import { ptBR } from '@clerk/localizations'
import { Button } from '@/shared/button'
import { PostHogProvider } from '@/services/product-management/provider'
import { AppSidebar } from '@/shared/app-sidebar'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/shared/breadcrumb'
import { Separator } from '@/shared/separator'
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/shared/sidebar'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Clica Pedidos',
  description: 'Solução completa de vendas e gestão',
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider localization={ptBR} afterSignOutUrl={'/login'}>
      <html lang="en">
        <body className={inter.className}>
          <SidebarProvider>
            <AppSidebar />
            <SidebarInset>
              <header className="flex h-16 shrink-0 items-center justify-between gap-2 border-b px-4">
                <div className="flex items-center gap-2">
                  <SidebarTrigger className="-ml-1" />
                  <Separator orientation="vertical" className="mr-2 h-4" />
                  <Breadcrumb>
                    <BreadcrumbList>
                      <BreadcrumbItem className="hidden md:block">
                        <BreadcrumbLink href="#">Administrador de lojas</BreadcrumbLink>
                      </BreadcrumbItem>
                      <BreadcrumbSeparator className="hidden md:block" />
                      <BreadcrumbItem>
                        <BreadcrumbPage>Dashboard</BreadcrumbPage>
                      </BreadcrumbItem>
                    </BreadcrumbList>
                  </Breadcrumb>
                </div>
                <div>
                  <SignedOut>
                    <SignInButton>
                      <Button variant="outline">Entrar</Button>
                    </SignInButton>
                    <SignUpButton>
                      <Button>Criar conta</Button>
                    </SignUpButton>
                  </SignedOut>
                  <SignedIn>
                    <UserButton appearance={{ elements: { userButtonPopoverFooter: { display: 'none' } } }} />
                  </SignedIn>
                </div>
              </header>
            </SidebarInset>
          </SidebarProvider>
          <PostHogProvider>
            <main className="flex min-h-screen flex-col items-center justify-between p-24">{children}</main>
          </PostHogProvider>
        </body>
      </html>
    </ClerkProvider>
  )
}
