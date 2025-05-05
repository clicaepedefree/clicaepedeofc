'use client'

import { useCurrentAdminPage } from '@/app/(admin)/use-current-admin-page'

export const AdminPageTitle = () => {
  const { currentPageInfo } = useCurrentAdminPage()
  return <div>{currentPageInfo?.title}</div>
}
