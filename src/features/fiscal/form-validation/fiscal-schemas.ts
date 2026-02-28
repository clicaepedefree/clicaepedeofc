import { z } from 'zod'

const cnpjRegex = /^\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}$|^\d{14}$/

export const companyFormSchema = z.object({
  federalTaxNumber: z
    .string()
    .nonempty('CNPJ é obrigatório')
    .refine(value => cnpjRegex.test(value.replace(/\D/g, '') || value), 'CNPJ inválido'),
  name: z.string().nonempty('Razão social é obrigatória').min(3, 'Razão social deve ter pelo menos 3 caracteres'),
  tradeName: z.string().optional(),
  taxRegime: z.enum(['simplesNacional', 'simplesNacionalExcessoSublimite', 'regimeNormal', 'mei']).nullable(),
  email: z.string().nonempty('Email é obrigatório').email('Email inválido'),
  phone: z.string().optional(),
  addressStreet: z.string().nonempty('Logradouro é obrigatório'),
  addressNumber: z.string().nonempty('Número é obrigatório'),
  addressComplement: z.string().optional(),
  addressNeighborhood: z.string().nonempty('Bairro é obrigatório'),
  addressCity: z.string().nonempty('Cidade é obrigatória'),
  addressState: z.string().nonempty('Estado é obrigatório').length(2, 'Use a sigla do estado (UF)'),
  addressPostalCode: z.string().nonempty('CEP é obrigatório'),
  addressCityCode: z.string().nonempty('Código IBGE é obrigatório'),
})

export const fiscalSettingsFormSchema = z.object({
  nfeioApiKey: z.string().nonempty('Chave de API é obrigatória'),
  environment: z.enum(['sandbox', 'production']),
  stateRegistration: z.string().optional(),
  municipalRegistration: z.string().optional(),
  cscId: z.string().optional(),
  cscCode: z.string().optional(),
  nfceSeries: z.number().int().positive('Série deve ser um número positivo'),
  nextNfceNumber: z.number().int().positive('Número inicial deve ser positivo'),
  accountantEmail: z.string().email('Email inválido').optional().or(z.literal('')),
})

export const certificateUploadSchema = z.object({
  password: z.string().nonempty('Senha do certificado é obrigatória'),
})

export type CompanyFormValues = z.infer<typeof companyFormSchema>
export type FiscalSettingsFormValues = z.infer<typeof fiscalSettingsFormSchema>
export type CertificateUploadFormValues = z.infer<typeof certificateUploadSchema>
