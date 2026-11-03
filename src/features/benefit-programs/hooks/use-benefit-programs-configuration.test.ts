import { describe, expect, test } from 'bun:test'
import type { BenefitProgramsInput } from '../policy'

const { mock } = require('bun:test') as {
  mock: { module(name: string, factory: () => unknown): void }
}
let selected = 1
let cleanup: () => void = () => {}
let read: () => Promise<unknown> = async () => ({ version: 0 })
let write: (id: number) => Promise<unknown> = async () => ({
  success: true,
  version: 1,
})
let queryOptions!: {
  queryKey: unknown
  queryFn(context: { signal: AbortSignal }): Promise<unknown>
}
let notifications = 0
let cacheWrites = 0
let cancellations = 0

mock.module('react', () => ({
  useRef: (value: unknown) => ({ current: value }),
  useEffect: (effect: () => () => void) => {
    cleanup = effect()
  },
}))
mock.module('jotai', () => ({ useStore: () => ({ get: () => selected }) }))
mock.module('@/features/store/state', () => ({ selectedStoreIdAtom: {} }))
mock.module('@/shared/lib/toast', () => ({
  dispatchToast: () => {
    notifications++
  },
}))
mock.module('../api', () => ({
  getBenefitProgramsConfiguration: () => read(),
  saveBenefitProgramsConfiguration: (id: number) => write(id),
}))
mock.module('@tanstack/react-query', () => ({
  useQuery: (options: typeof queryOptions) => {
    queryOptions = options
    return {}
  },
  useMutation: (options: { mutationFn: unknown }) => ({
    mutateAsync: options.mutationFn,
  }),
  useQueryClient: () => ({
    cancelQueries: async () => {
      cancellations++
    },
    setQueryData: () => {
      cacheWrites++
    },
  }),
}))

const { benefitProgramsKey, useBenefitProgramsConfiguration } = await import(
  './use-benefit-programs-configuration'
)
const input = {} as BenefitProgramsInput
const pending = <T>() => {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => {
    resolve = done
  })
  return { promise, resolve }
}

describe('benefit programs store isolation', () => {
  test('keys are scoped by store and aborted reads cannot publish a result', async () => {
    selected = 1
    useBenefitProgramsConfiguration(1)
    expect(queryOptions.queryKey).toEqual(benefitProgramsKey(1))
    expect(
      JSON.stringify(benefitProgramsKey(2)) ===
        JSON.stringify(benefitProgramsKey(1))
    ).toBe(false)
    const controller = new AbortController()
    controller.abort()
    let rejected = false
    try {
      await queryOptions.queryFn({ signal: controller.signal })
    } catch {
      rejected = true
    }
    expect(rejected).toBe(true)
    const before = cancellations
    cleanup()
    expect(cancellations).toBe(before + 1)
  })

  test('changing stores before dispatch prevents a save to the previous store', async () => {
    selected = 1
    const hook = useBenefitProgramsConfiguration(1)
    let calls = 0
    write = async () => {
      calls++
      return { success: true, version: 1 }
    }
    selected = 2
    expect(await hook.save(input)).toBe(null)
    expect(calls).toBe(0)
  })

  test('an in-flight old-store save does not touch cache or toast after switching away and back', async () => {
    selected = 1
    const hook = useBenefitProgramsConfiguration(1)
    const request = pending<unknown>()
    write = () => request.promise
    const beforeNotifications = notifications
    const beforeCache = cacheWrites
    const result = hook.save(input)
    selected = 2
    cleanup()
    selected = 1
    request.resolve({ success: true, version: 2 })
    expect(await result).toBe(null)
    expect(notifications).toBe(beforeNotifications)
    expect(cacheWrites).toBe(beforeCache)
  })

  test('duplicate submits do not issue a second write', async () => {
    selected = 1
    const hook = useBenefitProgramsConfiguration(1)
    const request = pending<unknown>()
    let calls = 0
    write = () => {
      calls++
      return request.promise
    }
    const first = hook.save(input)
    expect(await hook.save(input)).toBe(null)
    request.resolve({ success: true, version: 3 })
    await first
    expect(calls).toBe(1)
  })

  test('structured save failures reject without updating cached version', async () => {
    selected = 1
    const hook = useBenefitProgramsConfiguration(1)
    write = async () => ({
      success: false,
      error: 'Conflito de versao. Recarregue.',
    })
    const before = cacheWrites
    let message = ''
    try {
      await hook.save(input)
    } catch (error) {
      message = (error as Error).message
    }
    expect(message).toBe('Conflito de versao. Recarregue.')
    expect(cacheWrites).toBe(before)
  })
})
