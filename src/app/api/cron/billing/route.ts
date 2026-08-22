import { runBillingDelinquencyAccessBlockCycle } from '@/features/billing/billing-delinquency-blocks'
import { runBillingReminderCycle } from '@/features/billing/billing-reminders'
import {
  processBillingGatewayWebhookQueue,
  runBillingGatewayReconciliationCycle,
} from '@/features/billing/gateway-webhooks'
import { runRecurringBillingCycle } from '@/features/billing/recurring-billing'
import { applyDueStoreSubscriptionPlanChanges } from '@/features/internal-operations/db'
import {
  authorizeBillingCronRequest,
  isBillingCronRunSuccessful,
  resolveBillingCronConfig,
} from '@/features/billing/billing-cron-policy'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  const authorization = authorizeBillingCronRequest({
    cronSecret: process.env.CRON_SECRET,
    authorizationHeader: request.headers.get('authorization'),
  })

  if (!authorization.authorized) {
    return Response.json(
      { ok: false, error: authorization.error },
      { status: authorization.status }
    )
  }

  const config = resolveBillingCronConfig()

  const result = await runRecurringBillingCycle({
    invoiceLeadDays: config.invoiceLeadDays,
    limit: config.runLimit,
  })
  const planChanges = await applyDueStoreSubscriptionPlanChanges({
    limit: config.runLimit,
  })
  const reminders = await runBillingReminderCycle({
    limit: config.runLimit,
  })
  const delinquencyBlocks = await runBillingDelinquencyAccessBlockCycle({
    limit: config.runLimit,
  })
  const gatewayWebhooks = await processBillingGatewayWebhookQueue({
    limit: config.runLimit,
  })
  const gatewayReconciliation = await runBillingGatewayReconciliationCycle({
    limit: config.runLimit,
  })

  return Response.json({
    ok: isBillingCronRunSuccessful({
      recurring: result,
      planChanges,
      reminders,
      delinquencyBlocks,
      gatewayWebhooks,
      gatewayReconciliation,
    }),
    recurring: result,
    planChanges,
    reminders,
    delinquencyBlocks,
    gatewayWebhooks,
    gatewayReconciliation,
  })
}
