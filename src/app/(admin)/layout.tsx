import '@/app/globals.css'
import { AdminHeader } from '@/features/admin/components/admin-header'
import { PostHogProvider } from '@/services/product-management/provider'
import { cn } from '@/shared/lib/utils'
import { AppSidebar } from '@/shared/sidebar/app-sidebar'
import { SidebarInset, SidebarProvider } from '@/shared/sidebar/base-sidebar'
import { Toaster } from '@/shared/sonner'
import { ptBR } from '@clerk/localizations'
import { ClerkProvider } from '@clerk/nextjs'
import type { Metadata } from 'next'
import { Inter } from 'next/font/google'

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
        title: 'Cardápio e produtos',
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
  {
    type: 'section' as const,
    title: 'Vendas e Pedidos',
    icon: 'dollar-sign' as const,
    items: [
      {
        title: 'Balcão / PDV',
        url: '/pos',
        icon: 'monitor' as const,
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
              <AdminHeader />
              <PostHogProvider>
                <div className="bg-slate-50 h-full overflow-y-scroll">{children}</div>
                <Toaster />
              </PostHogProvider>
            </SidebarInset>
          </SidebarProvider>
        </body>
      </html>
    </ClerkProvider>
  )
}
