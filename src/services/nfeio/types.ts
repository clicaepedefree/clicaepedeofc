/**
 * Domain types for our service layer.
 *
 * OUTPUT TYPES: Re-exported from SDK - use these directly.
 * INPUT TYPES: Derived from SDK types via Pick/Omit. The service acts as a
 * pass-through adapter; any enrichment/defaults are handled by the usecase layer.
 */

import type {
  NfeProductInvoiceIssueData,
  NfeStateTaxCreateData,
  TaxRegime,
} from 'nfe-io'

// ============================================
// OUTPUT TYPES (re-exported from SDK)
// ============================================

export type {
  Company as NfeIoCompany,
  NfeStateTax as NfeIoStateTax,
  NfeProductInvoice as NfeIoInvoice,
  NfeProductInvoiceIssueData as NfeIoInvoiceIssueData,
  // Re-export SDK types used in inputs so callers don't need to import from 'nfe-io'
  NfeInvoiceItemResource as NfeIoInvoiceItem,
  NfePaymentResource as NfeIoPayment,
  NfeProductInvoiceBuyer as NfeIoBuyer,
} from 'nfe-io'

/**
 * Certificate status type.
 * The SDK doesn't export this as a standalone type (it's defined inline in the
 * OpenAPI schema within Company.certificate.status), so we define it explicitly.
 */
export type NfeIoCertificateStatusValue = 'Active' | 'Pending' | 'Overdue' | 'None'

// ============================================
// DOMAIN INPUT TYPES
// ============================================

/**
 * Environment type used throughout our application.
 * - 'sandbox' maps to NFe.io SDK's 'development'/'test'
 * - 'production' maps to NFe.io SDK's 'production'
 */
export type NfeIoEnvironment = 'sandbox' | 'production'

/**
 * Company input type.
 * The SDK's Company type is a simplified placeholder with `[key: string]: unknown`,
 * so we define a proper typed interface matching what the API actually expects.
 */
export interface NfeIoCompanyInput {
  name: string
  tradeName?: string
  federalTaxNumber: number
  email: string
  address: {
    country: string
    postalCode: string
    street: string
    number: string
    additionalInformation?: string
    district: string
    city: { code: string; name: string }
    state: string
  }
  taxRegime: TaxRegime
  municipalTaxNumber?: string
  regionalTaxNumber?: number
}

export interface NfeIoCertificateUpload {
  file: string
  password: string
}

export interface NfeIoCertificateStatus {
  thumbprint?: string
  expiresOn?: string
  status?: NfeIoCertificateStatusValue
}

/**
 * State tax input type.
 * Extends SDK's NfeStateTaxCreateData but replaces `environmentType` with our
 * simplified `environment` ('sandbox'/'production') that maps to SDK values.
 */
export type NfeIoStateTaxInput = Omit<NfeStateTaxCreateData, 'environmentType'> & {
  environment?: NfeIoEnvironment
}

/**
 * NFCe input type - uses SDK types with required serie/number.
 * NFCe protocol requires these fields; enforced at service level for compile-time safety.
 */
export type NfeIoNfceInput = Omit<
  Pick<
    NfeProductInvoiceIssueData,
    | 'serie'
    | 'number'
    | 'operationNature'
    | 'buyer'
    | 'items'
    | 'payment'
    | 'printType'
    | 'presenceType'
  >,
  'serie' | 'number'
> & {
  serie: number
  number: number
}
