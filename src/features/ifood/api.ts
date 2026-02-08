'use server'

import { decrypt, encrypt } from '@/lib/encryption'
import { IFoodService } from '@/services/ifood'
import { validateUserPermissionsForStore } from '../store/api'
import {
  createIFoodIntegration,
  deleteIFoodIntegration,
  getIFoodIntegration,
  updateIFoodIntegration,
} from './db'
import { listMenuItems } from '../menu/api'

export const connectIFoodAccountWithCode = async (
  storeId: number,
  merchantId: string,
  accessToken: string,
  refreshToken: string,
  expiresIn: number
) => {
  await validateUserPermissionsForStore(storeId, 'admin')

  // Store encrypted tokens
  await createIFoodIntegration({
    storeId,
    merchantId,
    accessToken: encrypt(accessToken),
    refreshToken: encrypt(refreshToken),
    tokenExpiresAt: new Date(Date.now() + expiresIn * 1000),
    status: 'connected',
  })
}

export const disconnectIFoodAccount = async (storeId: number) => {
  await validateUserPermissionsForStore(storeId, 'admin')
  await deleteIFoodIntegration(storeId)
}

export const getIFoodConnectionStatus = async (storeId: number) => {
  await validateUserPermissionsForStore(storeId, 'admin')
  const integration = await getIFoodIntegration(storeId)

  if (!integration) {
    return null
  }

  // Return connection status without sensitive data
  return {
    id: integration.id,
    storeId: integration.storeId,
    merchantId: integration.merchantId,
    status: integration.status,
    lastSyncAt: integration.lastSyncAt,
    tokenExpiresAt: integration.tokenExpiresAt,
  }
}

export const fetchIFoodMenu = async (storeId: number) => {
  await validateUserPermissionsForStore(storeId, 'admin')

  const integration = await getIFoodIntegration(storeId)

  if (!integration) {
    throw new Error('iFood integration not found for this store')
  }

  // Check if token needs refresh
  const now = new Date()
  const expiresAt = new Date(integration.tokenExpiresAt)
  const fiveMinutesFromNow = new Date(now.getTime() + 5 * 60 * 1000)

  let accessToken = decrypt(integration.accessToken)

  // Refresh token if it expires in less than 5 minutes
  if (expiresAt < fiveMinutesFromNow) {
    const refreshedTokens = await IFoodService.refreshAccessToken(
      decrypt(integration.refreshToken)
    )

    // Update stored tokens
    await updateIFoodIntegration(storeId, {
      accessToken: encrypt(refreshedTokens.accessToken),
      refreshToken: encrypt(refreshedTokens.refreshToken),
      tokenExpiresAt: new Date(Date.now() + refreshedTokens.expiresIn * 1000),
    })

    accessToken = refreshedTokens.accessToken
  }

  const service = new IFoodService({ accessToken })
  const menu = await service.getMerchantMenu(integration.merchantId)

  // Update last sync timestamp
  await updateIFoodIntegration(storeId, {
    lastSyncAt: new Date(),
  })

  return menu
}

export const getLocalMenuItems = async (storeId: number) => {
  await validateUserPermissionsForStore(storeId, 'admin')
  // Use existing menu API to get local items
  return await listMenuItems({ storeId })
}

export const updateIFoodPDVCodes = async (
  storeId: number,
  updates: Array<{ ifoodItemId: string; pdvCode: string }>
) => {
  await validateUserPermissionsForStore(storeId, 'admin')

  const integration = await getIFoodIntegration(storeId)

  if (!integration) {
    throw new Error('iFood integration not found for this store')
  }

  // Check if token needs refresh (same as fetchIFoodMenu)
  const now = new Date()
  const expiresAt = new Date(integration.tokenExpiresAt)
  const fiveMinutesFromNow = new Date(now.getTime() + 5 * 60 * 1000)

  let accessToken = decrypt(integration.accessToken)

  if (expiresAt < fiveMinutesFromNow) {
    const refreshedTokens = await IFoodService.refreshAccessToken(
      decrypt(integration.refreshToken)
    )

    await updateIFoodIntegration(storeId, {
      accessToken: encrypt(refreshedTokens.accessToken),
      refreshToken: encrypt(refreshedTokens.refreshToken),
      tokenExpiresAt: new Date(Date.now() + refreshedTokens.expiresIn * 1000),
    })

    accessToken = refreshedTokens.accessToken
  }

  const service = new IFoodService({ accessToken })

  const results = []
  const errors: Record<string, string> = {}

  for (const update of updates) {
    try {
      await service.updateItemExternalCode(
        integration.merchantId,
        update.ifoodItemId,
        update.pdvCode
      )
      results.push({ success: true, itemId: update.ifoodItemId })
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error'
      results.push({
        success: false,
        itemId: update.ifoodItemId,
        error: errorMessage,
      })
      errors[update.ifoodItemId] = errorMessage
    }
  }

  // Update last sync timestamp and store any errors
  await updateIFoodIntegration(storeId, {
    lastSyncAt: new Date(),
    syncErrors: Object.keys(errors).length > 0 ? errors : null,
  })

  return results
}
