import { createdAt, updatedAt } from '@/services/db/schema/utils'
import { integer, pgEnum, pgTable, serial, text } from 'drizzle-orm/pg-core'
import { ordersTable } from './orders'
import { storesTable } from './stores'

export const serviceInvoiceTypeEnum = pgEnum('service_invoice_type', ['NFCE'])

export const serviceInvoiceStatusEnum = pgEnum('service_invoice_status', [
  'pending',
  'processing',
  'issued',
  'error',
  'cancelled',
])

export const serviceInvoicesTable = pgTable('service_invoices', {
  id: serial('id').primaryKey(),
  storeId: integer('store_id')
    .notNull()
    .references(() => storesTable.id, { onDelete: 'cascade' }),
  orderId: integer('order_id')
    .notNull()
    .references(() => ordersTable.id, { onDelete: 'cascade' }),
  type: serviceInvoiceTypeEnum('type').notNull().default('NFCE'),
  series: integer('series').notNull(),
  invoiceNumber: integer('invoice_number').notNull(),
  nfeioInvoiceId: text('nfeio_invoice_id'),
  status: serviceInvoiceStatusEnum('status').notNull().default('pending'),
  customerCpf: text('customer_cpf'),
  pdfUrl: text('pdf_url'),
  xmlUrl: text('xml_url'),
  errorMessage: text('error_message'),
  createdAt,
  updatedAt,
})

export type InsertServiceInvoice = Omit<
  typeof serviceInvoicesTable.$inferInsert,
  'id' | 'createdAt' | 'updatedAt'
>
export type SelectServiceInvoice = typeof serviceInvoicesTable.$inferSelect
