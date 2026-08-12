import { describe, expect, test } from 'bun:test'

import {
  DigitalMenuOrderDomainError,
  getDigitalMenuOrderDomainFailure,
} from './submission-errors'

describe('getDigitalMenuOrderDomainFailure', () => {
  test('preserva mensagem clara para erro esperado de regra de negocio', () => {
    const result = getDigitalMenuOrderDomainFailure(
      new DigitalMenuOrderDomainError(
        'Este cupom ja atingiu o limite de uso para este telefone.'
      )
    )

    expect(result).toEqual({
      ok: false,
      code: 'SUBMISSION_FAILED',
      message: 'Este cupom ja atingiu o limite de uso para este telefone.',
    })
  })

  test('nao expoe erros inesperados pelo caminho de regra de negocio', () => {
    const result = getDigitalMenuOrderDomainFailure(
      new Error('database connection failed')
    )

    expect(result).toBe(null)
  })
})
