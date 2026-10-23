export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  const { nodeRuntimePatchStatus } = await import('./services/security/node-runtime')
  // Private startup evidence, not a public diagnostic endpoint or availability gate.
  console.info(JSON.stringify({
    event: 'node_runtime_security',
    version: process.version,
    october2026Patch: nodeRuntimePatchStatus(process.version),
  }))
}
