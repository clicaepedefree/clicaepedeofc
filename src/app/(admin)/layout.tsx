import '@/app/globals.css'
import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import { ClerkProvider, SignInButton, SignUpButton, SignedOut } from '@clerk/nextjs'
import { ptBR } from '@clerk/localizations'
import { Button } from '@/shared/button'
import { PostHogProvider } from '@/services/product-management/provider'
import { AppSidebar } from '@/shared/sidebar/app-sidebar'
import { Breadcrumb, BreadcrumbItem, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from '@/shared/breadcrumb'
import { Separator } from '@/shared/separator'
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/shared/sidebar/base-sidebar'
import { cn } from '@/lib/utils'
import { StoreSelector } from '@/features/store/components/store-selector'
import { UserProfile } from '@/features/user/components/userProfile'
import { AdminPageTitle } from './admin-page-title'
import { Toaster } from '@/shared/sonner'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Clica Pedidos',
  description: 'Solução completa de vendas e gestão',
}

const adminMenuItems = [
  {
    title: 'Dashboard',
    url: '/dashboard',
    icon: 'chart-pie' as const,
  },
  {
    type: 'section' as const,
    title: 'Loja',
    icon: 'shopping-cart' as const,
    items: [
      {
        title: 'Cardápio / produtos',
        url: '/menu',
        icon: 'utensils' as const,
      },
      {
        title: 'Configurações',
        url: '/settings',
        icon: 'settings' as const,
      },
    ],
  },
]

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider localization={ptBR} afterSignOutUrl={'/login'}>
      <html lang="pt-BR">
        <body className={cn(inter.className, 'h-dvh text-foreground')}>
          <SidebarProvider>
            <AppSidebar menuItems={adminMenuItems} collapsible="icon" />
            <SidebarInset>
              <header className="flex h-16 shrink-0 items-center justify-between gap-2 border-b px-4">
                <div className="flex items-center gap-2">
                  <SidebarTrigger className="-ml-1" />
                  <Separator orientation="vertical" className="mr-2 h-4" />
                  <Breadcrumb>
                    <BreadcrumbList>
                      <BreadcrumbItem className="hidden md:block">
                        <StoreSelector />
                      </BreadcrumbItem>
                      <BreadcrumbSeparator className="hidden md:block" />
                      <BreadcrumbItem>
                        <BreadcrumbPage>
                          <AdminPageTitle />
                        </BreadcrumbPage>
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
                  <UserProfile />
                </div>
              </header>
              <PostHogProvider>
                <div className="p-4 bg-slate-50 h-full">{children}</div>
                <Toaster />
              </PostHogProvider>
            </SidebarInset>
          </SidebarProvider>
        </body>
      </html>
    </ClerkProvider>
  )
}
