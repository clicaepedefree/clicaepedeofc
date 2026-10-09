import { processWhatsappTransactionalQueue } from '@/features/whatsapp-bot/db'
import { authorizeWorkerRequest, jobAlreadyRunning, withScheduledJobLock } from '@/shared/lib/scheduled-job'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(request: Request) {
  const denied = authorizeWorkerRequest(request, 'whatsapp')
  if (denied) return denied
  return executeWhatsappJob()
}

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET
  const authorizationHeader = request.headers.get('authorization')

  if (!cronSecret) {
    return Response.json(
      {
        ok: false,
        error: 'CRON_SECRET is required to run WhatsApp transactional queue.',
      },
      { status: 500 }
    )
  }

  if (authorizationHeader !== `Bearer ${cronSecret}`) {
    return Response.json(
      { ok: false, error: 'Unauthorized WhatsApp transactional queue run.' },
      { status: 401 }
    )
  }

  return executeWhatsappJob()
}

async function executeWhatsappJob() {
  const execution = await withScheduledJobLock('whatsapp', async () => {
    const result = await processWhatsappTransactionalQueue({ limit: 5 })

    return Response.json({
      ok: result.discarded === 0 && result.failed === 0,
      ...result,
    })
  })

  return execution.acquired ? execution.result : jobAlreadyRunning()
}
