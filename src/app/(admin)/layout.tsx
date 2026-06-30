import { AdminHeader } from '@/features/admin/components/admin-header'
import { getInternalOperatorSafe } from '@/features/internal-operations/access'
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

export const dynamic = 'force-dynamic'

const adminMenuItems = [
  {
    title: 'Dashboard',
    url: '/dashboard',
    icon: 'layout-dashboard' as const,
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
        url: '/settings/store',
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
        title: 'Caixa / PDV',
        url: '/pos',
        icon: 'monitor' as const,
      },
      {
        title: 'Pedidos',
        url: '/orders',
        icon: 'shopping-cart' as const,
      },
    ],
  },
  {
    type: 'section' as const,
    title: 'Gestão fiscal',
    icon: 'notebook-pen' as const,
    items: [
      {
        title: 'Notas Fiscais',
        url: '/invoices',
        icon: 'files' as const,
      },
      {
        title: 'Configurações',
        url: '/settings/fiscal',
        icon: 'settings' as const,
      },
    ],
  },
  {
    type: 'section' as const,
    title: 'Relatórios',
    icon: 'chart-spline' as const,
    items: [
      // {
      //   title: 'Relatórios',
      //   url: '/reports',
      //   icon: 'file-spreadsheet' as const,
      // },
    ],
  },
]

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  await validateAdminAccess()
  const internalOperator = await getInternalOperatorSafe()
  const internalOperationHref =
    internalOperator?.role === 'ops_admin' ? '/internal-operations' : undefined

  return (
    <AuthProviders clerkProviderProps={{ afterSignOutUrl: '/login' }}>
      <SidebarProvider>
        <AppSidebar
          menuItems={adminMenuItems}
          internalOperationHref={internalOperationHref}
          collapsible="icon"
        />
        <SidebarInset>
          <AdminHeader />
          <PostHogProvider>
            <div className="min-h-0 flex-1 overflow-y-auto bg-muted/30 dark:bg-background [&_.bg-white]:dark:bg-card [&_.bg-white\/95]:dark:bg-card/95 [&_.bg-gray-50]:dark:bg-muted [&_.bg-slate-50]:dark:bg-muted [&_.border-gray-200]:dark:border-border [&_.border-slate-200]:dark:border-border [&_.text-gray-900]:dark:text-foreground [&_.text-gray-700]:dark:text-foreground [&_.text-gray-600]:dark:text-muted-foreground [&_.text-gray-500]:dark:text-muted-foreground [&_.text-slate-950]:dark:text-foreground [&_.text-slate-800]:dark:text-foreground [&_.text-slate-700]:dark:text-foreground [&_.text-slate-600]:dark:text-muted-foreground [&_.text-slate-500]:dark:text-muted-foreground">
              {children}
            </div>
          </PostHogProvider>
        </SidebarInset>
      </SidebarProvider>
    </AuthProviders>
  )
}
