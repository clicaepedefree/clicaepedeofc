'use server'

import { validateUserPermissionsForStore } from '@/features/store/api'
import { InsertCounter } from '@/services/db/schema'

import { UseCaseError } from '@/shared/errors/use-case-error'
import {
  formatValueToCurrency,
  getValueFromCurrencyString,
} from '@/shared/formatters/currency'
import { PermissionsError } from '../../shared/errors/permissions-error'
import { CloseCounterTemplate } from '../receipt/templates/close-counter'
import { OpenCounterTemplate } from '../receipt/templates/open-counter'
import {
  calculateCounterSessionSummary,
  closeCounterOnDb,
  createStoreCounterOnDb,
  getCounterByIdOnDb,
  getCounterSessionByIdOnDb,
  listStoreCountersOnDb,
  openCounterOnDb,
  updateCloseCounterReceiptForSessionOnDb,
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
      message: 'Caixa não pertence a loja',
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
      message: 'Caixa não pertence a loja',
    })

  if (counter.currentSession?.status !== 'OPEN') {
    throw new UseCaseError({
      type: 'IMMUTABLE_STATE',
      message: 'Sessão do caixa não pode ser alterada por não estar aberta',
    })
  }

  const closedCounterSession = await closeCounterOnDb({
    counterSessionId: counter.currentSession.id,
    closedByOperatorId: user.id,
    closeAmount: props.closeAmount,
    closeNotes: props.closeNotes,
  })

  const closedCounterReceipt = await CloseCounterTemplate.render({
    openedAt: closedCounterSession.openedAt,
    closedAt: closedCounterSession.closedAt!,
    openAmount: closedCounterSession.openAmount,
    closeAmount: props.closeAmount,
    closeNotes: props.closeNotes,
    operatorName: user.name ?? user.email,
    counterId: closedCounterSession.counterId,
    counterName: counter.name,
  })

  const closedCounterSessionWithReceipt =
    await updateCloseCounterReceiptForSessionOnDb({
      counterSessionId: closedCounterSession.id,
      receipt: closedCounterReceipt,
    })

  return closedCounterSessionWithReceipt
}

export const getCounterSessionSummary = async ({
  storeId,
  counterId,
  counterSessionId,
}: {
  storeId: number
  counterId: number
  counterSessionId: number
}) => {
  await validateUserPermissionsForStore(storeId, 'admin')
  const counterSession = await getCounterSessionByIdOnDb(counterSessionId)

  if (counterSession?.counter?.storeId !== storeId)
    throw new PermissionsError({
      type: 'FORBIDDEN',
      message: 'Caixa não pertence a loja',
    })

  if (counterSession.counter.id !== counterId) {
    throw new UseCaseError({
      type: 'NOT_FOUND',
      message: 'Sessão do caixa não encontrada',
    })
  }

  const counterSessionSummary =
    await calculateCounterSessionSummary(counterSessionId)

  const expectedCashLeft =
    getValueFromCurrencyString(counterSession.openAmount) +
    getValueFromCurrencyString(
      counterSessionSummary.paymentMethod?.CASH?.total ?? '0'
    )

  const totalSummary = Object.values(
    counterSessionSummary?.orderType ?? {}
  ).reduce(
    (acc, { total, ordersCount }) => {
      acc.ordersCount += ordersCount
      acc.total += getValueFromCurrencyString(total ?? '0')
      return acc
    },
    {
      ordersCount: 0,
      total: 0,
    }
  )

  return {
    categoriesSummary: counterSessionSummary,
    expectedCashLeft: formatValueToCurrency({
      value: expectedCashLeft,
      decimalPlaces: 4,
    }),
    totalSummary: {
      ordersCount: totalSummary.ordersCount,
      total: formatValueToCurrency({
        value: totalSummary.total,
        decimalPlaces: 4,
      }),
    },
  }
}
