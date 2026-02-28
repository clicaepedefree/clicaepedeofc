import { NfeClient } from 'nfe-io'
import type {
  NfeIoCertificateStatus,
  NfeIoCertificateUpload,
  NfeIoCompany,
  NfeIoCompanyInput,
  NfeIoEnvironment,
  NfeIoInvoice,
  NfeIoInvoiceIssueData,
  NfeIoNfceInput,
  NfeIoStateTax,
  NfeIoStateTaxInput,
} from './types'

export class NfeIoService {
  private client: NfeClient

  constructor(apiKey: string, environment: NfeIoEnvironment = 'sandbox') {
    this.client = new NfeClient({
      apiKey,
      environment: environment === 'production' ? 'production' : 'development',
    })
  }

  async createCompany(data: NfeIoCompanyInput): Promise<NfeIoCompany> {
    return await this.client.companies.create({
      name: data.name,
      tradeName: data.tradeName,
      federalTaxNumber: data.federalTaxNumber,
      email: data.email,
      address: {
        country: data.address.country,
        postalCode: data.address.postalCode,
        street: data.address.street,
        number: data.address.number,
        additionalInformation: data.address.additionalInformation,
        district: data.address.district,
        city: data.address.city,
        state: data.address.state,
      },
      taxRegime: data.taxRegime,
      municipalTaxNumber: data.municipalTaxNumber ?? '',
    })
  }

  async updateCompany(
    companyId: string,
    data: Partial<NfeIoCompanyInput>
  ): Promise<NfeIoCompany> {
    const updateData: Record<string, unknown> = {}

    if (data.name) updateData.name = data.name
    if (data.tradeName) updateData.tradeName = data.tradeName
    if (data.email) updateData.email = data.email
    if (data.address) {
      updateData.address = {
        country: data.address.country,
        postalCode: data.address.postalCode,
        street: data.address.street,
        number: data.address.number,
        additionalInformation: data.address.additionalInformation,
        district: data.address.district,
        city: data.address.city,
        state: data.address.state,
      }
    }
    if (data.municipalTaxNumber)
      updateData.municipalTaxNumber = data.municipalTaxNumber

    return await this.client.companies.update(companyId, updateData)
  }

  async getCompany(companyId: string): Promise<NfeIoCompany> {
    return await this.client.companies.retrieve(companyId)
  }

  async uploadCertificate(
    companyId: string,
    data: NfeIoCertificateUpload
  ): Promise<NfeIoCertificateStatus> {
    await this.client.companies.uploadCertificate(companyId, {
      file: data.file,
      password: data.password,
    })

    const status = await this.getCertificateStatus(companyId)
    return status ?? { status: 'Pending' }
  }

  async getCertificateStatus(
    companyId: string
  ): Promise<NfeIoCertificateStatus | null> {
    const result = await this.client.companies.getCertificateStatus(companyId)
    if (!result.hasCertificate) {
      return null
    }
    return {
      expiresOn: result.expiresOn,
      status: result.isValid ? 'Active' : 'Overdue',
    }
  }

  async createStateTax(
    companyId: string,
    data: NfeIoStateTaxInput
  ): Promise<NfeIoStateTax> {
    return await this.client.stateTaxes.create(companyId, {
      ...data,
      environmentType: data.environment === 'production' ? 'production' : 'test',
    })
  }

  async updateStateTax(
    companyId: string,
    stateTaxId: string,
    data: Partial<NfeIoStateTaxInput>
  ): Promise<NfeIoStateTax> {
    const { environment, ...restData } = data

    return await this.client.stateTaxes.update(companyId, stateTaxId, {
      ...restData,
      ...(environment && {
        environmentType: environment === 'production' ? 'production' : 'test',
      }),
    })
  }

  async issueNfce(
    companyId: string,
    data: NfeIoNfceInput
  ): Promise<NfeIoInvoiceIssueData> {
    return await this.client.productInvoices.create(companyId, {
      ...data,
      // NFCe-specific defaults
      operationType: 'Outgoing',
      destination: 'Internal_Operation',
      consumerType: 'FinalConsumer',
      printType: data.printType ?? 'DANFE_NFC_E',
      presenceType: data.presenceType ?? 'Presence',
    })
  }

  async getNfceStatus(
    companyId: string,
    invoiceId: string
  ): Promise<NfeIoInvoice> {
    return await this.client.productInvoices.retrieve(companyId, invoiceId)
  }

  async getNfcePdfUrl(
    companyId: string,
    invoiceId: string
  ): Promise<string | null> {
    const result = await this.client.productInvoices.downloadPdf(
      companyId,
      invoiceId
    )
    return result.uri ?? null
  }

  async getNfceXmlUrl(
    companyId: string,
    invoiceId: string
  ): Promise<string | null> {
    const result = await this.client.productInvoices.downloadXml(
      companyId,
      invoiceId
    )
    return result.uri ?? null
  }

  async cancelNfce(
    companyId: string,
    invoiceId: string,
    reason?: string
  ): Promise<void> {
    await this.client.productInvoices.cancel(companyId, invoiceId, reason)
  }
}

export * from './types'
