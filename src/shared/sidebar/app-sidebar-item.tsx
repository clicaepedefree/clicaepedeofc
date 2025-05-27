'use client'

import { useAdminHeaderInfo } from '@/features/admin/hooks/use-admin-header-info'
import {
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from '@/shared/sidebar/base-sidebar'
import { MenuItem } from '@/shared/sidebar/types'
import { DynamicIcon } from 'lucide-react/dynamic'
import Link from 'next/link'

export const AppSidebarItem = ({ item }: { item: MenuItem }) => {
  const { isCurrentPage } = useAdminHeaderInfo()

  const isActive = isCurrentPage(item.url)
  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild isActive={isActive}>
        <Link href={item.url}>
          {item.icon && <DynamicIcon name={item.icon} />}
          {item.title}
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  )
}

export const AppSidebarSubItem = ({ item }: { item: MenuItem }) => {
  const { isCurrentPage } = useAdminHeaderInfo()

  const isActive = isCurrentPage(item.url)
  return (
    <SidebarMenuSubItem key={item.title}>
      <SidebarMenuSubButton asChild isActive={isActive}>
        <Link href={item.url}>
          {item.icon && <DynamicIcon name={item.icon} />}
          {item.title}
        </Link>
      </SidebarMenuSubButton>
    </SidebarMenuSubItem>
  )
}
