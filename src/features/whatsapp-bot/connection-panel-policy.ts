import type { WhatsappBotSessionStatus } from './session-policy'

export type WhatsappConnectionAction =
  | 'connect'
  | 'view_qr'
  | 'renew_qr'
  | 'pause'
  | 'resume'
  | 'disconnect'

type WhatsappConnectionViewInput = {
  status?: WhatsappBotSessionStatus | null
  qrCodeBase64?: string | null
  qrCodeExpiresAt?: Date | string | null
  lastErrorMessage?: string | null
}

const secretPatterns = [
  /\bBearer\s+[A-Za-z0-9._~+/=-]+/gi,
  /\b(api[_-]?key|apikey|token|secret|password)\s*[:=]\s*[^\s,;]+/gi,
  /\b[A-Za-z0-9_-]{24,}\.[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}\b/g,
]

export const sanitizeWhatsappConnectionError = (message?: string | null) => {
  if (!message) return null

  const redacted = secretPatterns.reduce(
    (current, pattern) => current.replace(pattern, '[credencial protegida]'),
    message
  )

  if (/missing|not configured|env|config/i.test(redacted)) {
    return 'Conector WhatsApp indisponivel. Avise o suporte para revisar a configuracao.'
  }

  if (/qr|qrcode|expired|expir/i.test(redacted)) {
    return 'Este QR Code expirou. Gere um novo codigo para conectar.'
  }

  if (/unauthori[sz]ed|forbidden|permission|401|403/i.test(redacted)) {
    return 'Voce nao tem permissao para alterar esta conexao.'
  }

  if (/timeout|temporar|network|fetch|econn/i.test(redacted)) {
    return 'Nao foi possivel falar com o WhatsApp agora. Tente novamente em instantes.'
  }

  return redacted
}

export const shouldShowWhatsappQrCode = ({
  status,
  qrCodeBase64,
  qrCodeExpiresAt,
}: WhatsappConnectionViewInput) => {
  if (status !== 'pending_qr' || !qrCodeBase64 || !qrCodeExpiresAt) {
    return false
  }

  return new Date(qrCodeExpiresAt).getTime() > Date.now()
}

export const getWhatsappConnectionActions = (
  status?: WhatsappBotSessionStatus | null
): WhatsappConnectionAction[] => {
  switch (status) {
    case 'pending_qr':
      return ['view_qr', 'renew_qr', 'pause', 'disconnect']
    case 'connecting':
      return ['renew_qr', 'pause', 'disconnect']
    case 'connected':
      return ['pause', 'disconnect']
    case 'paused':
      return ['resume', 'disconnect']
    case 'error':
      return ['renew_qr', 'disconnect']
    case 'disconnected':
    default:
      return ['connect']
  }
}

export const getWhatsappPollingInterval = (
  status?: WhatsappBotSessionStatus | null
) => {
  switch (status) {
    case 'connecting':
      return 3000
    case 'pending_qr':
      return 5000
    case 'connected':
      return 30000
    default:
      return false
  }
}

export const getWhatsappConnectionStatusLabel = (
  status?: WhatsappBotSessionStatus | null
) => {
  switch (status) {
    case 'pending_qr':
      return 'Aguardando QR Code'
    case 'connecting':
      return 'Conectando'
    case 'connected':
      return 'Conectado'
    case 'paused':
      return 'Pausado'
    case 'error':
      return 'Erro'
    case 'disconnected':
    default:
      return 'Desconectado'
  }
}

export const getWhatsappConnectionGuidance = ({
  status,
  qrCodeBase64,
  qrCodeExpiresAt,
  lastErrorMessage,
}: WhatsappConnectionViewInput) => {
  if (status === 'paused') {
    return 'As respostas automaticas estao pausadas. O numero e as configuracoes foram preservados.'
  }

  if (status === 'pending_qr') {
    return shouldShowWhatsappQrCode({ status, qrCodeBase64, qrCodeExpiresAt })
      ? 'Leia o QR Code para concluir a conexao do WhatsApp.'
      : 'E necessario gerar um novo QR Code para conectar este numero.'
  }

  if (status === 'error') {
    return (
      sanitizeWhatsappConnectionError(lastErrorMessage) ??
      'Revise a conexao e tente novamente.'
    )
  }

  if (status === 'connected') {
    return 'O robo esta apto a responder clientes conforme as configuracoes da loja.'
  }

  return 'Conecte um numero para ativar o atendimento automatico pelo WhatsApp.'
}
