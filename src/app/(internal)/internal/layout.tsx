import {
  internalRoleLabels,
  requireInternalOperator,
} from '@/features/internal-operations/access'
import { Badge } from '@/shared/badge'
import { Button } from '@/shared/button'
import { UserButton } from '@clerk/nextjs'
import { Activity, ShieldCheck, Store } from 'lucide-react'
import Link from 'next/link'
import { AuthProviders } from '../../providers'

export default async function InternalLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const operator = await requireInternalOperator('viewer')

  return (
    <AuthProviders clerkProviderProps={{ afterSignOutUrl: '/login' }}>
      <main className="min-h-screen overflow-x-hidden bg-muted/40 text-foreground dark:bg-background">
        <header className="sticky top-0 z-20 border-b bg-background/95 backdrop-blur">
          <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-4 sm:px-6 md:flex-row md:items-center md:justify-between">
            <div className="flex min-w-0 flex-wrap items-center gap-3">
              <Link
                href="/internal/stores"
                className="flex min-w-0 items-center gap-2 font-semibold"
              >
                <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-slate-950 text-white">
                  <ShieldCheck className="size-4" />
                </span>
                <span className="min-w-0 truncate">Operacao Clica e Pede</span>
              </Link>
              <Badge variant="outline" className="bg-muted">
                {internalRoleLabels[operator.role]}
              </Badge>
              <nav className="flex min-w-0 flex-wrap items-center gap-1">
                <Button asChild variant="ghost" size="sm">
                  <Link href="/internal/stores">
                    <Store className="size-4" />
                    Lojas
                  </Link>
                </Button>
                <Button asChild variant="ghost" size="sm">
                  <Link href="/internal/monitoring">
                    <Activity className="size-4" />
                    Monitoramento
                  </Link>
                </Button>
              </nav>
            </div>
            <div className="flex min-w-0 items-center justify-between gap-3 text-sm text-muted-foreground md:justify-end">
              <span className="min-w-0 truncate">{operator.email}</span>
              <UserButton afterSignOutUrl="/login" />
            </div>
          </div>
        </header>
        <div className="mx-auto min-w-0 max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
          {children}
        </div>
      </main>
    </AuthProviders>
  )
}
