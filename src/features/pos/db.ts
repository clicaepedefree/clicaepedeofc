import { db } from '@/services/db'
import {
  counterSessionsTable,
  countersTable,
  InsertCounter,
  usersTable,
} from '@/services/db/schema'
import { getSubQueryColumns } from '@/services/db/utils'
import { and, desc, eq, getTableColumns, sql } from 'drizzle-orm'
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
}) =>
  await db
    .update(counterSessionsTable)
    .set({ ...props, status: 'CLOSED', closedAt: sql`CURRENT_TIMESTAMP` })
    .where(eq(counterSessionsTable.id, counterSessionId))
    .returning()
