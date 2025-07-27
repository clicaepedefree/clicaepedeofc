import { useQuery } from '@tanstack/react-query'
import { useAtom } from 'jotai'
import { selectedStoreIdAtom } from '../../store/state'
import { getCounterSessionSummary } from '../api'
import { counterSessionsCacheKey } from '../cache-keys'

export const useCounterSession = ({
  counterId,
  counterSessionId,
}: {
  counterId: number
  counterSessionId?: number
}) => {
  const [selectedStoreId] = useAtom(selectedStoreIdAtom)

  const isEnabled = !!selectedStoreId && !!counterSessionId
  const result = useQuery({
    enabled: isEnabled,
    queryKey: counterSessionsCacheKey(
      selectedStoreId,
      counterSessionId ?? null
    ),
    queryFn: async () => {
      if (!isEnabled)
        throw new Error('StoreId and CounterSessionId are required!')
      return getCounterSessionSummary({
        storeId: selectedStoreId,
        counterId,
        counterSessionId,
      })
    },
  })

  return {
    counterSessionSummary: result.data,
    refetch: result.refetch,
    isLoading: result.isLoading,
    isEnabled,
    isError: result.isError,
  }
}
