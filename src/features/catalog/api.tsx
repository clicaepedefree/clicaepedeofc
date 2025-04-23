import { InsertCategory } from '@/services/db/schema/categories'
import { createCategoryOnDb } from '@/features/catalog/db'
import { getNextCategoryIndex } from '@/features/catalog/db'

export const createCategory = async (newCategory: PartialBy<InsertCategory, 'index'>) => {
  const categoryIndex = newCategory.index ?? (await getNextCategoryIndex(newCategory.storeId))

  return await createCategoryOnDb({ ...newCategory, index: categoryIndex })
}
