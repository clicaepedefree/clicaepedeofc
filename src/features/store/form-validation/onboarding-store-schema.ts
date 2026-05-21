import { z } from 'zod'

const subdomainRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export const reservedStoreSubdomains = new Set([
  'admin',
  'api',
  'app',
  'assets',
  'auth',
  'cdn',
  'dashboard',
  'dev',
  'help',
  'invoices',
  'localhost',
  'login',
  'mail',
  'menu',
  'pos',
  'preview',
  'reports',
  'settings',
  'staging',
  'static',
  'support',
  'test',
  'unauthorized',
  'www',
])

export const onboardingStoreSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'Informe o nome da loja')
    .max(80, 'Use ate 80 caracteres'),
  subdomain: z
    .string()
    .trim()
    .toLowerCase()
    .min(3, 'Use pelo menos 3 caracteres')
    .max(40, 'Use ate 40 caracteres')
    .regex(
      subdomainRegex,
      'Use apenas letras, numeros e hifens, sem hifen no inicio ou fim'
    )
    .refine(
      subdomain => !reservedStoreSubdomains.has(subdomain),
      'Esse endereco e reservado. Tente outro nome.'
    ),
})

export type OnboardingStoreFormValues = z.infer<typeof onboardingStoreSchema>
