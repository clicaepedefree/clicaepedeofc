'use server'

import { validateUserPermissionsForStore } from '@/features/store/api'
import { InsertCounter } from '@/services/db/schema'

import { PermissionsError } from '../store/errors'
import {
  createStoreCounterOnDb,
  getCounterByIdOnDb,
  listStoreCountersOnDb,
  openCounterOnDb,
} from './db'

export const listCounters = async (storeId: number) => {
  await validateUserPermissionsForStore(storeId, 'admin')

  return await listStoreCountersOnDb({ storeId })
}

export const createCounter = async (newCounter: InsertCounter) => {
  await validateUserPermissionsForStore(newCounter.storeId, 'admin')

  await createStoreCounterOnDb(newCounter)
}

export const openCounter = async ({
  storeId,
  ...props
}: {
  storeId: number
  counterId: number
  openAmount: string
  openNotes: string | null
}) => {
  const { user } = await validateUserPermissionsForStore(storeId, 'admin')

  const counter = await getCounterByIdOnDb(props.counterId)

  if (counter?.storeId !== storeId)
    throw new PermissionsError({
      type: 'FORBIDDEN',
      message: 'Balcão não pertence a loja',
    })

  if (counter?.currentSession && counter.currentSession.status === 'OPEN') {
    console.warn('Session is currently opened. Aborting!')
    return
  }

  await openCounterOnDb({ ...props, operatorId: user.id })
}
