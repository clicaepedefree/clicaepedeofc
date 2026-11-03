import { describe, expect, test } from 'bun:test'
import type { ReactElement } from 'react'
import { unconfiguredBenefitPrograms } from '../policy'

const { mock } = require('bun:test') as {
  mock: { module(name: string, factory: () => unknown): void }
}
const React = require('react')
let states: unknown[] = []
let cursor = 0
mock.module('react', () => ({
  ...React,
  default: React,
  useState: (initial: unknown) => {
    const index = cursor++
    if (!(index in states))
      states[index] = typeof initial === 'function' ? initial() : initial
    return [
      states[index],
      (next: unknown) => {
        states[index] = typeof next === 'function' ? next(states[index]) : next
      },
    ]
  },
}))
mock.module('../hooks/use-benefit-programs-configuration', () => ({
  useBenefitProgramsConfiguration: () => ({}),
}))
const { BenefitProgramsEditor } = await import('./benefit-programs-settings')

type Props = Parameters<typeof BenefitProgramsEditor>[0]
type Element = ReactElement<Record<string, any>>
const tree = (configuration: Props['configuration']) => {
  cursor = 0
  return BenefitProgramsEditor({ configuration }) as Element
}
const find = (
  root: Element,
  predicate: (node: Element) => boolean
): Element | undefined => {
  if (!root || typeof root !== 'object') return undefined
  if (predicate(root)) return root
  for (const child of [root.props?.children].flat(Infinity)) {
    const result = find(child as Element, predicate)
    if (result) return result
  }
}
const byId = (root: Element, id: string) =>
  find(root, node => node.props?.id === id)!
const submit = (root: Element) => root.props.onSubmit({ preventDefault() {} })
const change = (root: Element, id: string, value: string) =>
  byId(root, id).props.onChange({ target: { value } })
const initial = () => {
  states = []
  const data = {
    ...unconfiguredBenefitPrograms(),
    version: 0,
    updatedAt: null,
    modules: { cashback: true, loyalty: true },
    products: [],
  }
  return {
    data,
    isError: false,
    isSaving: false,
    isCurrentStore: () => true,
    refetch: async () => ({ data: { ...data, version: 5 } }),
    save: async () => ({ success: true, version: 1 }),
  } as unknown as Props['configuration']
}

describe('benefit editor edit snapshot and explicit reload', () => {
  test('disabling loyalty with a deleted product saves cleared reward fields even when its module is revoked', async () => {
    for (const available of [true, false]) {
      const config = initial()
      config.data!.loyalty = {
        enabled: true,
        requiredOrders: 10,
        minimumOrderAmount: '0',
        rewardType: 'product',
        rewardAmount: null,
        rewardItemId: 123,
        rewardExpiresAfterDays: 30,
      }
      config.data!.modules.loyalty = available
      let calls = 0
      config.save = async input => {
        calls++
        expect(input.loyalty.enabled).toBe(false)
        expect(input.loyalty.rewardItemId).toBe(null)
        expect(input.loyalty.rewardType).toBe(null)
        expect(input.loyalty.rewardAmount).toBe(null)
        return { success: true, version: 1 }
      }
      const control = byId(tree(config), 'benefits-loyalty-enabled')
      expect(control.props.disabled).toBe(false)
      control.props.onCheckedChange(false)
      await submit(tree(config))
      expect(calls).toBe(1)
      expect(config.data!.loyalty.rewardItemId).toBe(123)
    }
  })

  test('saving locks dirty fields, switches and duplicate submit without dropping input', async () => {
    const config = initial()
    let calls = 0
    config.save = async () => {
      calls++
      return { success: true, version: 1 }
    }
    change(tree(config), 'benefits-cashback-percentage', '3')
    config.isSaving = true
    const current = tree(config)
    expect(byId(current, 'benefits-cashback-enabled').props.disabled).toBe(true)
    expect(byId(current, 'benefits-loyalty-enabled').props.disabled).toBe(true)
    const fieldsets: Element[] = []
    find(current, node => {
      if (node.type === 'fieldset') fieldsets.push(node)
      return false
    })
    expect(fieldsets.length).toBe(2)
    expect(fieldsets.every(node => node.props.disabled)).toBe(true)
    expect(byId(current, 'benefits-cashback-percentage').props.value).toBe('3')
    await submit(current)
    expect(calls).toBe(0)
  })

  test('revoked modules can be turned off and saved, but cannot be reactivated', async () => {
    for (const program of ['cashback', 'loyalty'] as const) {
      const config = initial()
      config.data![program].enabled = true
      config.data!.modules[program] = false
      let calls = 0
      config.save = async input => {
        calls++
        expect(input[program].enabled).toBe(false)
        return { success: true, version: 1 }
      }
      const id = `benefits-${program}-enabled`
      let control = byId(tree(config), id)
      expect(control.props.disabled).toBe(false)
      control.props.onCheckedChange(false)
      control = byId(tree(config), id)
      expect(control.props.disabled).toBe(true)
      control.props.onCheckedChange(true)
      expect(byId(tree(config), id).props.checked).toBe(false)
      await submit(tree(config))
      expect(calls).toBe(1)
    }
  })

  test('generic database failure allows retry with the same draft and version, even when suggesting reload', async () => {
    const config = initial()
    let calls = 0
    config.save = async input => {
      calls++
      expect(input.cashback.percentage).toBe('3')
      expect(input.expectedVersion).toBe(0)
      if (calls === 1)
        throw new Error(
          'Nao foi possivel salvar os beneficios. Recarregue e tente novamente.'
        )
      return { success: true, version: 1 }
    }
    change(tree(config), 'benefits-cashback-percentage', '3')
    await submit(tree(config))
    const current = tree(config)
    expect(byId(current, 'benefits-cashback-percentage').props.value).toBe('3')
    expect(
      find(current, node => node.props?.type === 'submit')?.props.disabled
    ).toBe(false)
    await submit(current)
    expect(calls).toBe(2)
  })

  test('refetch cannot overwrite a dirty field or silently advance expectedVersion', async () => {
    const config = initial()
    let expectedVersion = -1
    config.save = async input => {
      expectedVersion = input.expectedVersion
      return { success: true, version: 1 }
    }
    change(tree(config), 'benefits-cashback-percentage', '3')
    config.data = {
      ...config.data!,
      version: 4,
      cashback: { ...config.data!.cashback, percentage: '8' },
    }
    const edited = tree(config)
    expect(byId(edited, 'benefits-cashback-percentage').props.value).toBe('3')
    await submit(edited)
    expect(expectedVersion).toBe(0)
  })

  test('version conflict blocks another submit until explicitly reloaded', async () => {
    const config = initial()
    let calls = 0
    config.save = async () => {
      calls++
      throw new Error(
        'A configuracao foi alterada por outra pessoa. Recarregue e tente novamente.'
      )
    }
    change(tree(config), 'benefits-cashback-percentage', '3')
    await submit(tree(config))
    let current = tree(config)
    expect(
      find(
        current,
        node => node.props?.role === 'alert'
      )?.props.children.includes('Recarregue')
    ).toBe(true)
    await submit(current)
    expect(calls).toBe(1)
    const reload = find(
      current,
      node => node.props?.children?.[1] === 'Descartar e recarregar'
    )!
    await reload.props.onClick()
    current = tree(config)
    expect(byId(current, 'benefits-cashback-percentage').props.value).toBe('')
    config.save = async input => {
      calls++
      expect(input.expectedVersion).toBe(5)
      return { success: true, version: 6 }
    }
    change(current, 'benefits-cashback-percentage', '4')
    await submit(tree(config))
    expect(calls).toBe(2)
  })

  test('an active incomplete program does not reach the backend', async () => {
    const config = initial()
    let calls = 0
    config.save = async () => {
      calls++
      return { success: true, version: 1 }
    }
    byId(tree(config), 'benefits-cashback-enabled').props.onCheckedChange(true)
    await submit(tree(config))
    expect(calls).toBe(0)
    expect(
      find(
        tree(config),
        node => node.props?.role === 'alert'
      )?.props.children.includes('obrigatórios')
    ).toBe(true)
  })

  test('permission failure provides a next step without discarding edits', async () => {
    const config = initial()
    config.save = async () => {
      throw new Error(
        'Voce nao tem permissao para configurar os beneficios desta loja.'
      )
    }
    change(tree(config), 'benefits-cashback-percentage', '3')
    await submit(tree(config))
    const current = tree(config)
    expect(
      find(
        current,
        node => node.props?.role === 'alert'
      )?.props.children.includes('responsável pela loja')
    ).toBe(true)
    expect(byId(current, 'benefits-cashback-percentage').props.value).toBe('3')
  })
})
