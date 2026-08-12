import type {
  storeModuleEntitlementOrigins,
  storeModuleEntitlementStatuses,
} from '@/services/db/schema/store-module-entitlements'

export type StoreModuleEntitlementOrigin =
  (typeof storeModuleEntitlementOrigins)[number]

export type StoreModuleEntitlementStatus =
  (typeof storeModuleEntitlementStatuses)[number]

export type PlanModuleAccessInput = {
  code: string
  status: 'active' | 'inactive'
  startsAt?: Date | null
  endsAt?: Date | null
}

export type StoreModuleEntitlementInput = {
  code: string
  origin: StoreModuleEntitlementOrigin
  status: StoreModuleEntitlementStatus
  isAdditional: boolean
  startsAt?: Date | null
  endsAt?: Date | null
  revokedAt?: Date | null
}

export type EffectiveStoreModule = {
  code: string
  sources: StoreModuleEntitlementOrigin[]
  fromPlan: boolean
  isAdditional: boolean
}

export type EffectiveStoreModuleInput = {
  planModules: PlanModuleAccessInput[]
  storeEntitlements: StoreModuleEntitlementInput[]
  at?: Date
}

const isInsideValidityWindow = ({
  startsAt,
  endsAt,
  at,
}: {
  startsAt?: Date | null
  endsAt?: Date | null
  at: Date
}) => {
  if (startsAt && startsAt > at) {
    return false
  }

  if (endsAt && endsAt <= at) {
    return false
  }

  return true
}

export const isActivePlanModuleAccess = (
  module: PlanModuleAccessInput,
  at = new Date()
) =>
  module.status === 'active' &&
  isInsideValidityWindow({
    startsAt: module.startsAt,
    endsAt: module.endsAt,
    at,
  })

export const isActiveStoreModuleEntitlement = (
  entitlement: StoreModuleEntitlementInput,
  at = new Date()
) =>
  entitlement.status === 'active' &&
  !entitlement.revokedAt &&
  isInsideValidityWindow({
    startsAt: entitlement.startsAt,
    endsAt: entitlement.endsAt,
    at,
  })

export const getEffectiveStoreModules = ({
  planModules,
  storeEntitlements,
  at = new Date(),
}: EffectiveStoreModuleInput): EffectiveStoreModule[] => {
  const effectiveModules = new Map<string, EffectiveStoreModule>()

  for (const planModule of planModules) {
    if (!isActivePlanModuleAccess(planModule, at)) {
      continue
    }

    effectiveModules.set(planModule.code, {
      code: planModule.code,
      sources: ['plan'],
      fromPlan: true,
      isAdditional: false,
    })
  }

  for (const entitlement of storeEntitlements) {
    if (entitlement.origin === 'plan') {
      continue
    }

    if (!isActiveStoreModuleEntitlement(entitlement, at)) {
      continue
    }

    const current = effectiveModules.get(entitlement.code) ?? {
      code: entitlement.code,
      sources: [],
      fromPlan: false,
      isAdditional: false,
    }

    const sources = current.sources.includes(entitlement.origin)
      ? current.sources
      : [...current.sources, entitlement.origin]

    effectiveModules.set(entitlement.code, {
      ...current,
      sources,
      fromPlan: current.fromPlan,
      isAdditional: current.isAdditional || entitlement.isAdditional,
    })
  }

  return [...effectiveModules.values()].sort((left, right) =>
    left.code.localeCompare(right.code)
  )
}
