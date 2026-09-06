import { type EvolutionQrCode } from '@/features/whatsapp-bot/evolution-client'
import { parseEvolutionInboundMessagePayload } from '@/features/whatsapp-bot/contact-ingestion-policy'
import {
  applyEvolutionSessionEvent,
  processWhatsappInboundMessage,
} from '@/features/whatsapp-bot/db'
import { assertWhatsappWebhookAuthorized } from '@/features/whatsapp-bot/session-policy'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function readInstanceName(payload: any) {
  return (
    payload?.instance?.instanceName ??
    payload?.instance?.name ??
    payload?.instanceName ??
    payload?.instance ??
    payload?.sender ??
    null
  )
}

function readState(payload: any) {
  return (
    payload?.data?.state ??
    payload?.data?.connection ??
    payload?.instance?.state ??
    payload?.instance?.status ??
    payload?.state ??
    payload?.connectionStatus ??
    null
  )
}

function readReason(payload: any) {
  return (
    payload?.data?.reason ??
    payload?.data?.statusReason ??
    payload?.reason ??
    payload?.statusReason ??
    payload?.error ??
    null
  )
}

function readQrCode(payload: any): EvolutionQrCode | null {
  const candidate = payload?.data?.qrcode ?? payload?.qrcode ?? payload?.qrCode
  const base64 =
    typeof candidate === 'string'
      ? candidate
      : (candidate?.base64 ?? candidate?.code ?? null)

  if (!base64) return null

  return {
    base64,
    count: typeof candidate?.count === 'number' ? candidate.count : null,
  }
}

export async function POST(request: Request) {
  const authorized = assertWhatsappWebhookAuthorized({
    authorizationHeader: request.headers.get('authorization'),
    explicitSecretHeader: request.headers.get('x-clica-webhook-secret'),
    expectedSecret: process.env.WHATSAPP_EVOLUTION_WEBHOOK_SECRET,
  })

  if (!authorized) {
    return NextResponse.json(
      { accepted: false, reason: 'invalid_signature' },
      { status: 401 }
    )
  }

  let payload: unknown
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json(
      { accepted: false, reason: 'malformed_payload' },
      { status: 400 }
    )
  }
  const instanceName = readInstanceName(payload)

  if (typeof instanceName !== 'string' || !instanceName) {
    return NextResponse.json(
      { accepted: false, reason: 'missing_instance' },
      { status: 400 }
    )
  }

  try {
    const inboundMessage = parseEvolutionInboundMessagePayload(payload)

    if (inboundMessage) {
      const result = await processWhatsappInboundMessage({
        instanceName,
        ...inboundMessage,
        rawPayload: payload,
      })

      return NextResponse.json(
        {
          accepted: true,
          contact: {
            id: result.contact.id,
            storeId: result.contact.storeId,
            phoneNumber: result.contact.phoneNumber,
            promotionalOptOutAt: result.contact.promotionalOptOutAt,
          },
          conversation: {
            id: result.conversation.id,
            status: result.conversation.status,
          },
          messageCreated: result.messageCreated,
        },
        { status: result.messageCreated ? 202 : 200 }
      )
    }

    const session = await applyEvolutionSessionEvent({
      instanceName,
      state: readState(payload),
      reason: readReason(payload),
      qrCode: readQrCode(payload),
      rawPayload: payload,
    })

    return NextResponse.json({ accepted: true, session }, { status: 202 })
  } catch (error) {
    console.error('[whatsapp-bot] Failed to process Evolution webhook', error)

    return NextResponse.json(
      { accepted: false, reason: 'processing_error' },
      { status: 500 }
    )
  }
}
