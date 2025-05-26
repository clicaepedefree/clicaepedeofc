'use client'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'

export const useUrl = () => {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const urlString = `${pathname}?${searchParams.toString()}`

  const updateUrlParams = (params: Record<string, string | undefined>) => {
    const updatedSearchParams = new URLSearchParams(searchParams)
    Object.entries(params).forEach(([key, value]) => {
      if (!value) {
        updatedSearchParams.delete(key)
        return
      }
      updatedSearchParams.set(key, value)
    })

    router.replace(`${pathname}?${updatedSearchParams.toString()}`)
  }

  const getUrlParam = (param: string) => searchParams.get(param) ?? undefined

  return { urlString, updateUrlParams, getUrlParam }
}
