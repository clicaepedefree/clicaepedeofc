import { InsertCategory, SelectCategory } from '@/services/db/schema/categories'
import { InsertCategoryProduct, SelectCategoryProduct } from '@/services/db/schema/category-products'
import { InsertProduct, SelectProduct } from '@/services/db/schema/products'
import { SelectStoreFile } from '@/services/db/schema/store-files'

export type BaseStoreFile = Pick<SelectStoreFile, 'id' | 'url'>

export type NewCategory = Omit<PartialBy<InsertCategory, 'index'>, 'id'>

export type BaseCategory = Pick<SelectCategory, 'id' | 'name'>

export type Category = SelectCategory

export type CategoryWithImage = Omit<SelectCategory, 'imageId'> & {
  image: BaseStoreFile | null
  products?: ProductWithImageAndCategory[]
}

export type NewCategoryProduct = Omit<PartialBy<InsertCategoryProduct, 'index'>, 'id'>
export type NewProduct = Omit<InsertProduct, 'id'> & {
  categories: Omit<NewCategoryProduct, 'productId'>[]
}

export type Product = SelectProduct
export type ProductWithImage = Omit<SelectProduct, 'imageId'> & {
  image: BaseStoreFile | null
}
export type ProductWithImageAndCategory = ProductWithImage &
  Omit<SelectCategoryProduct, 'id' | 'categoryId' | 'productId' | 'createdAt' | 'updatedAt'>
