import { describe, expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

// The repository's minimal bun:test declaration omits module mocking.
const { mock } = require('bun:test') as {
  mock: { module(name: string, factory: () => unknown): void }
}

let connectionState: {
  connection: unknown
  error: Error | null
  isLoading: boolean
} = {
  connection: null,
  error: null,
  isLoading: false,
}
let accessState = {
  stores: [{ id: 9, userRole: 'cashier' }],
  selectedStoreId: 9,
  isLoading: false,
  isError: false,
}
let protectedReads = 0
let mutations = 0
const mutate = () => {
  mutations++
}

mock.module('jotai', () => ({ useAtomValue: () => 9 }))
mock.module('next/navigation', () => ({ useRouter: () => ({ push: mutate }) }))
mock.module('@/features/store/hooks/use-available-stores', () => ({
  useAvailableStores: () => accessState,
}))
mock.module('@/features/ifood/api', () => ({ disconnectIFoodAccount: mutate }))
mock.module('@/features/ifood/components/ifood-connection-modal', () => ({
  IFoodConnectionModal: () => null,
}))
mock.module('@/features/qz-tray/components/qz-tray-connection-card', () => ({
  QzTrayConnectionCard: () => null,
}))
mock.module(
  '@/features/whatsapp-bot/components/whatsapp-automation-settings',
  () => ({ WhatsappAutomationSettings: () => null })
)
mock.module('@/features/ifood/hooks/use-ifood-connection', () => ({
  useIFoodConnection: () => {
    protectedReads++
    return { ...connectionState, refetch: mutate }
  },
}))
mock.module('@/features/whatsapp-bot/hooks/use-whatsapp-connection', () => ({
  useWhatsappConnection: () => ({
    ...connectionState,
    isMutating: false,
    startConnection: mutate,
    renewQrCode: mutate,
    pauseConnection: mutate,
    disconnectConnection: mutate,
  }),
}))
mock.module(
  '@/features/whatsapp-bot/hooks/use-whatsapp-assistant-config',
  () => ({
    useWhatsappAssistantConfig: () => ({
      config: null,
      error: connectionState.error,
      isLoading: connectionState.isLoading,
      isSaving: false,
      isTesting: false,
      saveConfig: mutate,
      testAssistant: mutate,
      testResult: null,
    }),
  })
)

const { IntegrationsSettings } = await import('./integrations-settings')
const { IFoodConnectionCard } = await import(
  '@/features/ifood/components/ifood-connection-card'
)
const { WhatsappConnectionCard } = await import(
  '@/features/whatsapp-bot/components/whatsapp-connection-card'
)
const { WhatsappAssistantConfigCard } = await import(
  '@/features/whatsapp-bot/components/whatsapp-assistant-config-card'
)
const html = (component: () => React.ReactNode) =>
  renderToStaticMarkup(createElement(component))

describe('integration read states without live actions', () => {
  test('denied role receives Portuguese warning without mounting protected controls or reads', () => {
    const before = protectedReads
    const output = html(IntegrationsSettings)
    expect(output.includes('Voce nao tem permissao')).toBe(true)
    expect(output.includes('Estado das conexoes desconhecido')).toBe(true)
    expect(output.includes('<button')).toBe(false)
    expect(protectedReads).toBe(before)
  })

  test('failed access lookup cannot reuse cached owner permission', () => {
    accessState = {
      ...accessState,
      stores: [{ id: 9, userRole: 'owner' }],
      isError: true,
    }
    const output = html(IntegrationsSettings)
    expect(output.includes('Nao foi possivel verificar o acesso')).toBe(true)
    expect(output.includes('<button')).toBe(false)
  })

  test('opaque Server Components errors do not become disconnected or actionable forms', () => {
    connectionState = {
      connection: { status: 'connected', id: 1 },
      isLoading: false,
      error: new Error(
        'An error occurred in the Server Components render. digest=private'
      ),
    }
    for (const component of [
      IFoodConnectionCard,
      WhatsappConnectionCard,
      WhatsappAssistantConfigCard,
    ]) {
      const output = html(component)
      expect(output.includes('estado desconhecido')).toBe(true)
      expect(output.includes('permissao')).toBe(true)
      expect(output.includes('Server Components')).toBe(false)
      expect(output.includes('digest')).toBe(false)
      expect(output.includes('Desconectado')).toBe(false)
      expect(output.includes('<button')).toBe(false)
      expect(output.includes('<input')).toBe(false)
    }
    expect(mutations).toBe(0)
  })

  test('loading never claims disconnection; successful empty lookup can show disconnected', () => {
    connectionState = { connection: null, isLoading: true, error: null }
    expect(html(IFoodConnectionCard).includes('Carregando')).toBe(true)
    expect(html(WhatsappConnectionCard).includes('Desconectado')).toBe(false)
    connectionState = { ...connectionState, isLoading: false }
    expect(html(IFoodConnectionCard).includes('Desconectado')).toBe(true)
    expect(mutations).toBe(0)
  })
})
