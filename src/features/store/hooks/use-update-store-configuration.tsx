import { useMutation, useQueryClient } from '@tanstack/react-query'
import { updateStoreConfiguration } from '../api'
import { storeConfigurationsCacheKey } from '../cache-keys'

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
