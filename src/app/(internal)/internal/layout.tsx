import { requireInternalOperator } from '@/features/internal-operations/access'
import { Badge } from '@/shared/badge'
import { UserButton } from '@clerk/nextjs'
import { ShieldCheck } from 'lucide-react'
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
      <main className="min-h-screen bg-slate-100 text-slate-950">
        <header className="sticky top-0 z-20 border-b bg-white/95 backdrop-blur">
          <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
            <div className="flex items-center gap-3">
              <Link href="/internal/stores" className="flex items-center gap-2 font-semibold">
                <span className="flex size-9 items-center justify-center rounded-md bg-slate-950 text-white">
                  <ShieldCheck className="size-4" />
                </span>
                Operacao Clica e Pede
              </Link>
              <Badge variant="outline" className="border-slate-300 bg-slate-50">
                {operator.role}
              </Badge>
            </div>
            <div className="flex items-center gap-3 text-sm text-slate-600">
              <span>{operator.email}</span>
              <UserButton afterSignOutUrl="/login" />
            </div>
          </div>
        </header>
        <div className="mx-auto max-w-7xl px-6 py-8">{children}</div>
      </main>
    </AuthProviders>
  )
}
