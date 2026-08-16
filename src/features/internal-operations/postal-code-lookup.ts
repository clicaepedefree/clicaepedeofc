import { normalizeInternalPostalCode } from './internal-store-creation-policy'

export type InternalPostalCodeAddress = {
  postalCode: string
  street: string
  district: string
  city: string
  stateCode: string
}

type InternalPostalCodeLookupResult =
  | { success: true; address: InternalPostalCodeAddress }
  | {
      success: false
      code: 'INVALID_POSTAL_CODE' | 'NOT_FOUND' | 'REQUEST_FAILED'
      error: string
    }

type ViaCepResponse = {
  cep?: unknown
  logradouro?: unknown
  bairro?: unknown
  localidade?: unknown
  uf?: unknown
  erro?: unknown
}

type PostalCodeLookupOptions = {
  fetchImpl?: typeof fetch
  timeoutMs?: number
}

const defaultPostalCodeLookupTimeoutMs = 2500

const normalizeViaCepText = (value: unknown) =>
  typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : ''

export const mapViaCepAddress = (
  data: ViaCepResponse,
  fallbackPostalCode: string
): InternalPostalCodeLookupResult => {
  if (data.erro === true) {
    return {
      success: false,
      code: 'NOT_FOUND',
      error: 'CEP nao encontrado. Preencha o endereco manualmente.',
    }
  }

  const address = {
    postalCode: normalizeInternalPostalCode(
      normalizeViaCepText(data.cep) || fallbackPostalCode
    ),
    street: normalizeViaCepText(data.logradouro),
    district: normalizeViaCepText(data.bairro),
    city: normalizeViaCepText(data.localidade),
    stateCode: normalizeViaCepText(data.uf).toUpperCase(),
  }

  if (address.postalCode.length !== 8 || !address.city || !address.stateCode) {
    return {
      success: false,
      code: 'REQUEST_FAILED',
      error: 'Nao foi possivel ler o retorno do CEP. Preencha manualmente.',
    }
  }

  return { success: true, address }
}

export async function lookupBrazilianPostalCode(
  postalCode: string,
  options: PostalCodeLookupOptions = {}
): Promise<InternalPostalCodeLookupResult> {
  const normalizedPostalCode = normalizeInternalPostalCode(postalCode)

  if (normalizedPostalCode.length !== 8) {
    return {
      success: false,
      code: 'INVALID_POSTAL_CODE',
      error: 'Informe um CEP com 8 digitos.',
    }
  }

  const controller = new AbortController()
  const timeout = setTimeout(
    () => controller.abort(),
    options.timeoutMs ?? defaultPostalCodeLookupTimeoutMs
  )

  try {
    const response = await (options.fetchImpl ?? fetch)(
      `https://viacep.com.br/ws/${normalizedPostalCode}/json/`,
      {
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      }
    )

    if (!response.ok) {
      return {
        success: false,
        code: 'REQUEST_FAILED',
        error: 'Nao foi possivel consultar o CEP. Preencha manualmente.',
      }
    }

    const data = (await response.json()) as ViaCepResponse

    return mapViaCepAddress(data, normalizedPostalCode)
  } catch {
    return {
      success: false,
      code: 'REQUEST_FAILED',
      error: 'Nao foi possivel consultar o CEP. Preencha manualmente.',
    }
  } finally {
    clearTimeout(timeout)
  }
}
