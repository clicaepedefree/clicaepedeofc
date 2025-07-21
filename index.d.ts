type Nullable<T> = T | null
type NullableKeys<T> = {
  [P in keyof T]: T[P] | null
}
type WithNullableFields<T, Fields> = {
  [K in keyof T]: K extends Fields ? T[K] | null | undefined : T[K]
}

type PartialBy<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>
type NonNullableBy<T, K extends keyof T> = Omit<T, K> & NonNullable<Pick<T, K>>
type RequiredBy<T, K extends keyof T> = Omit<T, K> & Required<Pick<T, K>>

type ComponentWithChildren = React.FC<{ children: React.ReactNode }>

type DeepPartial<T> = T extends any[]
  ? T
  : T extends Record<string, any>
    ? {
        [P in keyof T]?: DeepPartial<T[P]>
      }
    : T
