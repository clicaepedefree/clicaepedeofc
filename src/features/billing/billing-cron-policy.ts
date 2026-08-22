export type BillingCronCycleResult = {
  failed: number
}

export type BillingCronReconciliationResult = {
  divergences: number
}

export type BillingCronAuthorizationResult =
  | { authorized: true }
  | { authorized: false; status: 401 | 503; error: string }

export const defaultBillingInvoiceLeadDays = 7
export const maxBillingInvoiceLeadDays = 60
export const defaultBillingCronRunLimit = 100
export const maxBillingCronRunLimit = 500

export function parseBillingCronInteger({
  value,
  fallback,
  min,
  max,
}: {
  value: string | number | null | undefined
  fallback: number
  min?: number
  max?: number
}) {
  const parsed = Number(value ?? fallback)
  if (!Number.isFinite(parsed)) return fallback

  const normalized = Math.trunc(parsed)
  if (min !== undefined && normalized < min) return fallback

  return max ? Math.min(normalized, max) : normalized
}

export function resolveBillingCronConfig(env: NodeJS.ProcessEnv = process.env) {
  return {
    invoiceLeadDays: parseBillingCronInteger({
      value: env.BILLING_INVOICE_LEAD_DAYS,
      fallback: defaultBillingInvoiceLeadDays,
      min: 0,
      max: maxBillingInvoiceLeadDays,
    }),
    runLimit: parseBillingCronInteger({
      value: env.BILLING_RECURRING_RUN_LIMIT,
      fallback: defaultBillingCronRunLimit,
      min: 1,
      max: maxBillingCronRunLimit,
    }),
  }
}

export function authorizeBillingCronRequest({
  cronSecret,
  authorizationHeader,
}: {
  cronSecret: string | null | undefined
  authorizationHeader: string | null
}): BillingCronAuthorizationResult {
  if (!cronSecret) {
    return {
      authorized: false,
      status: 503,
      error: 'CRON_SECRET is required to run recurring billing safely.',
    }
  }

  if (authorizationHeader !== `Bearer ${cronSecret}`) {
    return { authorized: false, status: 401, error: 'Unauthorized' }
  }

  return { authorized: true }
}

export function isBillingCronRunSuccessful({
  recurring,
  planChanges,
  reminders,
  delinquencyBlocks,
  gatewayWebhooks,
  gatewayReconciliation,
}: {
  recurring: BillingCronCycleResult
  planChanges: BillingCronCycleResult
  reminders: BillingCronCycleResult
  delinquencyBlocks: BillingCronCycleResult
  gatewayWebhooks: BillingCronCycleResult
  gatewayReconciliation: BillingCronReconciliationResult
}) {
  return (
    recurring.failed === 0 &&
    planChanges.failed === 0 &&
    reminders.failed === 0 &&
    delinquencyBlocks.failed === 0 &&
    gatewayWebhooks.failed === 0 &&
    gatewayReconciliation.divergences === 0
  )
}
