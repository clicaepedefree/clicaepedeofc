import { LoadingSpinner } from '@/shared/spinner'
import { SignedIn, UserButton } from '@clerk/nextjs'
import { AlertTriangle } from 'lucide-react'
import { Metadata } from 'next'
import { AuthProviders } from '../providers'

export const metadata: Metadata = {
  title: 'Acesso Negado',
  description: 'Você não possui permissões de administrador para nenhuma loja.',
}

export default function UnauthorizedPage() {
  return (
    <AuthProviders>
      <div className="h-dvh bg-muted/40 flex flex-col items-center justify-center py-12 px-2 lg:px-8 dark:bg-background">
        <header className="w-full bg-background/85 backdrop-blur flex justify-center items-center px-4 py-3 absolute top-0 right-0 border-b">
          <SignedIn>
            <UserButton
              appearance={{
                elements: {
                  userButtonPopoverCard:
                    '[justify-self:anchor-center] left-[unset_!important]',
                },
              }}
              fallback={<LoadingSpinner size={28} />}
            />
          </SignedIn>
        </header>
        <div className="flex flex-col gap-2 items-center text-center bg-card text-card-foreground py-8 px-4 shadow-lg shadow-slate-950/5 dark:shadow-black/25 sm:rounded-lg sm:px-10 rounded-lg max-w-md border">
          <div className="flex items-center justify-center h-16 w-16 rounded-full bg-destructive/15">
            <AlertTriangle className="h-8 w-8 text-destructive" />
          </div>

          <h1 className="text-2xl font-bold text-foreground mt-2">
            Acesso Negado
          </h1>

          <p>
            Você não possui permissões de administrador para nenhuma loja. Entre
            em contato com o administrador da loja para pedir acesso.
          </p>

          <div className="mt-4 p-4 bg-muted rounded-md">
            <p className="text-xs text-muted-foreground">
              <strong>Precisa de ajuda?</strong>
              <br />
              Entre em contato com nossa equipe de suporte se acredita que isso
              é um erro.
            </p>
          </div>
        </div>
      </div>
    </AuthProviders>
  )
}
