import { processWhatsappTransactionalQueue } from '@/features/whatsapp-bot/db'

export const runtime = 'nodejs'

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

  const result = await processWhatsappTransactionalQueue()

  return Response.json({
    ok: result.discarded === 0,
    ...result,
  })
}
