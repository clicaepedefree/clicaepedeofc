import { describe, expect, test } from 'bun:test'
import type { ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { CheckoutProductReward } from './checkout-wallet'

const { mock } = require('bun:test') as {
  mock: { module(name: string, factory: () => unknown): void }
}
const React = require('react')
type Slot = {
  value?: any
  current?: unknown
  deps?: unknown[]
  cleanup?: () => void
}
let slots: Slot[] = []
let cursor = 0
let dirty = false
let effects: (() => void)[] = []
mock.module('react', () => ({
  ...React,
  default: React,
  useState: (initial: unknown) => {
    const slot = (slots[cursor++] ??= { value: initial })
    return [
      slot.value,
      (next: any) => {
        const value = typeof next === 'function' ? next(slot.value) : next
        if (!Object.is(value, slot.value)) dirty = true
        slot.value = value
      },
    ]
  },
  useRef: (initial: unknown) => (slots[cursor++] ??= { current: initial }),
  useEffect: (effect: () => void | (() => void), deps: unknown[]) => {
    const slot = (slots[cursor++] ??= {})
    if (
      !slot.deps ||
      deps.some((value, index) => !Object.is(value, slot.deps![index]))
    ) {
      slot.deps = deps
      effects.push(() => {
        slot.cleanup?.()
        slot.cleanup = effect() || undefined
      })
    }
  },
}))

const reward = (
  overrides: Partial<CheckoutProductReward> = {}
): CheckoutProductReward => ({
  id: 'reward-1',
  productName: 'Pizza premio',
  voucherCode: 'PREMIO-001',
  expiresAt: '2099-01-01T12:30:00.000Z',
  state: 'available',
  isAvailable: true,
  ...overrides,
})
let response: any
let read: () => Promise<any>
let verifyResponse: any
let logoutResponse: any
let requestCalls = 0
mock.module('../wallet-auth-actions', () => ({
  getWalletBalance: () => read(),
  requestWalletCode: async () => {
    requestCalls++
    return { ok: true, challengeId: 'challenge' }
  },
  verifyWalletCode: async () => verifyResponse,
  clearWalletSession: async () => logoutResponse,
}))
mock.module('@/shared/button', () => ({
  Button: ({ size, variant, ...props }: any) =>
    React.createElement('button', props),
}))
mock.module('@/shared/input', () => ({
  Input: (props: any) => React.createElement('input', props),
}))
const { CheckoutWallet } = await import('./checkout-wallet')
type Props = Parameters<typeof CheckoutWallet>[0]
type Element = ReactElement<Record<string, any>>
let props: Props
let changes: (string | null)[] = []
const unmount = () => slots.forEach(slot => slot.cleanup?.())
const setup = (selected: string | null = null) => {
  unmount()
  slots = []
  changes = []
  requestCalls = 0
  response = {
    ok: true,
    availableAmount: '20.00',
    pendingAmount: '5.00',
    productRewards: [reward()],
  }
  read = async () => response
  verifyResponse = logoutResponse = { ok: true }
  props = {
    storeSlug: 'loja',
    phone: '11999999999',
    total: '30.00',
    value: '0.00',
    onChange: value => {
      props.value = value
    },
    productRewardId: selected,
    onProductRewardChange: id => {
      changes.push(id)
      props.productRewardId = id
    },
  }
}
const tree = (): Element => {
  let result: Element
  do {
    dirty = false
    cursor = 0
    effects = []
    result = CheckoutWallet(props) as Element
    effects.forEach(effect => effect())
  } while (dirty)
  return result!
}
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
const button = (label: string) =>
  find(
    tree(),
    node =>
      node.props?.['aria-label'] === label ||
      [node.props?.children].flat().includes(label)
  )!
const checkbox = (id = 'PREMIO-001') =>
  find(
    tree(),
    node =>
      node.props?.type === 'checkbox' && node.props['aria-label'].includes(id)
  )!
const access = async () => {
  await button('Acessar carteira').props.onClick()
}
const refresh = async () => {
  await button('Atualizar saldo').props.onClick()
}

describe('checkout wallet product rewards without network or browser', () => {
  test('SSR starts private, with the existing OTP controls and benefits heading', () => {
    setup('reward-1')
    const html = renderToStaticMarkup(tree())
    expect(html.includes('Meus beneficios')).toBe(true)
    expect(html.includes('Receber codigo no WhatsApp')).toBe(true)
    expect(html.includes('PREMIO-001')).toBe(false)
    expect(changes).toEqual([])
    expect(requestCalls).toBe(0)
  })

  test('authenticated SSR identifies the original product, voucher, expiry and cashback', async () => {
    setup()
    await access()
    const html = renderToStaticMarkup(tree())
    for (const text of [
      'Cashback',
      'Pizza premio',
      'PREMIO-001',
      'Disponivel',
      '2099-01-01T12:30:00.000Z',
    ])
      expect(html.includes(text)).toBe(true)
    expect(checkbox().props.disabled).toBe(false)
    expect(requestCalls).toBe(0)
  })

  test('selecting another reward replaces the single controlled id; unchecking removes it', async () => {
    setup()
    response.productRewards.push(
      reward({ id: 'reward-2', voucherCode: 'PREMIO-002' })
    )
    await access()
    checkbox().props.onChange({ target: { checked: true } })
    expect(checkbox().props.checked).toBe(true)
    checkbox('PREMIO-002').props.onChange({ target: { checked: true } })
    expect(checkbox().props.checked).toBe(false)
    expect(checkbox('PREMIO-002').props.checked).toBe(true)
    checkbox('PREMIO-002').props.onChange({ target: { checked: false } })
    expect(changes).toEqual(['reward-1', 'reward-2', null])
    expect(props.value).toBe('0.00')
  })

  test('blocked states and unavailable products remain visible and cannot be selected', async () => {
    for (const state of [
      'pending',
      'reserved',
      'consumed',
      'expired',
      'reversed',
      'suspended',
      'available',
    ] as const) {
      setup()
      response.productRewards = [
        reward({
          state,
          isAvailable: false,
          unavailableReason: 'Produto sem estoque',
        }),
      ]
      await access()
      expect(renderToStaticMarkup(tree()).includes('Produto sem estoque')).toBe(
        true
      )
      expect(checkbox().props.disabled).toBe(true)
      checkbox().props.onChange({ target: { checked: true } })
      expect(changes).toEqual([])
    }
  })

  test('past or invalid original expiry is blocked even when the server flag is available', async () => {
    for (const expiresAt of ['2000-01-01T00:00:00.000Z', 'invalid']) {
      setup('reward-1')
      response.productRewards = [reward({ expiresAt })]
      await access()
      expect(checkbox().props.disabled).toBe(true)
      expect(props.productRewardId).toBe(null)
    }
  })

  test('refresh preserves valid selection and invalidates missing or changed rewards', async () => {
    for (const productRewards of [
      [],
      [reward({ state: 'reserved' })],
      [reward({ isAvailable: false })],
    ]) {
      setup('reward-1')
      await access()
      tree()
      expect(changes).toEqual([])
      response = { ...response, productRewards }
      await refresh()
      tree()
      expect(changes).toEqual([null])
    }
  })

  test('remount does not clear a legitimate parent selection before or after validation', async () => {
    setup('reward-1')
    await access()
    tree()
    unmount()
    slots = []
    tree()
    expect(changes).toEqual([])
    await access()
    expect(checkbox().props.checked).toBe(true)
    expect(changes).toEqual([])
  })

  test('identity change clears selection but phone formatting changes do not', async () => {
    setup('reward-1')
    await access()
    tree()
    props.phone = '(11) 99999-9999'
    tree()
    expect(changes).toEqual([])
    props.storeSlug = 'outra-loja'
    tree()
    expect(changes).toEqual([null])
    expect(renderToStaticMarkup(tree()).includes('PREMIO-001')).toBe(false)
  })

  test('failed reads and thrown auth errors clear selection and private wallet contents', async () => {
    for (const throws of [false, true]) {
      setup('reward-1')
      await access()
      tree()
      read = async () => {
        if (throws) throw new Error('private')
        return { ok: false, message: 'Autentique novamente' }
      }
      await refresh()
      expect(renderToStaticMarkup(tree()).includes('PREMIO-001')).toBe(false)
      expect(props.productRewardId).toBe(null)
    }
  })

  test('failed OTP verification clears the parent selection', async () => {
    setup('reward-1')
    await button('Receber codigo no WhatsApp').props.onClick()
    const code = find(
      tree(),
      node => node.props?.autoComplete === 'one-time-code'
    )!
    code.props.onChange({ target: { value: '123456' } })
    verifyResponse = { ok: false, message: 'Codigo invalido' }
    await button('Confirmar').props.onClick()
    expect(props.productRewardId).toBe(null)
    unmount()
  })

  test('logout clears selection and private contents even if session revocation fails', async () => {
    for (const ok of [true, false]) {
      setup('reward-1')
      await access()
      logoutResponse = { ok }
      await button('Sair da carteira').props.onClick()
      expect(props.productRewardId).toBe(null)
      expect(renderToStaticMarkup(tree()).includes('PREMIO-001')).toBe(false)
    }
  })

  test('late responses cannot restore rewards for a different identity or after unmount', async () => {
    for (const changeIdentity of [true, false]) {
      setup('reward-1')
      let resolve!: (value: any) => void
      read = () =>
        new Promise(done => {
          resolve = done
        })
      const pending = access()
      if (changeIdentity) {
        props.phone = '11888888888'
        tree()
      } else {
        unmount()
        slots = []
      }
      const before = [...changes]
      resolve(response)
      await pending
      expect(changes).toEqual(before)
      expect(renderToStaticMarkup(tree()).includes('PREMIO-001')).toBe(false)
    }
  })
})
