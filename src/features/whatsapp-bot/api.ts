'use server'

import {
  disconnectWhatsappBotSession,
  getWhatsappAssistantConfigForStore,
  getWhatsappBotSessionForStore,
  getWhatsappHumanHandoffQueueForStore,
  getWhatsappOperationalDiagnosticsForStore,
  pauseWhatsappBotSession,
  renewWhatsappBotQrCode,
  returnWhatsappConversationToBotForStore,
  saveWhatsappAssistantConfigForStore,
  startWhatsappBotConnection,
  testWhatsappAssistantConfigForStore,
} from '@/features/whatsapp-bot/db'
import { validateUserPermissionsForStore } from '@/features/store/api'
import {
  assistantConfigLimits,
  validateWhatsappAssistantConfigInput,
  type WhatsappAssistantConfigInput,
} from './assistant-config-policy'

export async function getWhatsappConnectionStatus(storeId: number) {
  await validateUserPermissionsForStore(storeId, 'integrations.manage')
  return await getWhatsappBotSessionForStore(storeId)
}

export async function startWhatsappConnection(input: {
  storeId: number
  phoneNumber: string
  displayName?: string | null
}) {
  const { user } = await validateUserPermissionsForStore(
    input.storeId,
    'integrations.manage'
  )

  return await startWhatsappBotConnection({ ...input, actor: user })
}

export async function renewWhatsappConnectionQrCode(input: {
  storeId: number
  sessionId: number
}) {
  const { user } = await validateUserPermissionsForStore(
    input.storeId,
    'integrations.manage'
  )

  return await renewWhatsappBotQrCode({ ...input, actor: user })
}

export async function pauseWhatsappConnection(input: {
  storeId: number
  sessionId: number
}) {
  const { user } = await validateUserPermissionsForStore(
    input.storeId,
    'integrations.manage'
  )

  return await pauseWhatsappBotSession({ ...input, actor: user })
}

export async function disconnectWhatsappConnection(input: {
  storeId: number
  sessionId: number
}) {
  const { user } = await validateUserPermissionsForStore(
    input.storeId,
    'integrations.manage'
  )

  return await disconnectWhatsappBotSession({ ...input, actor: user })
}

export async function getWhatsappAssistantConfig(storeId: number) {
  await validateUserPermissionsForStore(storeId, 'integrations.manage')
  return await getWhatsappAssistantConfigForStore(storeId)
}

export async function getWhatsappHumanHandoffQueue(storeId: number) {
  await validateUserPermissionsForStore(storeId, 'integrations.manage')
  return await getWhatsappHumanHandoffQueueForStore(storeId)
}

export async function getWhatsappOperationalDiagnostics(storeId: number) {
  await validateUserPermissionsForStore(storeId, 'integrations.manage')
  return await getWhatsappOperationalDiagnosticsForStore(storeId)
}

export async function returnWhatsappConversationToBot(input: {
  storeId: number
  conversationId: string
}) {
  const { user } = await validateUserPermissionsForStore(
    input.storeId,
    'integrations.manage'
  )

  return await returnWhatsappConversationToBotForStore({
    storeId: input.storeId,
    conversationId: input.conversationId,
    returnedByUserId: user.id,
    actor: user,
  })
}

export async function saveWhatsappAssistantConfig(input: {
  storeId: number
  values: WhatsappAssistantConfigInput
}) {
  const { user } = await validateUserPermissionsForStore(
    input.storeId,
    'integrations.manage'
  )
  const parsed = validateWhatsappAssistantConfigInput(input.values)

  if (!parsed.success) throw new Error(parsed.error)

  return await saveWhatsappAssistantConfigForStore({
    storeId: input.storeId,
    values: parsed.data,
    updatedByUserId: user.id,
    actor: user,
  })
}

export async function testWhatsappAssistantConfig(input: {
  storeId: number
  message: string
  values?: WhatsappAssistantConfigInput
}) {
  if (!Number.isSafeInteger(input?.storeId) || input.storeId <= 0) {
    throw new Error('Loja invalida.')
  }
  await validateUserPermissionsForStore(input.storeId, 'integrations.manage')

  if (typeof input.message !== 'string') {
    throw new Error('Informe uma mensagem de teste.')
  }
  const message = input.message.trim()
  if (!message) throw new Error('Informe uma mensagem de teste.')
  if (message.length > assistantConfigLimits.testMessage) {
    throw new Error('Mensagem de teste muito longa.')
  }
  const parsed = input.values === undefined
    ? undefined
    : validateWhatsappAssistantConfigInput(input.values)
  if (parsed && !parsed.success) throw new Error(parsed.error)

  return await testWhatsappAssistantConfigForStore({
    storeId: input.storeId,
    message,
    values: parsed?.success ? parsed.data : undefined,
  })
}
