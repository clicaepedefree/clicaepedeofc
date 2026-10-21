import { atomWithStorage } from 'jotai/utils'

export const selectedStoreIdAtom = atomWithStorage<number | null>(
  'selectedStoreId',
  null,
  // Read persisted selection on mount so SSR and the first client render agree.
  undefined
)
