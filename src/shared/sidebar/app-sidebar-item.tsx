'use client'

import Link from 'next/link'
import { SidebarMenuButton, SidebarMenuItem, SidebarMenuSubButton, SidebarMenuSubItem } from './base-sidebar'
import { usePathname } from 'next/navigation'
import { MenuItem } from './types'
import { DynamicIcon } from 'lucide-react/dynamic'

export const AppSidebarItem = ({ item }: { item: MenuItem }) => {
  const pathname = usePathname()

  const isActive = item.url === pathname
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
  const pathname = usePathname()

  const isActive = item.url === pathname
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
