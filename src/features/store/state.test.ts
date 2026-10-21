import { expect, test } from 'bun:test'
import { createStore } from 'jotai'

test('persisted store is deferred until subscription, keeping SSR and initial client state equal', async () => {
  const originalWindow = globalThis.window
  const storage = new Map([['selectedStoreId', '9']])
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      localStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
        removeItem: (key: string) => storage.delete(key),
      },
      addEventListener() {},
      removeEventListener() {},
    },
  })
  try {
    const { selectedStoreIdAtom } = await import('./state')
    const store = createStore()
    expect(store.get(selectedStoreIdAtom)).toBe(null)
    const unsubscribe = store.sub(selectedStoreIdAtom, () => {})
    expect(store.get(selectedStoreIdAtom)).toBe(9)
    store.set(selectedStoreIdAtom, 10)
    expect(storage.get('selectedStoreId')).toBe('10')
    unsubscribe()
  } finally {
    if (originalWindow === undefined)
      Reflect.deleteProperty(globalThis, 'window')
    else
      Object.defineProperty(globalThis, 'window', {
        configurable: true,
        value: originalWindow,
      })
  }
})
