'use client'
import { getQueryClient } from '@/services/query-client'
import { cn } from '@/shared/lib/utils'
import { ptBR } from '@clerk/localizations'
import { ClerkProvider } from '@clerk/nextjs'
import { QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { Provider as JotaiProvider } from 'jotai'
import { Inter } from 'next/font/google'

const inter = Inter({ subsets: ['latin'] })

export default function Providers({
  children,
  bodyClassName,
}: {
  children: React.ReactNode
  bodyClassName?: string
}) {
  const queryClient = getQueryClient()

  return (
    <html lang="pt-BR">
      <body
        className={cn(inter.className, 'h-dvh text-foreground', bodyClassName)}
      >
        <QueryClientProvider client={queryClient}>
          <JotaiProvider>{children}</JotaiProvider>
          <ReactQueryDevtools />
        </QueryClientProvider>
      </body>
    </html>
  )
}

export const AuthProviders = ({
  children,
  clerkProviderProps,
}: {
  children: React.ReactNode
  clerkProviderProps?: Pick<
    Parameters<typeof ClerkProvider>[0],
    'afterSignOutUrl'
  >
}) => {
  return (
    <ClerkProvider
      localization={ptBR}
      {...clerkProviderProps}
      appearance={{ cssLayerName: 'clerk' }}
    >
      {children}
    </ClerkProvider>
  )
}
