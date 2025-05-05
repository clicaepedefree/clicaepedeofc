import * as React from 'react'

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarRail,
  SidebarSeparator,
} from '@/shared/sidebar/base-sidebar'
import { AppSidebarHeader } from '@/shared/sidebar/app-sidebar-header'
import { AppSidebarItem } from '@/shared/sidebar/app-sidebar-item'
import { AppSidebarSection } from '@/shared/sidebar/app-sidebar-section'
import { MenuItem, MenuSection } from '@/shared/sidebar/types'

type AppSidebarProps = React.ComponentProps<typeof Sidebar> & {
  menuItems: (MenuItem | MenuSection)[]
}

export function AppSidebar({ menuItems, ...props }: AppSidebarProps) {
  return (
    <Sidebar {...props}>
      <AppSidebarHeader />
      <SidebarSeparator className="mt-2" />
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Páginas</SidebarGroupLabel>
          <SidebarMenu>
            {menuItems.map(item => (
              <React.Fragment key={item.title}>
                {item.type === 'section' && <AppSidebarSection section={item} />}
                {item.type != 'section' && <AppSidebarItem item={item} />}
              </React.Fragment>
            ))}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  )
}
