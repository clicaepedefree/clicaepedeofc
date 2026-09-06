type EvolutionRequestOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
  token?: string | null
  body?: unknown
}

export type EvolutionQrCode = {
  base64: string | null
  count: number | null
}

export type EvolutionInstanceResult = {
  instanceName: string
  instanceId: string | null
  token: string | null
  state: string | null
  qrCode: EvolutionQrCode | null
  raw: unknown
}

export type EvolutionConnectionStateResult = {
  instanceName: string | null
  state: string | null
  raw: unknown
}

export type EvolutionSendTextResult = {
  providerMessageId: string | null
  status: string | null
  raw: unknown
}

export type EvolutionClient = {
  createInstance(input: {
    instanceName: string
    webhookUrl: string
    webhookSecret?: string
  }): Promise<EvolutionInstanceResult>
  connectInstance(input: {
    instanceName: string
    token?: string | null
  }): Promise<EvolutionInstanceResult>
  getConnectionState(input: {
    instanceName: string
    token?: string | null
  }): Promise<EvolutionConnectionStateResult>
  restartInstance(input: {
    instanceName: string
    token?: string | null
  }): Promise<EvolutionConnectionStateResult>
  logoutInstance(input: {
    instanceName: string
    token?: string | null
  }): Promise<EvolutionConnectionStateResult>
  sendTextMessage(input: {
    instanceName: string
    token?: string | null
    number: string
    text: string
  }): Promise<EvolutionSendTextResult>
}

export class EvolutionApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly payload: string
  ) {
    super(message)
    this.name = 'EvolutionApiError'
  }
}

const stripTrailingSlash = (value: string) => value.replace(/\/+$/, '')

function resolveEvolutionConfig() {
  const baseUrl = process.env.WHATSAPP_EVOLUTION_API_BASE_URL?.trim()
  const apiKey = process.env.WHATSAPP_EVOLUTION_API_KEY?.trim()

  if (!baseUrl) {
    throw new Error('WHATSAPP_EVOLUTION_API_BASE_URL is not configured')
  }

  if (!apiKey) {
    throw new Error('WHATSAPP_EVOLUTION_API_KEY is not configured')
  }

  return {
    baseUrl: stripTrailingSlash(baseUrl),
    apiKey,
  }
}

function readInstanceName(payload: any) {
  return (
    payload?.instance?.instanceName ??
    payload?.instance?.name ??
    payload?.instanceName ??
    payload?.name ??
    null
  )
}

function readInstanceId(payload: any) {
  return (
    payload?.instance?.instanceId ??
    payload?.instance?.id ??
    payload?.id ??
    null
  )
}

function readInstanceState(payload: any) {
  return (
    payload?.instance?.state ??
    payload?.instance?.status ??
    payload?.instance?.connectionStatus ??
    payload?.state ??
    payload?.connectionStatus ??
    null
  )
}

function readQrCode(payload: any): EvolutionQrCode | null {
  const qrcode = payload?.qrcode ?? payload?.qrCode ?? payload?.base64
  const base64 =
    typeof qrcode === 'string'
      ? qrcode
      : (qrcode?.base64 ?? qrcode?.code ?? null)

  if (!base64) return null

  return {
    base64,
    count:
      typeof qrcode?.count === 'number'
        ? qrcode.count
        : typeof payload?.qrcode?.count === 'number'
          ? payload.qrcode.count
          : null,
  }
}

function normalizeInstanceResult(payload: unknown): EvolutionInstanceResult {
  const raw = payload as any

  return {
    instanceName: readInstanceName(raw) ?? '',
    instanceId: readInstanceId(raw),
    token: raw?.hash ?? raw?.token ?? raw?.instance?.token ?? null,
    state: readInstanceState(raw),
    qrCode: readQrCode(raw),
    raw: payload,
  }
}

function normalizeConnectionStateResult(
  payload: unknown
): EvolutionConnectionStateResult {
  const raw = payload as any

  return {
    instanceName: readInstanceName(raw),
    state: readInstanceState(raw),
    raw: payload,
  }
}

function normalizeSendTextResult(payload: unknown): EvolutionSendTextResult {
  const raw = payload as any

  return {
    providerMessageId: raw?.key?.id ?? raw?.messageId ?? raw?.id ?? null,
    status: raw?.status ?? raw?.message?.status ?? null,
    raw: payload,
  }
}

function normalizeMessageRecipient(number: string) {
  return number.replace(/\D/g, '')
}

export function createEvolutionClient(): EvolutionClient {
  const { baseUrl, apiKey } = resolveEvolutionConfig()

  async function request<T>(
    path: string,
    options: EvolutionRequestOptions = {}
  ) {
    const response = await fetch(`${baseUrl}${path}`, {
      method: options.method ?? 'GET',
      headers: {
        apikey: options.token ?? apiKey,
        'Content-Type': 'application/json',
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    })

    const responseText = await response.text()
    const payload = responseText ? JSON.parse(responseText) : {}

    if (!response.ok) {
      throw new EvolutionApiError(
        `Evolution API returned ${response.status}`,
        response.status,
        responseText
      )
    }

    return payload as T
  }

  return {
    async createInstance({ instanceName, webhookUrl, webhookSecret }) {
      const payload = await request<unknown>('/instance/create', {
        method: 'POST',
        body: {
          instanceName,
          qrcode: true,
          integration: 'WHATSAPP-BAILEYS',
          webhook: {
            enabled: true,
            url: webhookUrl,
            byEvents: true,
            base64: true,
            events: ['CONNECTION_UPDATE', 'QRCODE_UPDATED', 'MESSAGES_UPSERT'],
            headers: webhookSecret
              ? {
                  Authorization: `Bearer ${webhookSecret}`,
                }
              : undefined,
          },
          rejectCall: true,
          msgCall:
            'No momento nao conseguimos atender ligacoes. Envie uma mensagem de texto.',
          groupsIgnore: true,
          readMessages: false,
          readStatus: false,
        },
      })

      return normalizeInstanceResult(payload)
    },

    async connectInstance({ instanceName, token }) {
      const payload = await request<unknown>(
        `/instance/connect/${instanceName}`,
        {
          token,
        }
      )

      return normalizeInstanceResult(payload)
    },

    async getConnectionState({ instanceName, token }) {
      const payload = await request<unknown>(
        `/instance/connectionState/${instanceName}`,
        { token }
      )

      return normalizeConnectionStateResult(payload)
    },

    async restartInstance({ instanceName, token }) {
      const payload = await request<unknown>(
        `/instance/restart/${instanceName}`,
        {
          method: 'PUT',
          token,
        }
      )

      return normalizeConnectionStateResult(payload)
    },

    async logoutInstance({ instanceName, token }) {
      const payload = await request<unknown>(
        `/instance/logout/${instanceName}`,
        {
          method: 'DELETE',
          token,
        }
      )

      return normalizeConnectionStateResult(payload)
    },

    async sendTextMessage({ instanceName, token, number, text }) {
      const payload = await request<unknown>(
        `/message/sendText/${instanceName}`,
        {
          method: 'POST',
          token,
          body: {
            number: normalizeMessageRecipient(number),
            text,
          },
        }
      )

      return normalizeSendTextResult(payload)
    },
  }
}
