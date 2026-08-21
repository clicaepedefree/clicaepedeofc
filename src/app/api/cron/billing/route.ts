import { runRecurringBillingCycle } from '@/features/billing/recurring-billing'

export const runtime = 'nodejs'

const parseInvoiceLeadDays = () => {
  const value = Number(process.env.BILLING_INVOICE_LEAD_DAYS ?? 7)
  return Number.isFinite(value) ? value : 7
}

const parseRunLimit = () => {
  const value = Number(process.env.BILLING_RECURRING_RUN_LIMIT ?? 100)
  return Number.isFinite(value) ? value : 100
}

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET
  const authorization = request.headers.get('authorization')

  if (!cronSecret) {
    return Response.json(
      {
        ok: false,
        error: 'CRON_SECRET is required to run recurring billing safely.',
      },
      { status: 503 }
    )
  }

  if (authorization !== `Bearer ${cronSecret}`) {
    return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  const result = await runRecurringBillingCycle({
    invoiceLeadDays: parseInvoiceLeadDays(),
    limit: parseRunLimit(),
  })

  return Response.json({
    ok: result.failed === 0,
    ...result,
  })
}
