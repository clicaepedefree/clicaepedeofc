import { updateStoreConfiguration } from '@/features/store/api'
import { storeConfigurationsCacheKey } from '@/features/store/cache-keys'
import { useMutation, useQueryClient } from '@tanstack/react-query'

interface UpdateStoreConfigurationParams {
  storeId: number
  configurationId: number
  value: string
}

export const useUpdateStoreConfiguration = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ storeId, configurationId, value }: UpdateStoreConfigurationParams) =>
      updateStoreConfiguration(storeId, configurationId, value),
    onSuccess: (_, { storeId }) => {
      queryClient.invalidateQueries({
        queryKey: storeConfigurationsCacheKey(storeId),
      })
    },
  })
}
