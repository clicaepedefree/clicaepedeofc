'use client'
import { getQueryClient } from '@/services/query-client'
import { cn } from '@/shared/lib/utils'
import { Toaster } from '@/shared/sonner'
import { ptBR } from '@clerk/localizations'
import { ClerkProvider } from '@clerk/nextjs'
import { QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { Provider as JotaiProvider } from 'jotai'
import { Inter } from 'next/font/google'
import { ThemeProvider } from 'next-themes'

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
    <html lang="pt-BR" suppressHydrationWarning>
      <body
        className={cn(inter.className, 'h-dvh text-foreground', bodyClassName)}
      >
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
          <QueryClientProvider client={queryClient}>
            <Toaster />
            <JotaiProvider>{children}</JotaiProvider>
            <ReactQueryDevtools />
          </QueryClientProvider>
        </ThemeProvider>
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
