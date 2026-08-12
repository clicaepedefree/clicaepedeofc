import { billingModulesTable } from '@/services/db/schema/billing-modules'
import { billingPlanModulesTable } from '@/services/db/schema/billing-plan-modules'
import { billingPlansTable } from '@/services/db/schema/billing-plans'
import { storeModuleEntitlementsTable } from '@/services/db/schema/store-module-entitlements'
import { relations } from 'drizzle-orm'

export const billingModuleRelations = relations(
  billingModulesTable,
  ({ many }) => ({
    planModules: many(billingPlanModulesTable),
    storeEntitlements: many(storeModuleEntitlementsTable),
  })
)

export const billingPlanModuleRelations = relations(
  billingPlanModulesTable,
  ({ one, many }) => ({
    plan: one(billingPlansTable, {
      fields: [billingPlanModulesTable.planId],
      references: [billingPlansTable.id],
    }),
    module: one(billingModulesTable, {
      fields: [billingPlanModulesTable.moduleId],
      references: [billingModulesTable.id],
    }),
    storeEntitlements: many(storeModuleEntitlementsTable),
  })
)
