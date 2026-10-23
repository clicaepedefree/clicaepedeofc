const minimumPatched: Record<number, readonly [number, number]> = {
  22: [23, 4],
  24: [22, 1],
  26: [12, 1],
}

export function nodeRuntimePatchStatus(version: string) {
  const match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(version)
  if (!match) return 'unknown' as const
  const [, major, minor, patch] = match.map(Number)
  const minimum = minimumPatched[major]
  if (!minimum) return 'unknown' as const
  return minor > minimum[0] || (minor === minimum[0] && patch >= minimum[1])
    ? ('patched' as const)
    : ('update-required' as const)
}
