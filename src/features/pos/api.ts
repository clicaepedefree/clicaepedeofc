'use server'

import { validateUserPermissionsForStore } from '@/features/store/api'
import { InsertCounter } from '@/services/db/schema'

import { UseCaseError } from '@/shared/errors/use-case-error'
import { PermissionsError } from '../../shared/errors/permissions-error'
import { OpenCounterTemplate } from '../receipt/templates/open-counter'
import {
  closeCounterOnDb,
  createStoreCounterOnDb,
  getCounterByIdOnDb,
  listStoreCountersOnDb,
  openCounterOnDb,
  updateOpenCounterReceiptForSessionOnDb,
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

  if (counter?.currentSession?.status === 'OPEN') {
    console.warn('Session is currently opened. Aborting!')
    return
  }

  const newCounterSession = await openCounterOnDb({
    ...props,
    operatorId: user.id,
  })

  const newCounterReceipt = await OpenCounterTemplate.render({
    openedAt: newCounterSession.openedAt,
    openAmount: props.openAmount,
    openNotes: props.openNotes,
    operatorName: user.name ?? user.email,
    counterId: newCounterSession.counterId,
    counterName: counter.name,
  })

  const newCounterSessionWithReceipt =
    await updateOpenCounterReceiptForSessionOnDb({
      counterSessionId: newCounterSession.id,
      receipt: newCounterReceipt,
    })

  return newCounterSessionWithReceipt
}

export const closeCounter = async ({
  storeId,
  ...props
}: {
  storeId: number
  counterId: number
  closeAmount: string
  closeNotes: string | null
}) => {
  const { user } = await validateUserPermissionsForStore(storeId, 'admin')

  const counter = await getCounterByIdOnDb(props.counterId)

  if (counter?.storeId !== storeId)
    throw new PermissionsError({
      type: 'FORBIDDEN',
      message: 'Balcão não pertence a loja',
    })

  if (counter.currentSession?.status !== 'OPEN') {
    throw new UseCaseError({
      type: 'IMMUTABLE_STATE',
      message: 'Sessão do balcão não pode ser alterada por não estar aberta',
    })
  }

  await closeCounterOnDb({
    counterSessionId: counter.currentSession.id,
    closedByOperatorId: user.id,
    closeAmount: props.closeAmount,
    closeNotes: props.closeNotes,
  })
}
