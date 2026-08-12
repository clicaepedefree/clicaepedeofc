import { billingModulesTable } from '@/services/db/schema/billing-modules'
import { billingPlanModulesTable } from '@/services/db/schema/billing-plan-modules'
import { billingPlansTable } from '@/services/db/schema/billing-plans'
import { storesTable } from '@/services/db/schema/stores'
import { storeModuleEntitlementsTable } from '@/services/db/schema/store-module-entitlements'
import { storeSubscriptionsTable } from '@/services/db/schema/store-subscriptions'
import { relations } from 'drizzle-orm'

export const storeModuleEntitlementRelations = relations(
  storeModuleEntitlementsTable,
  ({ one }) => ({
    store: one(storesTable, {
      fields: [storeModuleEntitlementsTable.storeId],
      references: [storesTable.id],
    }),
    module: one(billingModulesTable, {
      fields: [storeModuleEntitlementsTable.moduleId],
      references: [billingModulesTable.id],
    }),
    subscription: one(storeSubscriptionsTable, {
      fields: [storeModuleEntitlementsTable.subscriptionId],
      references: [storeSubscriptionsTable.id],
    }),
    plan: one(billingPlansTable, {
      fields: [storeModuleEntitlementsTable.planId],
      references: [billingPlansTable.id],
    }),
    planModule: one(billingPlanModulesTable, {
      fields: [storeModuleEntitlementsTable.planModuleId],
      references: [billingPlanModulesTable.id],
    }),
  })
)
