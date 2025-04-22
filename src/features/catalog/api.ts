import { db } from '@/services/db'
import { categoriesTable } from '@/services/db/schema/categories'
import { InsertCategory } from '@/services/db/schema/categories'

export const createCategory = async (newCategory: InsertCategory) => {
  return await db.insert(categoriesTable).values(newCategory).returning()
}
