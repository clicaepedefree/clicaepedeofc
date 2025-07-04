import {
  isPermissionsError,
  permissionTypeToErrorCodeMapping,
} from '@/features/store/errors'
import { dispatchToast } from '@/shared/lib/toast'
import { isServer, QueryCache, QueryClient } from '@tanstack/react-query'

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // With SSR, we usually want to set some default staleTime
        // above 0 to avoid refetching immediately on the client
        staleTime: 60 * 1000,
        retry: (failureCount, error) => {
          if (isPermissionsError(error)) return false
          return failureCount < 2
        },
      },
    },
    queryCache: new QueryCache({
      onError: error => {
        if (!isPermissionsError(error)) return

        dispatchToast({
          message: `${error.message}`,
          type: 'error',
        })
      },
    }),
  })
}

let browserQueryClient: QueryClient | undefined = undefined

export function getQueryClient() {
  if (isServer) {
    // Server: always make a new query client
    return makeQueryClient()
  } else {
    // Browser: make a new query client if we don't already have one
    // This is very important, so we don't re-make a new client if React
    // suspends during the initial render. This may not be needed if we
    // have a suspense boundary BELOW the creation of the query client
    if (!browserQueryClient) browserQueryClient = makeQueryClient()
    return browserQueryClient
  }
}
