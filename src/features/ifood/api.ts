'use server'

import { decrypt, encrypt } from '@/lib/encryption'
import { IFoodService } from '@/services/ifood'
import { validateUserPermissionsForStore } from '../store/api'
import {
  createIFoodIntegration,
  createIFoodOAuthSession,
  deleteIFoodIntegration,
  deleteIFoodOAuthSession,
  getIFoodIntegration,
  getIFoodOAuthSession,
  updateIFoodIntegration,
  updateIFoodOAuthSession,
} from './db'
import { listMenuItems } from '../menu/api'

const IFOOD_API_BASE_URL =
  process.env.IFOOD_API_BASE_URL || 'https://merchant-api.ifood.com.br'
const IFOOD_CLIENT_ID = process.env.NEXT_PUBLIC_IFOOD_CLIENT_ID

interface UserCodeResponse {
  userCode: string
  authorizationCodeVerifier: string
  verificationUrl: string
  verificationUrlComplete: string
  expiresIn: number
}

/**
 * Initiates iFood OAuth flow by generating a userCode and storing session server-side.
 * Returns only userCode and verificationUrl - sensitive data stays server-side.
 */
export const initiateIFoodOAuth = async (storeId: number) => {
  await validateUserPermissionsForStore(storeId, 'admin')

  if (!IFOOD_CLIENT_ID) {
    throw new Error('iFood client ID not configured')
  }

  // Call iFood API to generate userCode
  const response = await fetch(
    `${IFOOD_API_BASE_URL}/authentication/v1.0/oauth/userCode`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        clientId: IFOOD_CLIENT_ID,
      }),
    }
  )

  if (!response.ok) {
    const errorText = await response.text()
    console.error('iFood userCode generation failed:', errorText)
    throw new Error('Failed to generate user code')
  }

  const data: UserCodeResponse = await response.json()

  // Store session in database with 10 minute expiry
  // The authorizationCodeVerifier is stored server-side only and NEVER returned to client
  const expiresAt = new Date(Date.now() + data.expiresIn * 1000)

  await createIFoodOAuthSession({
    storeId,
    userCode: data.userCode,
    authorizationCodeVerifier: data.authorizationCodeVerifier,
    expiresAt,
  })

  // Return ONLY the userCode and verificationUrl - no sensitive data
  return {
    userCode: data.userCode,
    verificationUrl: data.verificationUrlComplete,
  }
}

/**
 * Exchange authorization code for tokens using the server-stored verifier.
 * The verifier is retrieved from DB (never exposed to client) and used for the exchange.
 * Tokens are encrypted and stored in the OAuth session (never exposed to client).
 * Returns only available merchants for selection - no tokens in response.
 */
export const exchangeIFoodAuthCode = async (
  storeId: number,
  authorizationCode: string
) => {
  await validateUserPermissionsForStore(storeId, 'admin')

  // Get the stored OAuth session (contains the verifier)
  const session = await getIFoodOAuthSession(storeId)

  if (!session) {
    throw new Error('OAuth session not found. Please restart the connection process.')
  }

  // Check if session has expired
  if (new Date() > new Date(session.expiresAt)) {
    // Clean up expired session
    await deleteIFoodOAuthSession(storeId)
    throw new Error('OAuth session expired. Please restart the connection process.')
  }

  // Exchange the code using the server-stored verifier
  const tokens = await IFoodService.exchangeCodeForTokens(
    authorizationCode,
    session.authorizationCodeVerifier
  )

  // Store encrypted tokens in the OAuth session for the next steps
  // Tokens stay server-side and are NEVER sent to the client
  await updateIFoodOAuthSession(storeId, {
    accessToken: encrypt(tokens.accessToken),
    refreshToken: encrypt(tokens.refreshToken),
  })

  // Get available merchants
  const service = new IFoodService({ accessToken: tokens.accessToken })
  const merchants = await service.getMerchants()

  // Return ONLY merchants - no tokens in response
  return { merchants }
}

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
