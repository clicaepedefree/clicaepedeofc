'use client'
import { usePathname } from 'next/navigation'

const pathNameToPageInfoMapping: Record<string, { title: string }> = {
  '/dashboard': { title: 'Dashboard' },
  '/settings': { title: 'Configurações' },
}

export const useCurrentAdminPage = () => {
  const currentPagePathName = usePathname()

  const isCurrentPage = (pathNameToTest: string) => currentPagePathName === pathNameToTest
  const currentPageInfo = pathNameToPageInfoMapping[currentPagePathName]
  return {
    isCurrentPage,
    currentPageInfo,
  }
}
