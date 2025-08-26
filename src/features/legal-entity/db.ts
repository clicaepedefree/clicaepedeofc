'use server'

import { db } from '@/services/db'
import {
  InsertLegalEntity,
  legalEntitiesTable,
} from '@/services/db/schema/legal-entities'

export const createLegalEntityOnDb = async (
  newLegalEntity: InsertLegalEntity
) => {
  const [createdLegalEntity] = await db
    .insert(legalEntitiesTable)
    .values(newLegalEntity)
    .returning()

  return createdLegalEntity
}
