'use server'

import { InsertLegalEntity } from '@/services/db/schema/legal-entities'
import { InsertStoreCompanyProfile } from '@/services/db/schema/store-company-profiles'
import { validateUserPermissionsForStore } from '../store/api'
import {
  createLegalEntityOnDb,
  getStoreCompanyProfileOnDb,
  upsertStoreCompanyProfileOnDb,
} from './db'

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

export type StoreCompanyProfileInput = Omit<
  InsertStoreCompanyProfile,
  'storeId'
>

const toCompanyProfileInput = (
  profile: Awaited<ReturnType<typeof getStoreCompanyProfileOnDb>>
): StoreCompanyProfileInput | null => {
  if (!profile) return null

  return {
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
  }
}

export const getStoreCompanyProfile = async (storeId: number) => {
  await validateUserPermissionsForStore(storeId, 'admin')

  return toCompanyProfileInput(await getStoreCompanyProfileOnDb(storeId))
}

export const saveStoreCompanyProfile = async (
  storeId: number,
  profile: StoreCompanyProfileInput
) => {
  await validateUserPermissionsForStore(storeId, 'admin')

  return toCompanyProfileInput(
    await upsertStoreCompanyProfileOnDb({ storeId, ...profile })
  )
}
