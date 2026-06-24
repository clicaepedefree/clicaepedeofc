'use server'

import { db } from '@/services/db'
import {
  InsertLegalEntity,
  legalEntitiesTable,
} from '@/services/db/schema/legal-entities'
import {
  InsertStoreCompanyProfile,
  storeCompanyProfilesTable,
} from '@/services/db/schema/store-company-profiles'
import { eq, sql } from 'drizzle-orm'

export const createLegalEntityOnDb = async (
  newLegalEntity: InsertLegalEntity
) => {
  const [createdLegalEntity] = await db
    .insert(legalEntitiesTable)
    .values(newLegalEntity)
    .returning()

  return createdLegalEntity
}

export const getStoreCompanyProfileOnDb = async (storeId: number) => {
  const [profile] = await db
    .select()
    .from(storeCompanyProfilesTable)
    .where(eq(storeCompanyProfilesTable.storeId, storeId))

  return profile ?? null
}

export const upsertStoreCompanyProfileOnDb = async (
  profile: InsertStoreCompanyProfile
) => {
  const [savedProfile] = await db
    .insert(storeCompanyProfilesTable)
    .values(profile)
    .onConflictDoUpdate({
      target: storeCompanyProfilesTable.storeId,
      set: {
        companyTaxNumber: profile.companyTaxNumber,
        companyName: profile.companyName,
        phone1: profile.phone1,
        phone2: profile.phone2,
        email: profile.email,
        responsibleName: profile.responsibleName,
        responsibleTaxNumber: profile.responsibleTaxNumber,
        responsiblePhone: profile.responsiblePhone,
        responsibleEmail: profile.responsibleEmail,
        postalCode: profile.postalCode,
        street: profile.street,
        number: profile.number,
        district: profile.district,
        city: profile.city,
        stateCode: profile.stateCode,
        updatedAt: sql`CURRENT_TIMESTAMP`,
      },
    })
    .returning()

  return savedProfile
}
