import { db } from '@/services/db'
import {
  counterSessionsTable,
  countersTable,
  InsertCounter,
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
      isAvailable: sql<boolean>`${currentCounterSessionSubQuery.id} IS NULL OR ${currentCounterSessionSubQuery.status} != 'OPEN'`,
      currentSession: getSubQueryColumns(currentCounterSessionSubQuery),
    })
    .from(countersTable)
    .leftJoinLateral(currentCounterSessionSubQuery, sql`true`)
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
}) => await db.insert(counterSessionsTable).values(props).returning()

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
