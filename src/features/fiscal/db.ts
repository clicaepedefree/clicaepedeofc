import { db } from '@/services/db'
import {
  serviceInvoicesTable,
  type InsertServiceInvoice,
  type SelectServiceInvoice,
} from '@/services/db/schema/service-invoices'
import {
  storeAutoEmissionPaymentMethodsTable,
  type InsertStoreAutoEmissionPaymentMethod,
  type SelectStoreAutoEmissionPaymentMethod,
} from '@/services/db/schema/store-auto-emission-payment-methods'
import {
  storeFiscalConfigsTable,
  type InsertStoreFiscalConfig,
  type SelectStoreFiscalConfig,
} from '@/services/db/schema/store-fiscal-configs'
import { DbSession } from '@/services/db/types'
import { and, desc, eq, sql } from 'drizzle-orm'
import type { ReservedInvoiceNumber } from './types'

export const getFiscalConfigByStoreId = async (
  storeId: number
): Promise<SelectStoreFiscalConfig | null> => {
  const [config] = await db
    .select()
    .from(storeFiscalConfigsTable)
    .where(eq(storeFiscalConfigsTable.storeId, storeId))

  return config || null
}

export const createFiscalConfig = async (
  data: InsertStoreFiscalConfig
): Promise<SelectStoreFiscalConfig> => {
  const [config] = await db
    .insert(storeFiscalConfigsTable)
    .values(data)
    .returning()

  return config
}

export const updateFiscalConfig = async (
  storeId: number,
  data: Partial<InsertStoreFiscalConfig>
): Promise<SelectStoreFiscalConfig> => {
  const [config] = await db
    .update(storeFiscalConfigsTable)
    .set(data)
    .where(eq(storeFiscalConfigsTable.storeId, storeId))
    .returning()

  return config
}

export const upsertFiscalConfig = async (
  storeId: number,
  data: Partial<Omit<InsertStoreFiscalConfig, 'storeId'>>
): Promise<SelectStoreFiscalConfig> => {
  const existing = await getFiscalConfigByStoreId(storeId)

  if (existing) {
    return updateFiscalConfig(storeId, data)
  }

  return createFiscalConfig({ storeId, ...data })
}

export const reserveNextInvoiceNumber = async ({
  storeId,
  orderId,
  customerCpf,
  dbSession,
}: {
  storeId: number
  orderId: number
  customerCpf: string | null
  dbSession: DbSession
}): Promise<ReservedInvoiceNumber> => {
  const lockedConfigResult = await dbSession.execute<{
    id: number
    nfce_series: number
    next_nfce_number: number
  }>(
    sql`SELECT id, nfce_series, next_nfce_number
        FROM store_fiscal_configs
        WHERE store_id = ${storeId}
        FOR UPDATE`
  )

  const lockedConfigRows = lockedConfigResult as unknown as Array<{
    id: number
    nfce_series: number
    next_nfce_number: number
  }>

  if (lockedConfigRows.length === 0) {
    throw new Error(`Fiscal config not found for store ${storeId}`)
  }

  const config = lockedConfigRows[0]
  const series = config.nfce_series
  const invoiceNumber = config.next_nfce_number

  const [invoice] = await dbSession
    .insert(serviceInvoicesTable)
    .values({
      storeId,
      orderId,
      type: 'NFCE',
      series,
      invoiceNumber,
      status: 'pending',
      customerCpf,
    })
    .returning()

  await dbSession.execute(
    sql`UPDATE store_fiscal_configs
        SET next_nfce_number = ${invoiceNumber + 1},
            updated_at = CURRENT_TIMESTAMP
        WHERE store_id = ${storeId}`
  )

  return {
    invoiceId: invoice.id,
    series,
    invoiceNumber,
  }
}

export const updateServiceInvoice = async (
  invoiceId: number,
  data: Partial<InsertServiceInvoice>
): Promise<SelectServiceInvoice> => {
  const [invoice] = await db
    .update(serviceInvoicesTable)
    .set(data)
    .where(eq(serviceInvoicesTable.id, invoiceId))
    .returning()

  return invoice
}

export const getServiceInvoiceById = async (
  invoiceId: number
): Promise<SelectServiceInvoice | null> => {
  const [invoice] = await db
    .select()
    .from(serviceInvoicesTable)
    .where(eq(serviceInvoicesTable.id, invoiceId))

  return invoice || null
}

export const getServiceInvoicesByOrderId = async (
  orderId: number
): Promise<SelectServiceInvoice[]> => {
  return await db
    .select()
    .from(serviceInvoicesTable)
    .where(eq(serviceInvoicesTable.orderId, orderId))
    .orderBy(desc(serviceInvoicesTable.createdAt))
}

export const getServiceInvoicesByStoreId = async (
  storeId: number,
  limit = 50
): Promise<SelectServiceInvoice[]> => {
  return await db
    .select()
    .from(serviceInvoicesTable)
    .where(eq(serviceInvoicesTable.storeId, storeId))
    .orderBy(desc(serviceInvoicesTable.createdAt))
    .limit(limit)
}

export const getAutoEmissionMethodsByStoreId = async (
  storeId: number
): Promise<SelectStoreAutoEmissionPaymentMethod[]> => {
  return await db
    .select()
    .from(storeAutoEmissionPaymentMethodsTable)
    .where(eq(storeAutoEmissionPaymentMethodsTable.storeId, storeId))
}

export const createAutoEmissionMethod = async (
  data: InsertStoreAutoEmissionPaymentMethod
): Promise<SelectStoreAutoEmissionPaymentMethod> => {
  const [method] = await db
    .insert(storeAutoEmissionPaymentMethodsTable)
    .values(data)
    .returning()

  return method
}

export const deleteAutoEmissionMethod = async (
  storeId: number,
  paymentMethod: string
): Promise<void> => {
  await db
    .delete(storeAutoEmissionPaymentMethodsTable)
    .where(
      and(
        eq(storeAutoEmissionPaymentMethodsTable.storeId, storeId),
        eq(
          storeAutoEmissionPaymentMethodsTable.paymentMethod,
          paymentMethod as InsertStoreAutoEmissionPaymentMethod['paymentMethod']
        )
      )
    )
}

export const setAutoEmissionMethods = async (
  storeId: number,
  paymentMethods: string[]
): Promise<SelectStoreAutoEmissionPaymentMethod[]> => {
  await db
    .delete(storeAutoEmissionPaymentMethodsTable)
    .where(eq(storeAutoEmissionPaymentMethodsTable.storeId, storeId))

  if (paymentMethods.length === 0) {
    return []
  }

  const values = paymentMethods.map(paymentMethod => ({
    storeId,
    paymentMethod: paymentMethod as InsertStoreAutoEmissionPaymentMethod['paymentMethod'],
  }))

  return await db
    .insert(storeAutoEmissionPaymentMethodsTable)
    .values(values)
    .returning()
}
