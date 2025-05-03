import { SelectCategory } from '@/services/db/schema/categories'
import { SelectStoreFile } from '@/services/db/schema/store-files'

export type Category = SelectCategory

export type CategoryWithImage = Omit<SelectCategory, 'imageId'> & {
  image: Pick<SelectStoreFile, 'id' | 'url'> | null
}
