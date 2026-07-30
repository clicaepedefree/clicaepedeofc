'use client'
import { getQueryClient } from '@/services/query-client'
import { Toaster } from '@/shared/sonner'
import { ptBR } from '@clerk/localizations'
import { ClerkProvider } from '@clerk/nextjs'
import { QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { Provider as JotaiProvider } from 'jotai'
import { ThemeProvider } from 'next-themes'

export default function Providers({
  children,
}: {
  children: React.ReactNode
}) {
  const queryClient = getQueryClient()

  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
      <QueryClientProvider client={queryClient}>
        <Toaster />
        <JotaiProvider>{children}</JotaiProvider>
        <ReactQueryDevtools />
      </QueryClientProvider>
    </ThemeProvider>
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
      appearance={{
        cssLayerName: 'clerk',
        elements: {
          userButtonPopoverFooter: 'hidden',
          navbar: '[&>*]:last:hidden',
        },
      }}
    >
      {children}
    </ClerkProvider>
  )
}
