import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { isServer as isServerReactQuery } from '@tanstack/react-query'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export const isServer = isServerReactQuery
export const isClient = !isServer

export type Success<T> = {
  data: T
  error: null
}

export type Failure<E> = {
  data: null
  error: E
}

export type Result<T, E = Error> = Success<T> | Failure<E>

export async function tryCatch<T, E = Error>(promise: Promise<T>): Promise<Result<T, E>> {
  try {
    const data = await promise
    return { data, error: null }
  } catch (error) {
    return { data: null, error: error as E }
  }
}
