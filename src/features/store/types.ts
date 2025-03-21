import { SelectConfiguration } from '@/services/db/schema/configurations'
import { SelectStore } from '@/services/db/schema/store'
import { SelectStoreConfiguration } from '@/services/db/schema/store-configurations'

export type Store = SelectStore
export type StoreConfiguration = Omit<SelectConfiguration, 'default' | 'createdAt' | 'updatedAt'> &
  WithNullableFields<Pick<SelectStoreConfiguration, 'value' | 'createdAt' | 'updatedAt'>, 'createdAt' | 'updatedAt'>
