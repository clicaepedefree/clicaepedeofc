import { atomWithStorage } from 'jotai/utils'

export const selectedStoreIdAtom = atomWithStorage<number | null>(
  'selectedStoreId',
  null,
  undefined,
  { getOnInit: true }
)
