import { describe, test } from 'bun:test'
import * as bunTest from 'bun:test'
import assert from 'node:assert/strict'
import { BenefitProgramsError, unconfiguredBenefitPrograms } from './policy'

// The repository's minimal bun:test declaration omits the runtime mock API.
const { mock } = bunTest as typeof bunTest & {
  mock: { module(name: string, factory: () => unknown): void }
}
const calls: unknown[][] = []
let forbidden = false
let failure: Error | null = null
mock.module('@/features/store/api', () => ({
  validateUserPermissionsForStore: async (...args: unknown[]) => {
    calls.push(['auth', ...args])
    if (forbidden) throw new Error('secret auth internals')
    return { user: { id: 'authenticated-actor' } }
  },
}))
mock.module('./db', () => ({
  readBenefitProgramsConfiguration: async (storeId: number) => {
    calls.push(['read', storeId])
    if (failure) throw failure
    return {
      version: 0,
      ...unconfiguredBenefitPrograms(),
      modules: { cashback: false, loyalty: false },
      products: [],
      updatedAt: null,
    }
  },
  appendBenefitProgramsConfiguration: async (...args: unknown[]) => {
    calls.push(['append', ...args])
    if (failure) throw failure
    return 1
  },
}))
const {
  getBenefitProgramsConfiguration: get,
  saveBenefitProgramsConfiguration: save,
} = await import('./api')
const input = () => ({ expectedVersion: 0, ...unconfiguredBenefitPrograms() })
function reset() {
  calls.length = 0
  forbidden = false
  failure = null
}

describe('benefit configuration server actions', () => {
  test('authorizes exact store and settings permission BEFORE any data read', async () => {
    reset()
    const result = await get(9)
    assert.deepEqual(calls, [
      ['auth', 9, 'store.settings.manage'],
      ['read', 9],
    ])
    assert.equal(result.version, 0)
    assert.equal(result.updatedAt, null)
  })
  test('denies cross-store/unauthenticated reads and writes without calling persistence', async () => {
    reset()
    forbidden = true
    await assert.rejects(get(10), /permissao/)
    assert.equal((await save(10, input())).success, false)
    assert(calls.every(call => call[0] === 'auth'))
  })
  test('uses authenticated actor; rejects malformed payload before persistence', async () => {
    reset()
    assert.deepEqual(await save(9, input()), { success: true, version: 1 })
    assert.deepEqual(calls[1], ['append', 9, 'authenticated-actor', input()])
    calls.length = 0
    assert.equal(
      (await save(9, { ...input(), expectedVersion: -1 })).success,
      false
    )
    assert.equal(calls.length, 1)
  })
  test('returns friendly validation/conflict/module errors without raw DB details', async () => {
    reset()
    failure = new BenefitProgramsError('A configuracao mudou. Recarregue.')
    assert.deepEqual(await save(9, input()), {
      success: false,
      error: failure.message,
    })
    failure = new Error('postgres password SQL secret_table')
    const result = await save(9, input())
    assert.equal(result.success, false)
    assert(!JSON.stringify(result).includes('secret_table'))
    assert(!JSON.stringify(result).toLowerCase().includes('recarregue'))
    await assert.rejects(get(9), /Nao foi possivel carregar/)
  })
  test('invalid store ids never reach auth/data queries', async () => {
    reset()
    for (const id of [0, -1, NaN, Infinity, 1.5, 2147483648]) {
      assert.equal((await save(id, input())).success, false)
      await assert.rejects(get(id))
    }
    assert.equal(calls.length, 0)
  })
})
