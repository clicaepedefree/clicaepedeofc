'use client'

import { useEffect } from 'react'
import { AdminPageHeaderInfo, useAdminHeaderInfo } from '../hooks/use-admin-header-info'

export const AdminPageInfo = ({ pageInfo }: { pageInfo: AdminPageHeaderInfo; children?: React.ReactNode }) => {
  const { setHeaderInfo } = useAdminHeaderInfo()

  useEffect(() => {
    setHeaderInfo(pageInfo)
  }, [pageInfo, setHeaderInfo])

  return null
}
