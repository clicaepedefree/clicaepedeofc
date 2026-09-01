'use server'

import {
  disconnectWhatsappBotSession,
  getWhatsappBotSessionForStore,
  pauseWhatsappBotSession,
  renewWhatsappBotQrCode,
  startWhatsappBotConnection,
} from '@/features/whatsapp-bot/db'
import { validateUserPermissionsForStore } from '@/features/store/api'

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
