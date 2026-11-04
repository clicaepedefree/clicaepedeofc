import { describe, expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { unconfiguredBenefitPrograms } from '../policy'

const { mock } = require('bun:test') as {
  mock: { module(name: string, factory: () => unknown): void }
}
let selected: number | null = 1
let configuration = {
  data: {
    ...unconfiguredBenefitPrograms(),
    version: 0,
    updatedAt: null as string | null,
    modules: { cashback: true, loyalty: true },
    products: [{ id: 1, name: 'Produto da loja' }],
  },
  isPending: false,
  isError: false,
  isFetching: false,
  isSaving: false,
  refetch: async () => ({}),
  save: async () => ({}),
  isCurrentStore: () => true,
}
mock.module('jotai', () => ({ useAtomValue: () => selected }))
mock.module('@/features/store/state', () => ({ selectedStoreIdAtom: {} }))
mock.module('../hooks/use-benefit-programs-configuration', () => ({
  useBenefitProgramsConfiguration: () => configuration,
}))
const { BenefitProgramsSettings } = await import('./benefit-programs-settings')
const html = () => renderToStaticMarkup(createElement(BenefitProgramsSettings))
const inputTag = (output: string, id: string) =>
  output.match(new RegExp(`<input[^>]*id="${id}"[^>]*>`))?.[0] ?? ''

describe('benefit programs settings controls', () => {
  test('unconfigured programs render empty, disabled and without commercial assumptions', () => {
    const output = html()
    expect(output.includes('Não configurado')).toBe(true)
    expect(output.includes('data-state="checked"')).toBe(false)
    expect(
      inputTag(output, 'benefits-cashback-percentage').includes('value=""')
    ).toBe(true)
    expect(output.includes('<fieldset disabled=""')).toBe(true)
    expect(output.includes('Opcional')).toBe(false)
    expect(output.includes('sem prazo')).toBe(false)
    expect(output.includes('sem mínimo')).toBe(false)
  })

  test('remount with a saved cached version is configured even without an updatedAt timestamp', () => {
    const previous = configuration
    try {
      configuration = {
        ...configuration,
        data: { ...configuration.data, version: 1, updatedAt: null },
      }
      for (let mount = 0; mount < 2; mount++) {
        const output = html()
        expect(output.includes('Versão 1')).toBe(true)
        expect(output.includes('Não configurado')).toBe(false)
        expect(configuration.data.updatedAt).toBe(null)
      }
    } finally {
      configuration = previous
    }
  })

  test('all active-program numeric fields are required and carry policy storage limits', () => {
    configuration.data.cashback.enabled = true
    configuration.data.loyalty.enabled = true
    configuration.data.loyalty.rewardType = 'cashback'
    const output = html()
    const integers = [
      'cashback-expiresAfterDays',
      'loyalty-requiredOrders',
      'loyalty-rewardExpiresAfterDays',
    ]
    const money = [
      'cashback-minimumOrderAmount',
      'loyalty-minimumOrderAmount',
      'loyalty-rewardAmount',
    ]
    for (const name of [...integers, ...money, 'cashback-percentage']) {
      expect(inputTag(output, `benefits-${name}`).includes('required=""')).toBe(
        true
      )
    }
    for (const name of integers)
      expect(
        inputTag(output, `benefits-${name}`).includes('max="2147483647"')
      ).toBe(true)
    for (const name of money)
      expect(
        inputTag(output, `benefits-${name}`).includes('max="9999999999.99"')
      ).toBe(true)
    expect(
      inputTag(output, 'benefits-cashback-percentage').includes('max="100"')
    ).toBe(true)
    expect(
      output.includes(
        'Configuração de regras. Concessão e resgate ainda indisponíveis.'
      )
    ).toBe(false)
    expect(output.includes('Ganhos disponíveis')).toBe(false)
    expect(output.includes('Mudanças valem para novos pedidos')).toBe(false)
  })

  test('product rewards have a labelled required selector instead of a numeric product id', () => {
    configuration.data.loyalty.rewardType = 'product'
    const output = html()
    expect(output.includes('for="benefits-reward-product"')).toBe(true)
    expect(
      output
        .match(/<select[^>]*id="benefits-reward-product"[^>]*>/)?.[0]
        .includes('required=""')
    ).toBe(true)
    expect(output.includes('Produto da loja')).toBe(true)
    expect(inputTag(output, 'benefits-loyalty-rewardAmount')).toBe('')
  })

  test('unavailable modules disable both program switches', () => {
    configuration.data.modules = { cashback: false, loyalty: false }
    configuration.data.cashback.enabled = false
    configuration.data.loyalty.enabled = false
    const output = html()
    for (const program of ['cashback', 'loyalty']) {
      const tag =
        output.match(
          new RegExp(`<button[^>]*id="benefits-${program}-enabled"[^>]*>`)
        )?.[0] ?? ''
      expect(tag.includes('disabled=""')).toBe(true)
    }
    expect(output.includes('responsável pela assinatura')).toBe(true)
  })

  test('read failure shows actionable permission guidance, not an empty editable form', () => {
    const previous = configuration
    configuration = {
      ...configuration,
      data: undefined as unknown as typeof configuration.data,
      isError: true,
    }
    const output = html()
    expect(output.includes('permissão com o responsável pela loja')).toBe(true)
    expect(output.includes('Recarregar')).toBe(true)
    expect(output.includes('<input')).toBe(false)
    configuration = previous
  })

  test('no selected store never shows benefit inputs', () => {
    selected = null
    expect(html().includes('Selecione uma loja')).toBe(true)
    expect(html().includes('<input')).toBe(false)
  })
})
