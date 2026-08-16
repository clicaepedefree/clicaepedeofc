import { describe, expect, test } from 'bun:test'
import {
  lookupBrazilianPostalCode,
  mapViaCepAddress,
} from './postal-code-lookup'

const buildFetchResponse = ({
  ok = true,
  data,
}: {
  ok?: boolean
  data: unknown
}) =>
  ({
    ok,
    json: async () => data,
  }) as Response

describe('internal postal code lookup', () => {
  test('maps ViaCEP response into normalized internal address', () => {
    const result = mapViaCepAddress(
      {
        cep: '01001-000',
        logradouro: ' Praca   da Se ',
        bairro: ' Se ',
        localidade: ' Sao   Paulo ',
        uf: 'sp',
      },
      '01001000'
    )

    expect(result).toEqual({
      success: true,
      address: {
        postalCode: '01001000',
        street: 'Praca da Se',
        district: 'Se',
        city: 'Sao Paulo',
        stateCode: 'SP',
      },
    })
  })

  test('looks up valid CEP using the expected ViaCEP endpoint', async () => {
    const calls: string[] = []
    const fetchImpl = (async (url: RequestInfo | URL) => {
      calls.push(String(url))

      return buildFetchResponse({
        data: {
          cep: '01001-000',
          logradouro: 'Praca da Se',
          bairro: 'Se',
          localidade: 'Sao Paulo',
          uf: 'SP',
        },
      })
    }) as typeof fetch

    const result = await lookupBrazilianPostalCode('01001-000', {
      fetchImpl,
      timeoutMs: 50,
    })

    expect(calls).toEqual(['https://viacep.com.br/ws/01001000/json/'])
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.address.city).toBe('Sao Paulo')
    }
  })

  test('returns manual fallback message when CEP is not found', async () => {
    const fetchImpl = (async () =>
      buildFetchResponse({ data: { erro: true } })) as typeof fetch

    const result = await lookupBrazilianPostalCode('99999999', { fetchImpl })

    expect(result).toEqual({
      success: false,
      code: 'NOT_FOUND',
      error: 'CEP nao encontrado. Preencha o endereco manualmente.',
    })
  })

  test('rejects invalid CEP without calling external service', async () => {
    let called = false
    const fetchImpl = (async () => {
      called = true
      return buildFetchResponse({ data: {} })
    }) as typeof fetch

    const result = await lookupBrazilianPostalCode('010010000', { fetchImpl })

    expect(called).toBe(false)
    expect(result).toEqual({
      success: false,
      code: 'INVALID_POSTAL_CODE',
      error: 'Informe um CEP com 8 digitos.',
    })
  })

  test('keeps manual fallback available when external service fails', async () => {
    const fetchImpl = (async () =>
      buildFetchResponse({ ok: false, data: {} })) as typeof fetch

    const result = await lookupBrazilianPostalCode('01001000', { fetchImpl })

    expect(result).toEqual({
      success: false,
      code: 'REQUEST_FAILED',
      error: 'Nao foi possivel consultar o CEP. Preencha manualmente.',
    })
  })
})
