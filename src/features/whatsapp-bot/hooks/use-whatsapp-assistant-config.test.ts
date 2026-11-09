import { describe, expect, test } from 'bun:test'
import {
  mock,
  renderHooks,
  resetHarness,
  unmount,
} from '../components/__tests__/assistant-ui-harness'
import { buildDefaultWhatsappAssistantConfig } from '../assistant-config-policy'

let storeId = 1
let writes = 0
let calls: any[] = []
let invalidations: unknown[] = []
let toasts: unknown[] = []
let response: () => Promise<unknown>
const dto = {
  mode: 'dry_run',
  status: 'unavailable',
  reason: 'provider_not_configured',
  reply: null,
  sentToCustomer: false,
  businessEffects: false,
  assistantName: 'Rascunho',
  latencyMs: 7,
  usage: null,
}
const values = buildDefaultWhatsappAssistantConfig('Loja')
mock.module('@/features/whatsapp-bot/api', () => ({
  getWhatsappAssistantConfig: async () => null,
  saveWhatsappAssistantConfig: async () => {
    writes++
    return null
  },
  testWhatsappAssistantConfig: async (input: unknown) => {
    calls.push(input)
    return response()
  },
}))
mock.module('@/shared/lib/toast', () => ({
  dispatchToast: (value: unknown) => toasts.push(value),
}))
mock.module('@tanstack/react-query', () => ({
  useQueryClient: () => ({
    invalidateQueries: (input: unknown) => invalidations.push(input),
  }),
  useQuery: () => ({ data: null, error: null, isLoading: false }),
  useMutation: (options: any) => ({
    isPending: false,
    mutateAsync: async (input: unknown) => {
      try {
        const result = await options.mutationFn(input)
        options.onSuccess?.(result, input)
        return result
      } catch (error) {
        options.onError?.(error, input)
        throw error
      }
    },
  }),
}))
const { useWhatsappAssistantConfig } = await import(
  './use-whatsapp-assistant-config'
)
const render = () => renderHooks(() => useWhatsappAssistantConfig(storeId))
const setup = () => {
  resetHarness()
  storeId = 1
  writes = 0
  calls = []
  toasts = []
  invalidations = []
  response = async () => dto
  return render()
}

describe('assistant draft testing without persistence or a live model', () => {
  test('preserves every agreed dry-run status and nullable usage without calling a model', async () => {
    const hook = setup()
    for (const status of [
      'responded',
      'fallback',
      'handoff',
      'unavailable',
    ] as const) {
      response = async () => ({
        ...dto,
        status,
        reply: status === 'unavailable' ? null : 'Offline fixture',
        usage: { inputTokens: null, outputTokens: 4, totalTokens: null },
      })
      await hook.testAssistant({ message: 'Oi', values })
      expect(render().testResult?.status).toBe(status)
      expect(render().testResult?.usage?.outputTokens).toBe(4)
    }
    hook.resetTest()
    expect(render().testResult).toBe(null)
    expect(writes).toBe(0)
  })

  test('submits the current draft and captures the tested message without saving', async () => {
    const hook = setup()
    await hook.testAssistant({
      message: '  Cardapio?  ',
      values: { ...values, assistantName: 'Rascunho' },
    })
    expect(writes).toBe(0)
    expect(calls[0]).toEqual({
      storeId: 1,
      message: 'Cardapio?',
      values: { ...values, assistantName: 'Rascunho' },
    })
    expect(render().testResult?.message).toBe('Cardapio?')
    expect(render().testResult?.status).toBe('unavailable')
    expect(toasts).toHaveLength(0)
  })

  test('rejects empty, over-limit and invalid draft input before any action', async () => {
    const hook = setup()
    for (const message of ['', '   ', 'x'.repeat(501)])
      await hook.testAssistant({ message, values })
    await hook.testAssistant({
      message: 'Oi',
      values: { ...values, assistantName: '' },
    })
    expect(calls).toHaveLength(0)
    expect(writes).toBe(0)
  })

  test('clears results and discards pending tests on edit/reset, save or store change', async () => {
    for (const change of ['reset', 'save', 'store', 'unmount']) {
      const hook = setup()
      let resolve!: (value: unknown) => void
      response = () =>
        new Promise(done => {
          resolve = done
        })
      const pending = hook.testAssistant({ message: 'Oi', values })
      expect(render().isTesting).toBe(true)
      if (change === 'reset') hook.resetTest()
      if (change === 'save') await hook.saveConfig(values)
      if (change === 'store') {
        storeId = 2
        render()
      }
      if (change === 'unmount') unmount()
      resolve(dto)
      await pending
      expect(render().testResult).toBe(null)
      expect(writes).toBe(change === 'save' ? 1 : 0)
    }
  })

  test('the latest request wins, even if an older request finishes last', async () => {
    const hook = setup()
    let resolve!: (value: unknown) => void
    response = () =>
      new Promise(done => {
        resolve = done
      })
    const pending = hook.testAssistant({ message: 'Primeira', values })
    response = async () => dto
    await hook.testAssistant({ message: 'Segunda', values })
    resolve({ ...dto, status: 'responded', reply: 'Resposta antiga' })
    await pending
    expect(render().testResult?.message).toBe('Segunda')
  })

  test('old and unsafe contracts cannot display static previews as generated answers', async () => {
    const hook = setup()
    for (const result of [
      { reply: 'Static preview' },
      { ...dto, sentToCustomer: true },
    ]) {
      response = async () => result
      await hook.testAssistant({ message: 'Oi', values })
      expect(render().testResult?.status).toBe('unavailable')
      expect(render().testResult?.reply).toBe(null)
    }
  })

  test('reports current failures generically, suppresses stale failures and recovers', async () => {
    const hook = setup()
    response = async () => {
      throw new Error('SECRET_PROVIDER_ERROR')
    }
    await hook.testAssistant({ message: 'Oi', values })
    expect(render().testError).toBe(
      'Nao foi possivel testar o rascunho. Tente novamente.'
    )
    expect(render().isTesting).toBe(false)
    let reject!: (error: Error) => void
    response = () =>
      new Promise((_, fail) => {
        reject = fail
      })
    const pending = hook.testAssistant({ message: 'Outra', values })
    hook.resetTest()
    reject(new Error('SECRET_STALE_ERROR'))
    await pending
    expect(render().testError).toBe(null)
    response = async () => dto
    await hook.testAssistant({ message: 'Novamente', values })
    expect(render().testResult?.status).toBe('unavailable')
  })

  test('save invalidates the originating store, not the newly selected store', async () => {
    const hook = setup()
    storeId = 2
    render()
    await hook.saveConfig(values)
    expect(invalidations).toEqual([
      { queryKey: ['whatsapp-assistant-config', 1] },
    ])
    expect(toasts).toHaveLength(0)
  })
})
