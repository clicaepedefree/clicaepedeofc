import { getSubdomainContext } from '@/shared/lib/subdomain'
import { FileQuestion, Home, ArrowLeft } from 'lucide-react'
import { Metadata } from 'next'
import Link from 'next/link'
import { headers } from 'next/headers'

export const metadata: Metadata = {
  title: 'Pagina nao encontrada - 404',
  description: 'A pagina que voce esta procurando nao existe.',
}

/**
 * Logs 404 errors for monitoring purposes.
 * In production, this could send to a logging service.
 */
async function log404Error(path: string, context: 'admin' | 'public') {
  // Log to console for monitoring
  console.warn(`[404] Page not found: ${path} (context: ${context})`)
}

export default async function NotFound() {
  const context = await getSubdomainContext()
  const headersList = await headers()
  const pathname = headersList.get('x-invoke-path') ?? '/unknown'

  // Log the 404 for monitoring
  await log404Error(pathname, context)

  const isAdmin = context === 'admin'

  return (
    <div className="h-dvh bg-muted/40 flex flex-col items-center justify-center py-12 px-2 lg:px-8 dark:bg-background">
      <div className="flex flex-col gap-4 items-center text-center bg-card text-card-foreground py-8 px-6 shadow-lg shadow-slate-950/5 dark:shadow-black/25 sm:rounded-lg sm:px-10 rounded-lg max-w-md border">
        <div className="flex items-center justify-center h-16 w-16 rounded-full bg-primary/15">
          <FileQuestion className="h-8 w-8 text-primary" />
        </div>

        <h1 className="text-2xl font-bold text-foreground mt-2">
          Pagina nao encontrada
        </h1>

        <p className="text-muted-foreground">
          {isAdmin
            ? 'A pagina que voce esta procurando nao existe ou foi movida. Verifique o endereco ou volte para o painel.'
            : 'A pagina que voce esta procurando nao existe ou foi movida.'}
        </p>

        <div className="flex flex-col sm:flex-row gap-3 mt-4 w-full">
          {isAdmin ? (
            <>
              <Link
                href="/dashboard"
                className="flex items-center justify-center gap-2 px-4 py-2 bg-primary text-white rounded-md hover:bg-primary/90 transition-colors flex-1"
              >
                <Home size={18} />
                Ir para Dashboard
              </Link>
              <Link
                href="/pos"
                className="flex items-center justify-center gap-2 px-4 py-2 border rounded-md hover:bg-accent hover:text-accent-foreground transition-colors flex-1"
              >
                Ponto de Venda
              </Link>
            </>
          ) : (
            <Link
              href="/"
              className="flex items-center justify-center gap-2 px-4 py-2 bg-primary text-white rounded-md hover:bg-primary/90 transition-colors flex-1"
            >
              <ArrowLeft size={18} />
              Voltar para a pagina inicial
            </Link>
          )}
        </div>

        <div className="mt-4 p-3 bg-muted rounded-md w-full">
          <p className="text-xs text-muted-foreground">
            <strong>Codigo do erro:</strong> 404
            <br />
            Se voce acredita que isso e um erro, entre em contato com o suporte.
          </p>
        </div>
      </div>
    </div>
  )
}
