import { AdminHeader } from '@/features/admin/components/admin-header'
import { validateAdminAccess } from '@/features/store/api'
import { PostHogProvider } from '@/services/product-management/provider'
import { AppSidebar } from '@/shared/sidebar/app-sidebar'
import { SidebarInset, SidebarProvider } from '@/shared/sidebar/base-sidebar'
import type { Metadata } from 'next'
import { AuthProviders } from '../providers'

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
  {
    type: 'section' as const,
    title: 'Gestão',
    icon: 'notebook-pen' as const,
    items: [
      {
        title: 'Relatórios',
        url: '/reports',
        icon: 'chart-spline' as const,
      },
    ],
  },
]

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  await validateAdminAccess()

  return (
    <AuthProviders clerkProviderProps={{ afterSignOutUrl: '/login' }}>
      <SidebarProvider>
        <AppSidebar menuItems={adminMenuItems} collapsible="icon" />
        <SidebarInset>
          <AdminHeader />
          <PostHogProvider>
            <div className="bg-slate-50 h-full overflow-y-scroll">
              {children}
            </div>
          </PostHogProvider>
        </SidebarInset>
      </SidebarProvider>
    </AuthProviders>
  )
}
