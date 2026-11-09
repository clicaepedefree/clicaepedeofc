// Match the repository's offline hook testing pattern; no DOM dependency or live services.
const { mock } = require('bun:test') as {
  mock: { module(name: string, factory: () => unknown): void }
}
const React = require('react')
type Slot = {
  value?: any
  current?: any
  deps?: unknown[]
  cleanup?: () => void
}
let slots: Slot[] = []
let cursor = 0
let dirty = false
let effects: (() => void)[] = []
const changed = (slot: Slot, deps: unknown[]) =>
  !slot.deps ||
  deps.some((value, index) => !Object.is(value, slot.deps![index]))

mock.module('react', () => ({
  ...React,
  default: React,
  useState: (initial: any) => {
    const slot = (slots[cursor++] ??= {
      value: typeof initial === 'function' ? initial() : initial,
    })
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
  useMemo: (factory: () => unknown, deps: unknown[]) => {
    const slot = (slots[cursor++] ??= {})
    if (changed(slot, deps)) {
      slot.value = factory()
      slot.deps = deps
    }
    return slot.value
  },
  useCallback: (callback: unknown, deps: unknown[]) => {
    const slot = (slots[cursor++] ??= {})
    if (changed(slot, deps)) {
      slot.value = callback
      slot.deps = deps
    }
    return slot.value
  },
  useEffect: (effect: () => void | (() => void), deps: unknown[]) => {
    const slot = (slots[cursor++] ??= {})
    if (changed(slot, deps)) {
      slot.deps = deps
      effects.push(() => {
        slot.cleanup?.()
        slot.cleanup = effect() || undefined
      })
    }
  },
}))

export { mock }
export const unmount = () => slots.forEach(slot => slot.cleanup?.())
export const resetHarness = () => {
  unmount()
  slots = []
}
export function renderHooks<T>(render: () => T): T {
  let result: T
  let attempts = 0
  do {
    if (++attempts > 20) throw new Error('Unstable test render')
    dirty = false
    cursor = 0
    effects = []
    result = render()
    effects.forEach(effect => effect())
  } while (dirty)
  return result!
}
