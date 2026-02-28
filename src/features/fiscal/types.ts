import {
  InsertServiceInvoice,
  SelectServiceInvoice,
} from '@/services/db/schema/service-invoices'
import {
  InsertStoreAutoEmissionPaymentMethod,
  SelectStoreAutoEmissionPaymentMethod,
} from '@/services/db/schema/store-auto-emission-payment-methods'
import {
  InsertStoreFiscalConfig,
  SelectStoreFiscalConfig,
} from '@/services/db/schema/store-fiscal-configs'

export type StoreFiscalConfig = SelectStoreFiscalConfig
export type NewStoreFiscalConfig = InsertStoreFiscalConfig

export type ServiceInvoice = SelectServiceInvoice
export type NewServiceInvoice = InsertServiceInvoice

export type StoreAutoEmissionPaymentMethod = SelectStoreAutoEmissionPaymentMethod
export type NewStoreAutoEmissionPaymentMethod = InsertStoreAutoEmissionPaymentMethod

export type FiscalConfigStatus = SelectStoreFiscalConfig['status']
export type NfeioEnvironment = SelectStoreFiscalConfig['environment']
export type TaxRegime = SelectStoreFiscalConfig['taxRegime']
export type ServiceInvoiceStatus = SelectServiceInvoice['status']
export type ServiceInvoiceType = SelectServiceInvoice['type']

export interface ReservedInvoiceNumber {
  invoiceId: number
  series: number
  invoiceNumber: number
}

export interface CompanyFormData {
  federalTaxNumber: string
  name: string
  tradeName?: string
  taxRegime: TaxRegime
  email: string
  phone?: string
  addressStreet: string
  addressNumber: string
  addressComplement?: string
  addressNeighborhood: string
  addressCity: string
  addressState: string
  addressPostalCode: string
  addressCityCode: string
}

export interface FiscalSettingsFormData {
  nfeioApiKey: string
  environment: NfeioEnvironment
  stateRegistration?: string
  municipalRegistration?: string
  cscId?: string
  cscCode?: string
  nfceSeries: number
  nextNfceNumber: number
  accountantEmail?: string
}
