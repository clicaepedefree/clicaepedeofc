'use client'

import { atom, useAtom } from 'jotai'
import { usePathname } from 'next/navigation'
import { ReactNode } from 'react'

export type AdminPageHeaderInfo = {
  title: ReactNode
}

export const adminPageHeaderInfoAtom = atom<AdminPageHeaderInfo | undefined>()

export const useAdminHeaderInfo = () => {
  const [headerInfo, setHeaderInfo] = useAtom(adminPageHeaderInfoAtom)
  const currentPagePathName = usePathname()

  const isCurrentPage = (pathNameToTest: string) => currentPagePathName === pathNameToTest

  return { ...headerInfo, isCurrentPage, setHeaderInfo }
}
