'use server'

import { decrypt, encrypt } from '@/lib/encryption'
import { db } from '@/services/db'
import { NfeIoService } from '@/services/nfeio'
import type { NfeFlagCard } from 'nfe-io'
import { validateUserPermissionsForStore } from '../store/api'
import {
  createAutoEmissionMethod,
  deleteAutoEmissionMethod,
  getAutoEmissionMethodsByStoreId,
  getFiscalConfigByStoreId,
  getServiceInvoiceById,
  reserveNextInvoiceNumber,
  setAutoEmissionMethods,
  updateFiscalConfig,
  updateServiceInvoice,
  upsertFiscalConfig,
} from './db'
import type {
  CompanyFormData,
  FiscalSettingsFormData,
  ServiceInvoice,
  StoreFiscalConfig,
} from './types'

export const getFiscalConfig = async (
  storeId: number
): Promise<StoreFiscalConfig | null> => {
  await validateUserPermissionsForStore(storeId, 'admin')
  const config = await getFiscalConfigByStoreId(storeId)

  if (!config) {
    return null
  }

  return {
    ...config,
    nfeioApiKey: config.nfeioApiKey ? '********' : null,
  }
}

export const saveCompanyInfo = async (
  storeId: number,
  data: CompanyFormData
): Promise<StoreFiscalConfig> => {
  await validateUserPermissionsForStore(storeId, 'admin')

  const config = await upsertFiscalConfig(storeId, {
    federalTaxNumber: data.federalTaxNumber,
    name: data.name,
    tradeName: data.tradeName,
    taxRegime: data.taxRegime,
    email: data.email,
    phone: data.phone,
    addressStreet: data.addressStreet,
    addressNumber: data.addressNumber,
    addressComplement: data.addressComplement,
    addressNeighborhood: data.addressNeighborhood,
    addressCity: data.addressCity,
    addressState: data.addressState,
    addressPostalCode: data.addressPostalCode,
    addressCityCode: data.addressCityCode,
  })

  return config
}

export const saveFiscalSettings = async (
  storeId: number,
  data: FiscalSettingsFormData
): Promise<StoreFiscalConfig> => {
  await validateUserPermissionsForStore(storeId, 'admin')

  const encryptedApiKey =
    data.nfeioApiKey !== '********' ? encrypt(data.nfeioApiKey) : undefined

  const updateData: Partial<StoreFiscalConfig> = {
    environment: data.environment,
    stateRegistration: data.stateRegistration,
    municipalRegistration: data.municipalRegistration,
    cscId: data.cscId,
    cscCode: data.cscCode,
    nfceSeries: data.nfceSeries,
    nextNfceNumber: data.nextNfceNumber,
    accountantEmail: data.accountantEmail,
  }

  if (encryptedApiKey) {
    updateData.nfeioApiKey = encryptedApiKey
  }

  return await updateFiscalConfig(storeId, updateData)
}

export const createNfeioCompany = async (
  storeId: number
): Promise<StoreFiscalConfig> => {
  await validateUserPermissionsForStore(storeId, 'admin')

  const config = await getFiscalConfigByStoreId(storeId)

  if (!config) {
    throw new Error('Fiscal config not found. Please save company info first.')
  }

  if (!config.nfeioApiKey) {
    throw new Error(
      'NFe.io API key not configured. Please save fiscal settings first.'
    )
  }

  if (!config.federalTaxNumber || !config.name || !config.email) {
    throw new Error('Company info incomplete. Please fill all required fields.')
  }

  const nfeioService = new NfeIoService(
    decrypt(config.nfeioApiKey),
    config.environment
  )

  const taxRegimeMap = {
    simplesNacional: 'SimplesNacional',
    simplesNacionalExcessoSublimite: 'SimplesNacional',
    regimeNormal: 'LucroPresumido',
    mei: 'MicroempreendedorIndividual',
  } as const

  const companyData = {
    name: config.name,
    tradeName: config.tradeName ?? undefined,
    federalTaxNumber: parseInt(config.federalTaxNumber.replace(/\D/g, '')),
    email: config.email,
    address: {
      country: 'BRA',
      postalCode: config.addressPostalCode ?? '',
      street: config.addressStreet ?? '',
      number: config.addressNumber ?? '',
      additionalInformation: config.addressComplement ?? undefined,
      district: config.addressNeighborhood ?? '',
      city: {
        code: config.addressCityCode ?? '',
        name: config.addressCity ?? '',
      },
      state: config.addressState ?? '',
    },
    taxRegime: config.taxRegime
      ? taxRegimeMap[config.taxRegime]
      : 'SimplesNacional',
    municipalTaxNumber: config.municipalRegistration ?? undefined,
    regionalTaxNumber: config.stateRegistration
      ? parseInt(config.stateRegistration.replace(/\D/g, ''))
      : undefined,
  }

  const company = await nfeioService.createCompany(companyData)

  return await updateFiscalConfig(storeId, {
    nfeioCompanyId: company.id,
    status: 'pending_certificate',
  })
}

export const updateNfeioCompany = async (
  storeId: number
): Promise<StoreFiscalConfig> => {
  await validateUserPermissionsForStore(storeId, 'admin')

  const config = await getFiscalConfigByStoreId(storeId)

  if (!config?.nfeioCompanyId || !config.nfeioApiKey) {
    throw new Error('NFe.io company not created yet.')
  }

  const nfeioService = new NfeIoService(
    decrypt(config.nfeioApiKey),
    config.environment
  )

  await nfeioService.updateCompany(config.nfeioCompanyId, {
    name: config.name ?? undefined,
    tradeName: config.tradeName ?? undefined,
    email: config.email ?? undefined,
    address: {
      country: 'BRA',
      postalCode: config.addressPostalCode ?? '',
      street: config.addressStreet ?? '',
      number: config.addressNumber ?? '',
      additionalInformation: config.addressComplement ?? undefined,
      district: config.addressNeighborhood ?? '',
      city: {
        code: config.addressCityCode ?? '',
        name: config.addressCity ?? '',
      },
      state: config.addressState ?? '',
    },
    municipalTaxNumber: config.municipalRegistration ?? undefined,
  })

  return config
}

export const uploadCertificate = async (
  storeId: number,
  certificateBase64: string,
  password: string
): Promise<StoreFiscalConfig> => {
  await validateUserPermissionsForStore(storeId, 'admin')

  const config = await getFiscalConfigByStoreId(storeId)

  if (!config?.nfeioCompanyId || !config.nfeioApiKey) {
    throw new Error('NFe.io company not created yet.')
  }

  const nfeioService = new NfeIoService(
    decrypt(config.nfeioApiKey),
    config.environment
  )

  const certificateStatus = await nfeioService.uploadCertificate(
    config.nfeioCompanyId,
    {
      file: certificateBase64,
      password,
    }
  )

  return await updateFiscalConfig(storeId, {
    certificateValidUntil: certificateStatus.expiresOn ?? null,
    status:
      certificateStatus.status === 'Active' ? 'active' : 'pending_certificate',
  })
}

export const getCertificateStatus = async (storeId: number) => {
  await validateUserPermissionsForStore(storeId, 'admin')

  const config = await getFiscalConfigByStoreId(storeId)

  if (!config?.nfeioCompanyId || !config.nfeioApiKey) {
    return null
  }

  const nfeioService = new NfeIoService(
    decrypt(config.nfeioApiKey),
    config.environment
  )
  return await nfeioService.getCertificateStatus(config.nfeioCompanyId)
}

const MAX_INVOICE_RETRY_ATTEMPTS = 3

export const generateNfce = async (
  storeId: number,
  orderId: number,
  customerCpf: string | null,
  orderData: {
    items: Array<{
      code: string
      description: string
      ncm: string
      cfop: string
      unit: string
      quantity: number
      unitAmount: number
      totalAmount: number
      cest?: string
      origin?: string
      icmsCst?: string
      icmsRate?: number
      pisCst?: string
      cofinsCst?: string
    }>
    payments: Array<{
      method:
        | 'CASH'
        | 'PIX'
        | 'CREDIT'
        | 'DEBIT'
        | 'MEAL_VOUCHER'
        | 'FOOD_VOUCHER'
      amount: number
      cardBrand?: string
    }>
    totalAmount: number
  }
): Promise<ServiceInvoice> => {
  await validateUserPermissionsForStore(storeId, 'admin')

  const config = await getFiscalConfigByStoreId(storeId)

  if (!config?.nfeioCompanyId || !config.nfeioApiKey) {
    throw new Error('NFe.io not configured for this store')
  }

  if (config.status !== 'active') {
    throw new Error('Fiscal config not active. Please complete setup.')
  }

  const nfeioService = new NfeIoService(
    decrypt(config.nfeioApiKey),
    config.environment
  )

  const paymentMethodMap = {
    CASH: 'Cash',
    PIX: 'InstantPayment',
    CREDIT: 'CreditCard',
    DEBIT: 'DebitCard',
    MEAL_VOUCHER: 'MealVouchers',
    FOOD_VOUCHER: 'FoodVouchers',
  } as const

  let lastError: Error | null = null
  let invoice: ServiceInvoice | null = null

  for (let attempt = 0; attempt < MAX_INVOICE_RETRY_ATTEMPTS; attempt++) {
    const reserved = await db.transaction(async tx => {
      return await reserveNextInvoiceNumber({
        storeId,
        orderId,
        customerCpf,
        dbSession: tx,
      })
    })

    try {
      await updateServiceInvoice(reserved.invoiceId, { status: 'processing' })

      const nfceResult = await nfeioService.issueNfce(config.nfeioCompanyId, {
        serie: reserved.series,
        number: reserved.invoiceNumber,
        operationNature: 'Venda de mercadoria',
        buyer: customerCpf
          ? {
              federalTaxNumber: parseInt(customerCpf.replace(/\D/g, '')),
            }
          : undefined,
        items: orderData.items.map((item, index) => ({
          code: item.code,
          description: item.description,
          ncm: item.ncm,
          cfop: parseInt(item.cfop),
          unit: item.unit,
          quantity: item.quantity,
          unitAmount: item.unitAmount,
          totalAmount: item.totalAmount,
          cest: item.cest,
          itemNumber: index + 1,
          tax: {
            origin: item.origin ?? 'National',
            icms: {
              cst: item.icmsCst ?? '00',
              rate: item.icmsRate ?? 0,
            },
            pis: {
              cst: item.pisCst ?? '07',
            },
            cofins: {
              cst: item.cofinsCst ?? '07',
            },
          },
        })),
        payment: [
          {
            paymentDetail: orderData.payments.map(payment => ({
              method: paymentMethodMap[payment.method],
              amount: payment.amount,
              card: payment.cardBrand
                ? { flagCard: payment.cardBrand as NfeFlagCard }
                : undefined,
            })),
          },
        ],
      })

      let pdfUrl: string | null = null
      let xmlUrl: string | null = null
      const invoiceId = nfceResult.id

      if (invoiceId) {
        try {
          pdfUrl = await nfeioService.getNfcePdfUrl(
            config.nfeioCompanyId,
            invoiceId
          )
          xmlUrl = await nfeioService.getNfceXmlUrl(
            config.nfeioCompanyId,
            invoiceId
          )
        } catch {
          // ignore - URLs may not be ready yet
        }
      }

      invoice = await updateServiceInvoice(reserved.invoiceId, {
        status: 'issued',
        nfeioInvoiceId: invoiceId ?? null,
        pdfUrl,
        xmlUrl,
      })

      break
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))

      const isDuplicateError =
        lastError.message.includes('duplicate') ||
        lastError.message.includes('já existe')

      if (!isDuplicateError) {
        await updateServiceInvoice(reserved.invoiceId, {
          status: 'error',
          errorMessage: lastError.message,
        })
        throw lastError
      }

      await updateServiceInvoice(reserved.invoiceId, {
        status: 'error',
        errorMessage: `Duplicate number error, retrying... (attempt ${attempt + 1})`,
      })
    }
  }

  if (!invoice) {
    throw lastError ?? new Error('Failed to generate invoice after max retries')
  }

  return invoice
}

export const getServiceInvoice = async (
  storeId: number,
  invoiceId: number
): Promise<ServiceInvoice | null> => {
  await validateUserPermissionsForStore(storeId, 'admin')
  return await getServiceInvoiceById(invoiceId)
}

export const getAutoEmissionMethods = async (storeId: number) => {
  await validateUserPermissionsForStore(storeId, 'admin')
  return await getAutoEmissionMethodsByStoreId(storeId)
}

export const toggleAutoEmissionMethod = async (
  storeId: number,
  paymentMethod: string,
  enabled: boolean
) => {
  await validateUserPermissionsForStore(storeId, 'admin')

  if (enabled) {
    return await createAutoEmissionMethod({
      storeId,
      paymentMethod: paymentMethod as
        | 'CASH'
        | 'PIX'
        | 'CREDIT'
        | 'DEBIT'
        | 'MEAL_VOUCHER'
        | 'FOOD_VOUCHER',
    })
  }

  await deleteAutoEmissionMethod(storeId, paymentMethod)
  return null
}

export const updateAutoEmissionMethods = async (
  storeId: number,
  paymentMethods: string[]
) => {
  await validateUserPermissionsForStore(storeId, 'admin')
  return await setAutoEmissionMethods(storeId, paymentMethods)
}
