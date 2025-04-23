type Nullable<T> = T | null
type NullableKeys<T> = {
  [P in keyof T]: T[P] | null
}
type WithNullableFields<T, Fields> = {
  [K in keyof T]: K extends Fields ? T[K] | null | undefined : T[K]
}

type PartialBy<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>
