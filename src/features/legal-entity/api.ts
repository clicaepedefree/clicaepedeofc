'use server'

import { InsertLegalEntity } from '@/services/db/schema/legal-entities'
import { validateUserPermissionsForStore } from '../store/api'
import { createLegalEntityOnDb } from './db'

export const createLegalEntity = async (
  newLegalEntity: InsertLegalEntity & { storeId: number }
) => {
  const { user } = await validateUserPermissionsForStore(
    newLegalEntity.storeId,
    'admin'
  )

  const createdLegalEntity = await createLegalEntityOnDb({
    ...newLegalEntity,
    createdBy: user.id,
  })

  return createdLegalEntity
}
