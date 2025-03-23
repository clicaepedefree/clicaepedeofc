'use client'

import Link from 'next/link'
import { SidebarMenuButton, SidebarMenuItem, SidebarMenuSubButton, SidebarMenuSubItem } from './base-sidebar'
import { MenuItem } from './types'
import { DynamicIcon } from 'lucide-react/dynamic'
import { useCurrentAdminPage } from '@/app/(admin)/use-current-admin-page'

export const AppSidebarItem = ({ item }: { item: MenuItem }) => {
  const { isCurrentPage } = useCurrentAdminPage()

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
  const { isCurrentPage } = useCurrentAdminPage()

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
