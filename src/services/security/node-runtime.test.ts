import { describe, expect, it } from 'bun:test'
import { nodeRuntimePatchStatus } from './node-runtime'

describe('October 2026 Node runtime patches', () => {
  it.each(['v22.23.4', '24.22.1', 'v26.12.1', 'v24.23.0', 'v22.23.5'])(
    'recognizes patched supported runtime %s',
    version => expect(nodeRuntimePatchStatus(version)).toBe('patched')
  )
  it.each(['v22.23.3', 'v24.11.1', 'v24.15.0', 'v24.22.0', 'v26.12.0'])(
    'reports an older runtime %s',
    version => expect(nodeRuntimePatchStatus(version)).toBe('update-required')
  )
  it.each(['v20.20.0', 'v27.0.0', '24.x', 'v24.22.1-rc.1', ''])('does not certify %s',
    version => expect(nodeRuntimePatchStatus(version)).toBe('unknown')
  )
})
