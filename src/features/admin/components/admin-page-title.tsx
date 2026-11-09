'use client'

import { BreadcrumbItem, BreadcrumbPage } from '@/shared/breadcrumb'
import { useAdminHeaderInfo } from '../hooks/use-admin-header-info'

export const AdminPageTitle = () => {
  const { title } = useAdminHeaderInfo()

  if (!title) return null

  return (
    <BreadcrumbItem className="min-w-0">
      <BreadcrumbPage className="truncate">
        <div>{title}</div>
      </BreadcrumbPage>
    </BreadcrumbItem>
  )
}
