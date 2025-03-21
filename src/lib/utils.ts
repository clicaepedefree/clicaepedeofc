import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { isServer as isServerReactQuery } from '@tanstack/react-query'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export const isServer = isServerReactQuery
export const isClient = !isServer
