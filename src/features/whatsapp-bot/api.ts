'use server'

import {
  disconnectWhatsappBotSession,
  getWhatsappAssistantConfigForStore,
  getWhatsappBotSessionForStore,
  pauseWhatsappBotSession,
  renewWhatsappBotQrCode,
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
  await validateUserPermissionsForStore(input.storeId, 'integrations.manage')
  return await startWhatsappBotConnection(input)
}

export async function renewWhatsappConnectionQrCode(input: {
  storeId: number
  sessionId: number
}) {
  await validateUserPermissionsForStore(input.storeId, 'integrations.manage')
  return await renewWhatsappBotQrCode(input)
}

export async function pauseWhatsappConnection(input: {
  storeId: number
  sessionId: number
}) {
  await validateUserPermissionsForStore(input.storeId, 'integrations.manage')
  return await pauseWhatsappBotSession(input)
}

export async function disconnectWhatsappConnection(input: {
  storeId: number
  sessionId: number
}) {
  await validateUserPermissionsForStore(input.storeId, 'integrations.manage')
  return await disconnectWhatsappBotSession(input)
}

export async function getWhatsappAssistantConfig(storeId: number) {
  await validateUserPermissionsForStore(storeId, 'integrations.manage')
  return await getWhatsappAssistantConfigForStore(storeId)
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
  })
}

export async function testWhatsappAssistantConfig(input: {
  storeId: number
  message: string
}) {
  await validateUserPermissionsForStore(input.storeId, 'integrations.manage')

  const message = input.message.trim()
  if (message.length > assistantConfigLimits.testMessage) {
    throw new Error('Mensagem de teste muito longa.')
  }

  return await testWhatsappAssistantConfigForStore({
    storeId: input.storeId,
    message,
  })
}
