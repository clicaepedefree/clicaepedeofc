'use client'

import { useCurrentAdminPage } from './use-current-admin-page'

export const AdminPageTitle = () => {
  const { currentPageInfo } = useCurrentAdminPage()
  return <div>{currentPageInfo?.title}</div>
}
