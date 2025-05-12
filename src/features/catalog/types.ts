import { InsertCategory, SelectCategory } from '@/services/db/schema/categories'
import { InsertCategoryProduct } from '@/services/db/schema/category-products'
import { InsertProduct } from '@/services/db/schema/products'
import { SelectStoreFile } from '@/services/db/schema/store-files'

export type NewCategory = Omit<PartialBy<InsertCategory, 'index'>, 'id'>

export type Category = SelectCategory

export type CategoryWithImage = Omit<SelectCategory, 'imageId'> & {
  image: Pick<SelectStoreFile, 'id' | 'url'> | null
}

export type NewCategoryProduct = Omit<PartialBy<InsertCategoryProduct, 'index'>, 'id'>
export type NewProduct = Omit<InsertProduct, 'id'> & {
  categories: Omit<NewCategoryProduct, 'productId'>[]
}
