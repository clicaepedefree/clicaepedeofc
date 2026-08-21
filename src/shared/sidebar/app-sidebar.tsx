'use client'

import * as React from 'react'

import { useAvailableStores } from '@/features/store/hooks/use-available-stores'
import {
  roleHasStorePermission,
  type StoreUserRole,
} from '@/features/store-users/store-users-policy'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarSeparator,
} from '@/shared/sidebar/base-sidebar'
import { AppSidebarHeader } from '@/shared/sidebar/app-sidebar-header'
import { AppSidebarItem } from '@/shared/sidebar/app-sidebar-item'
import { AppSidebarSection } from '@/shared/sidebar/app-sidebar-section'
import { MenuItem, MenuSection } from '@/shared/sidebar/types'
import { ShieldCheck } from 'lucide-react'
import Link from 'next/link'

type AppSidebarProps = React.ComponentProps<typeof Sidebar> & {
  menuItems: (MenuItem | MenuSection)[]
  internalOperationHref?: string
}

export function AppSidebar({
  menuItems,
  internalOperationHref,
  ...props
}: AppSidebarProps) {
  const { selectedStoreId, stores } = useAvailableStores()
  const selectedStore = stores?.find(store => store.id === selectedStoreId)
  const selectedRole = selectedStore?.userRole as StoreUserRole | undefined
  const filteredMenuItems = selectedRole
    ? filterMenuItemsByRole(menuItems, selectedRole)
    : menuItems

  return (
    <Sidebar {...props}>
      <AppSidebarHeader />
      <SidebarSeparator className="mt-2" />
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Páginas</SidebarGroupLabel>
          <SidebarMenu>
            {filteredMenuItems.map(item => (
              <React.Fragment key={item.title}>
                {item.type === 'section' && <AppSidebarSection section={item} />}
                {item.type != 'section' && <AppSidebarItem item={item} />}
              </React.Fragment>
            ))}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
      {internalOperationHref && (
        <>
          <SidebarSeparator />
          <SidebarFooter>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  tooltip="Admin Clica e Pede"
                  className="h-10 border border-sky-400/35 bg-sky-500/12 text-sky-700 shadow-xs hover:bg-sky-500/18 hover:text-sky-800 dark:border-sky-400/30 dark:bg-sky-400/10 dark:text-sky-200 dark:hover:bg-sky-400/15 dark:hover:text-sky-100"
                >
                  <Link href={internalOperationHref}>
                    <ShieldCheck className="size-4" />
                    <span>Admin</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarFooter>
        </>
      )}
      <SidebarRail />
    </Sidebar>
  )
}

function filterMenuItemsByRole(
  menuItems: (MenuItem | MenuSection)[],
  role: StoreUserRole
) {
  return menuItems
    .map(item => {
      if (item.type === 'section') {
        const visibleItems = item.items.filter(
          child =>
            !child.requiredPermission ||
            roleHasStorePermission(role, child.requiredPermission)
        )

        if (visibleItems.length === 0) return null

        return { ...item, items: visibleItems }
      }

      if (
        item.requiredPermission &&
        !roleHasStorePermission(role, item.requiredPermission)
      ) {
        return null
      }

      return item
    })
    .filter(Boolean) as (MenuItem | MenuSection)[]
}
