'use server'

import { db } from '@/services/db'
import {
  counterSessionsTable,
  countersTable,
  InsertCounter,
  ordersTable,
  SelectCounterSession,
  usersTable,
} from '@/services/db/schema'
import { orderPaymentsTable } from '@/services/db/schema/order-payments'
import { getSubQueryColumns, groupingSets } from '@/services/db/utils'
import {
  and,
  count,
  desc,
  eq,
  getTableColumns,
  gte,
  isNull,
  lte,
  or,
  sql,
  sum,
} from 'drizzle-orm'
import { unionAll } from 'drizzle-orm/pg-core'
import { UserId } from '../user/types'

const currentCounterSessionSubQuery = db
  .select()
  .from(counterSessionsTable)
  .where(eq(countersTable.id, counterSessionsTable.counterId))
  .orderBy(desc(counterSessionsTable.id))
  .limit(1)
  .as('currentCounterSessionSubQuery')

const listCountersQuery = ({
  storeId,
  counterId,
}: {
  storeId?: number
  counterId?: number
}) =>
  db
    .select({
      ...getTableColumns(countersTable),
      isInService: sql<boolean>`${currentCounterSessionSubQuery.status} = 'OPEN'`,
      currentSession: {
        ...getSubQueryColumns(currentCounterSessionSubQuery),
        operatorName: usersTable.name,
        operatorEmail: usersTable.email,
      },
    })
    .from(countersTable)
    .leftJoinLateral(currentCounterSessionSubQuery, sql`true`)
    .leftJoin(
      usersTable,
      eq(usersTable.id, currentCounterSessionSubQuery.operatorId)
    )
    .where(
      and(
        storeId ? eq(countersTable.storeId, storeId) : undefined,
        counterId ? eq(countersTable.id, counterId) : undefined
      )
    )
    .orderBy(countersTable.id)

export const listStoreCountersOnDb = async ({ storeId }: { storeId: number }) =>
  await listCountersQuery({ storeId })

export const createStoreCounterOnDb = async (newCounter: InsertCounter) =>
  await db.insert(countersTable).values(newCounter)

export const getCounterByIdOnDb = async (counterId: number) => {
  const [counter] = await listCountersQuery({ counterId })
  return counter as typeof counter | undefined
}

export const getCounterSessionByIdOnDb = async (counterSessionId: number) => {
  const [counterSession] = await db
    .select({
      ...getTableColumns(counterSessionsTable),
      counter: {
        ...getTableColumns(countersTable),
      },
    })
    .from(counterSessionsTable)
    .leftJoin(
      countersTable,
      eq(countersTable.id, counterSessionsTable.counterId)
    )
    .where(eq(counterSessionsTable.id, counterSessionId))
    .limit(1)
  return counterSession as typeof counterSession | undefined
}

export const openCounterOnDb = async (props: {
  counterId: number
  operatorId: UserId
  openAmount: string
  openNotes: string | null
}) => {
  const result = await db.insert(counterSessionsTable).values(props).returning()

  return result[0]
}

export const updateOpenCounterReceiptForSessionOnDb = async ({
  counterSessionId,
  receipt,
}: {
  counterSessionId: number
  receipt: string
}) => {
  const result = await db
    .update(counterSessionsTable)
    .set({ openReceipt: receipt })
    .where(eq(counterSessionsTable.id, counterSessionId))
    .returning()

  return result[0]
}

export const closeCounterOnDb = async ({
  counterSessionId,
  ...props
}: {
  counterSessionId: number
  closedByOperatorId: UserId
  closeAmount: string
  closeNotes: string | null
}): Promise<
  NonNullableBy<SelectCounterSession, 'closedAt' | 'closedByOperatorId'>
> => {
  const result = await db
    .update(counterSessionsTable)
    .set({ ...props, status: 'CLOSED', closedAt: sql`CURRENT_TIMESTAMP` })
    .where(eq(counterSessionsTable.id, counterSessionId))
    .returning()

  return result[0]
}

export const updateCloseCounterReceiptForSessionOnDb = async ({
  counterSessionId,
  receipt,
}: {
  counterSessionId: number
  receipt: string
}) => {
  const result = await db
    .update(counterSessionsTable)
    .set({ closeReceipt: receipt })
    .where(eq(counterSessionsTable.id, counterSessionId))
    .returning()

  return result[0]
}

export const calculateCounterSessionSummary = async (
  counterSessionId: number
) => {
  const ordersAndPaymentsTempTable = db.$with('ordersAndPaymentsTempTable').as(
    db
      .select({
        ...getTableColumns(ordersTable),
        paymentValue: orderPaymentsTable.value,
        paymentMethod: orderPaymentsTable.method,
      })
      .from(ordersTable)
      .leftJoin(
        orderPaymentsTable,
        eq(orderPaymentsTable.orderId, ordersTable.id)
      )
      .leftJoin(
        counterSessionsTable,
        eq(counterSessionsTable.id, counterSessionId)
      )
      .where(
        and(
          eq(ordersTable.posCounterId, counterSessionsTable.counterId),
          gte(ordersTable.createdAt, counterSessionsTable.openedAt),
          or(
            isNull(counterSessionsTable.closedAt),
            lte(ordersTable.createdAt, counterSessionsTable.closedAt)
          )
        )
      )
  )

  const groupingColumns = {
    paymentMethod: ordersAndPaymentsTempTable.paymentMethod,
    salesChannel: ordersAndPaymentsTempTable.salesChannel,
    type: ordersAndPaymentsTempTable.type,
  }

  const { sql: groupingSetsSQL, makeNullable } = groupingSets(
    ordersAndPaymentsTempTable.paymentMethod,
    ordersAndPaymentsTempTable.salesChannel,
    ordersAndPaymentsTempTable.type
  )

  const query = db
    .with(ordersAndPaymentsTempTable)
    .select({
      ...makeNullable(groupingColumns),
      ordersCount: count(ordersAndPaymentsTempTable.id).as('ordersCount'),
      total: sum(ordersAndPaymentsTempTable.paymentValue).as('total'),
    })
    .from(ordersAndPaymentsTempTable)
    .groupBy(groupingSetsSQL)

  console.log(query.toSQL())

  const result = await query
  return result
}
