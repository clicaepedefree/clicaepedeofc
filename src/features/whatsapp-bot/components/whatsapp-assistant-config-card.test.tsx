import { describe, expect, test } from 'bun:test'
import type { ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  mock,
  renderHooks,
  resetHarness,
} from './__tests__/assistant-ui-harness'
import { buildDefaultWhatsappAssistantConfig } from '../assistant-config-policy'
import type { AssistantDraftTestResult } from '../hooks/use-whatsapp-assistant-config'

type Element = ReactElement<Record<string, any>>
let storeId = 1
let saves: unknown[] = []
let tests: any[] = []
let resets = 0
let saveThrows = false
let hook: any
const config = {
  ...buildDefaultWhatsappAssistantConfig('Loja'),
  storeName: 'Loja',
  storeId: 1,
  status: 'draft',
}
const resetTest = () => {
  resets++
  hook.testResult = null
  hook.testError = null
}
mock.module('jotai', () => ({ useAtomValue: () => storeId }))
mock.module(
  '@/features/whatsapp-bot/hooks/use-whatsapp-assistant-config',
  () => ({
    useWhatsappAssistantConfig: () => hook,
  })
)
mock.module('sonner', () => ({ toast: { info: () => {} } }))
const { WhatsappAssistantConfigCard } = await import(
  './whatsapp-assistant-config-card'
)
const { WhatsappAssistantTestResult } = await import(
  './whatsapp-assistant-test-result'
)
const tree = (): Element =>
  renderHooks(() => {
    const root = WhatsappAssistantConfigCard() as Element
    return (root.type as (props: unknown) => Element)(root.props)
  })
const find = (
  node: Element,
  predicate: (node: Element) => boolean
): Element | undefined => {
  if (!node || typeof node !== 'object') return
  if (predicate(node)) return node
  for (const child of [node.props?.children].flat(Infinity)) {
    const found = find(child as Element, predicate)
    if (found) return found
  }
}
const control = (label: string) =>
  find(tree(), node => [node.props?.children].flat().includes(label))!
const nameInput = () =>
  find(tree(), node => node.props?.placeholder === 'Assistente virtual')!
const testInput = () => find(tree(), node => node.props?.maxLength === 500)!
const markup = () => renderToStaticMarkup(tree())
const result = (
  status: AssistantDraftTestResult['status']
): AssistantDraftTestResult => ({
  mode: 'dry_run',
  status,
  reason: 'provider_not_configured',
  reply: 'Texto retornado',
  sentToCustomer: false,
  businessEffects: false,
  assistantName: 'Assistente virtual',
  latencyMs: 12,
  usage: null,
  message: 'Mensagem original',
})
const setup = () => {
  resetHarness()
  storeId = 1
  saves = []
  tests = []
  resets = 0
  saveThrows = false
  hook = {
    config,
    error: null,
    isLoading: false,
    isSaving: false,
    isTesting: false,
    testResult: null,
    testError: null,
    resetTest,
    saveConfig: async (values: unknown) => {
      saves.push(values)
      if (saveThrows) throw new Error('Private')
    },
    testAssistant: async (input: unknown) => {
      tests.push(input)
    },
  }
  tree()
}

describe('assistant draft controls and accessible result states', () => {
  test('test submits edited draft, never implicitly saves, and explicit save remains separate', async () => {
    setup()
    nameInput().props.onChange({ target: { value: 'Novo nome' } })
    await control('Testar rascunho').props.onClick()
    expect(tests[0].values.assistantName).toBe('Novo nome')
    expect(tests[0].message).toBe('Quem e voce e como pode me ajudar?')
    expect(saves).toHaveLength(0)
    await control('Salvar personalidade').props.onClick()
    expect(saves).toHaveLength(1)
    expect(markup().includes('Salvar e testar')).toBe(false)
  })

  test('empty messages, invalid drafts and pending operations disable testing', () => {
    setup()
    testInput().props.onChange({ target: { value: '   ' } })
    expect(control('Testar rascunho').props.disabled).toBe(true)
    testInput().props.onChange({ target: { value: 'Oi' } })
    nameInput().props.onChange({ target: { value: '' } })
    expect(control('Testar rascunho').props.disabled).toBe(true)
    nameInput().props.onChange({ target: { value: 'Nome valido' } })
    expect(control('Testar rascunho').props.disabled).toBe(false)
    hook.isTesting = true
    expect(control('Testar rascunho').props.disabled).toBe(true)
    expect(markup().includes('Testando rascunho...')).toBe(true)
    hook.isTesting = false
    hook.isSaving = true
    expect(control('Testar rascunho').props.disabled).toBe(true)
  })

  test('draft, test-message and reset edits clear prior results', () => {
    setup()
    for (const edit of [
      () => nameInput().props.onChange({ target: { value: 'Outro nome' } }),
      () => testInput().props.onChange({ target: { value: 'Outra pergunta' } }),
      () => control('Restaurar padrao').props.onClick(),
    ]) {
      hook.testResult = result('responded')
      edit()
      expect(hook.testResult).toBe(null)
    }
    expect(resets).toBeGreaterThan(3)
  })

  test('all statuses are live and neutral; unavailable never exposes reply or internal reason', () => {
    setup()
    const labels = {
      unavailable: 'Teste indisponivel',
      responded: 'Resposta do assistente',
      fallback: 'Resposta de contingencia',
      handoff: 'Atendimento humano indicado',
    } as const
    for (const status of Object.keys(labels) as (keyof typeof labels)[]) {
      const html = renderToStaticMarkup(
        <WhatsappAssistantTestResult result={result(status)} />
      )
      expect(html.includes(labels[status])).toBe(true)
      expect(html.includes('aria-live="polite"')).toBe(true)
      expect(html.includes('Mensagem original')).toBe(true)
      expect(html.includes('provider_not_configured')).toBe(false)
      expect(html.includes('Texto retornado')).toBe(
        status === 'responded' || status === 'fallback'
      )
      expect(html.includes('bg-primary')).toBe(false)
    }
  })

  test('SSR explains unavailable provider and budget without exposing raw reasons or fake replies', () => {
    const cases = [
      [
        'provider_not_configured',
        'Nenhum provedor de IA foi configurado para o teste.',
      ],
      [
        'budget_not_configured',
        'O consumo de IA ainda nao foi liberado para o teste.',
      ],
      [
        'private_unknown_reason',
        'O assistente nao esta disponivel para gerar uma resposta neste teste.',
      ],
      [
        null,
        'O assistente nao esta disponivel para gerar uma resposta neste teste.',
      ],
    ] as const
    for (const [reason, description] of cases) {
      const html = renderToStaticMarkup(
        <WhatsappAssistantTestResult
          result={{ ...result('unavailable'), reason }}
        />
      )
      expect(html.includes(description)).toBe(true)
      expect(html.includes('Teste indisponivel')).toBe(true)
      expect(html.includes('Texto retornado')).toBe(false)
      if (reason) expect(html.includes(reason)).toBe(false)
    }
    const html = renderToStaticMarkup(
      <WhatsappAssistantTestResult
        result={{ ...result('responded'), reply: null }}
      />
    )
    expect(html.includes('Resposta do assistente')).toBe(true)
    expect(html.includes('Nenhum provedor')).toBe(false)
    expect(html.includes('Texto retornado')).toBe(false)
  })

  test('store change remounts the form; read errors and loading do not expose prior controls', () => {
    setup()
    const oldKey = WhatsappAssistantConfigCard().key
    storeId = 2
    expect(WhatsappAssistantConfigCard().key === oldKey).toBe(false)
    resetHarness()
    hook = { ...hook, config: null, isLoading: true }
    expect(markup().includes('Carregando configuracao')).toBe(true)
    expect(markup().includes('Mensagem original')).toBe(false)
    hook.error = new Error('Private read error')
    expect(markup().includes('<textarea')).toBe(false)
    expect(markup().includes('Private read error')).toBe(false)
  })

  test('save failure is caught and test error has alert semantics', async () => {
    setup()
    nameInput().props.onChange({ target: { value: 'Novo nome' } })
    saveThrows = true
    await control('Salvar personalidade').props.onClick()
    hook.testError = 'Nao foi possivel testar o rascunho. Tente novamente.'
    expect(markup().includes('role="alert"')).toBe(true)
    expect(markup().includes('Private')).toBe(false)
  })

  test('keyboard controls retain names, pressed state and responsive wrapping', () => {
    setup()
    const html = markup()
    expect(html.includes('aria-label="Modo de teste"')).toBe(true)
    expect(html.includes('aria-pressed="true"')).toBe(true)
    expect(html.includes('aria-label="Teste do rascunho"')).toBe(true)
    expect(html.includes('flex-wrap')).toBe(true)
    expect(html.includes('min-w-0')).toBe(true)
    expect(control('Testar rascunho').props.type).toBe('button')
  })
})
