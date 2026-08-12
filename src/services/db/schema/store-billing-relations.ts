import { billingPlansTable } from '@/services/db/schema/billing-plans'
import { billingPlanModulesTable } from '@/services/db/schema/billing-plan-modules'
import { storesTable } from '@/services/db/schema/stores'
import { storeBillingEventsTable } from '@/services/db/schema/store-billing-events'
import { storeBillingInvoicesTable } from '@/services/db/schema/store-billing-invoices'
import { storeBillingPaymentsTable } from '@/services/db/schema/store-billing-payments'
import { storeSubscriptionsTable } from '@/services/db/schema/store-subscriptions'
import { relations } from 'drizzle-orm'

export const billingPlanRelations = relations(
  billingPlansTable,
  ({ many }) => ({
    modules: many(billingPlanModulesTable),
    subscriptions: many(storeSubscriptionsTable),
    invoices: many(storeBillingInvoicesTable),
  })
)

export const storeSubscriptionRelations = relations(
  storeSubscriptionsTable,
  ({ one, many }) => ({
    store: one(storesTable, {
      fields: [storeSubscriptionsTable.storeId],
      references: [storesTable.id],
    }),
    plan: one(billingPlansTable, {
      fields: [storeSubscriptionsTable.planId],
      references: [billingPlansTable.id],
    }),
    invoices: many(storeBillingInvoicesTable),
    events: many(storeBillingEventsTable),
  })
)

export const storeBillingInvoiceRelations = relations(
  storeBillingInvoicesTable,
  ({ one, many }) => ({
    store: one(storesTable, {
      fields: [storeBillingInvoicesTable.storeId],
      references: [storesTable.id],
    }),
    subscription: one(storeSubscriptionsTable, {
      fields: [storeBillingInvoicesTable.subscriptionId],
      references: [storeSubscriptionsTable.id],
    }),
    plan: one(billingPlansTable, {
      fields: [storeBillingInvoicesTable.planId],
      references: [billingPlansTable.id],
    }),
    payments: many(storeBillingPaymentsTable),
    events: many(storeBillingEventsTable),
  })
)

export const storeBillingPaymentRelations = relations(
  storeBillingPaymentsTable,
  ({ one, many }) => ({
    store: one(storesTable, {
      fields: [storeBillingPaymentsTable.storeId],
      references: [storesTable.id],
    }),
    invoice: one(storeBillingInvoicesTable, {
      fields: [storeBillingPaymentsTable.invoiceId],
      references: [storeBillingInvoicesTable.id],
    }),
    events: many(storeBillingEventsTable),
  })
)

export const storeBillingEventRelations = relations(
  storeBillingEventsTable,
  ({ one }) => ({
    store: one(storesTable, {
      fields: [storeBillingEventsTable.storeId],
      references: [storesTable.id],
    }),
    subscription: one(storeSubscriptionsTable, {
      fields: [storeBillingEventsTable.subscriptionId],
      references: [storeSubscriptionsTable.id],
    }),
    invoice: one(storeBillingInvoicesTable, {
      fields: [storeBillingEventsTable.invoiceId],
      references: [storeBillingInvoicesTable.id],
    }),
    payment: one(storeBillingPaymentsTable, {
      fields: [storeBillingEventsTable.paymentId],
      references: [storeBillingPaymentsTable.id],
    }),
  })
)
