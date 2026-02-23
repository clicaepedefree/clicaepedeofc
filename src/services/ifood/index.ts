import type {
  IFoodAPICatalogResponse,
  IFoodAPITokenResponse,
  IFoodCategory,
  IFoodMenu,
  IFoodMenuItem,
  TokenResponse,
} from './types'

const IFOOD_API_BASE_URL =
  process.env.IFOOD_API_BASE_URL || 'https://merchant-api.ifood.com.br'
const IFOOD_CLIENT_ID = process.env.NEXT_PUBLIC_IFOOD_CLIENT_ID
const IFOOD_CLIENT_SECRET = process.env.IFOOD_CLIENT_SECRET

export class IFoodService {
  private accessToken: string

  constructor(config: { accessToken: string }) {
    this.accessToken = config.accessToken
  }

  /**
   * Exchange authorization code for access and refresh tokens
   * This is for iFood's distributed app flow using authorizationCode + authorizationCodeVerifier
   * Returns tokens without merchantId - use getMerchants() to get available merchants
   */
  static async exchangeCodeForTokens(
    authorizationCode: string,
    authorizationCodeVerifier: string
  ): Promise<Omit<TokenResponse, 'merchantId'>> {
    if (!IFOOD_CLIENT_ID || !IFOOD_CLIENT_SECRET) {
      throw new Error('iFood OAuth credentials not configured')
    }

    const response = await fetch(
      `${IFOOD_API_BASE_URL}/authentication/v1.0/oauth/token`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          grantType: 'authorization_code',
          clientId: IFOOD_CLIENT_ID,
          clientSecret: IFOOD_CLIENT_SECRET,
          authorizationCode,
          authorizationCodeVerifier,
        }),
      }
    )

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(
        `iFood OAuth token exchange failed: ${response.status} - ${errorText}`
      )
    }

    const data: IFoodAPITokenResponse = await response.json()

    return data
  }

  /**
   * Refresh access token using refresh token
   * Returns tokens without merchantId (merchantId doesn't change during refresh)
   */
  static async refreshAccessToken(
    refreshToken: string
  ): Promise<Omit<TokenResponse, 'merchantId'>> {
    if (!IFOOD_CLIENT_ID || !IFOOD_CLIENT_SECRET) {
      throw new Error('iFood OAuth credentials not configured')
    }

    const response = await fetch(
      `${IFOOD_API_BASE_URL}/authentication/v1.0/oauth/token`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          grantType: 'refresh_token',
          refreshToken: refreshToken,
          clientId: IFOOD_CLIENT_ID,
          clientSecret: IFOOD_CLIENT_SECRET,
        }),
      }
    )

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(
        `iFood token refresh failed: ${response.status} - ${errorText}`
      )
    }

    const data: IFoodAPITokenResponse = await response.json()

    return data
  }

  /**
   * Get list of merchants associated with the authenticated account
   */
  async getMerchants(): Promise<
    Array<{ id: string; name: string; corporateName: string }>
  > {
    const response = await fetch(
      `${IFOOD_API_BASE_URL}/merchant/v1.0/merchants`,
      {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.accessToken}`,
        },
      }
    )

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(
        `Failed to get merchants: ${response.status} - ${errorText}`
      )
    }

    const data = await response.json()
    // The API returns an array of merchants directly or wrapped in a data property
    return Array.isArray(data) ? data : data.data || []
  }

  /**
   * Get merchant's complete menu catalog
   * Returns normalized menu structure
   */
  async getMerchantMenu(merchantId: string): Promise<IFoodMenu> {
    const data = await this.request<IFoodAPICatalogResponse>(
      `/catalog/v2.0/merchants/${merchantId}/catalogs/ffca0022-eb43-4205-9a1b-73a72f8e3f95/sellableItems`
    )

    // Normalize the response to our format
    return this.normalizeCatalog(data)
  }

  /**
   * Update external code (PDV code) for a menu item
   */
  async updateItemExternalCode(
    merchantId: string,
    itemId: string,
    externalCode: string
  ): Promise<void> {
    const response = await this.request(
      `/catalog/v2.0/merchants/${merchantId}/items/externalCode`,
      {
        method: 'PATCH',
        body: JSON.stringify({
          externalCode,
          itemId,
        }),
      }
    )
    console.log(response)
  }

  /**
   * Internal HTTP request handler
   */
  private async request<T>(
    endpoint: string,
    options?: RequestInit
  ): Promise<T> {
    const url = `${IFOOD_API_BASE_URL}${endpoint}`

    const response = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
        ...options?.headers,
      },
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(
        `iFood API request failed: ${response.status} - ${errorText}`
      )
    }

    // For PATCH/DELETE requests that might not return JSON
    if (options?.method === 'PATCH' || options?.method === 'DELETE') {
      const text = await response.text()
      return (text ? JSON.parse(text) : {}) as T
    }

    return response.json()
  }

  /**
   * Normalize iFood catalog response to our format
   * Groups flat array of items by category
   */
  private normalizeCatalog(data: IFoodAPICatalogResponse): IFoodMenu {
    // Group items by categoryId
    const categoriesMap = new Map<string, IFoodCategory>()

    for (const rawItem of data) {
      // Get or create category
      if (!categoriesMap.has(rawItem.categoryId)) {
        categoriesMap.set(rawItem.categoryId, {
          id: rawItem.categoryId,
          name: rawItem.categoryName,
          index: rawItem.categoryIndex,
          items: [],
        })
      }

      const category = categoriesMap.get(rawItem.categoryId)!

      // Create normalized menu item
      const menuItem: IFoodMenuItem = {
        id: rawItem.itemId,
        categoryId: rawItem.categoryId,
        externalCode: rawItem.itemExternalCode || null,
        name: rawItem.itemName,
        description: rawItem.itemDescription || null,
        price: {
          value: rawItem.itemPrice.value,
          originalValue: rawItem.itemPrice.originalValue || null,
        },
        index: rawItem.itemIndex,
      }

      category.items.push(menuItem)
    }

    // Convert map to array and sort
    const categories = Array.from(categoriesMap.values())
      .sort((a, b) => a.index - b.index)
      .map(category => ({
        ...category,
        items: category.items.sort((a, b) => a.index - b.index),
      }))

    return { categories }
  }
}
