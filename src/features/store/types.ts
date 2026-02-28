import { SelectConfiguration } from '@/services/db/schema/configurations'
import { SelectStoreConfiguration } from '@/services/db/schema/store-configurations'
import { SelectUserStorePermission } from '@/services/db/schema/user-store-permissions'

export type StoreConfiguration = Omit<
  SelectConfiguration,
  'default' | 'createdAt' | 'updatedAt'
> &
  WithNullableFields<
    Pick<SelectStoreConfiguration, 'value' | 'createdAt' | 'updatedAt'>,
    'createdAt' | 'updatedAt'
  >

export type StoreConfigurationInputProps = {
  label?: string
  value: string | null
  onChange?(value: string): void
  disabled?: boolean
}

export type UserStoreRole = SelectUserStorePermission['role']
