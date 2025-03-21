import * as React from 'react'

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarRail,
  SidebarSeparator,
} from '@/shared/sidebar/base-sidebar'
import { AppSidebarItem } from './app-sidebar-item'
import { MenuItem, MenuSection } from './types'
import { AppSidebarSection } from './app-sidebar-section'
import { UserProfile } from '@/features/user/components/userProfile'

type AppSidebarProps = React.ComponentProps<typeof Sidebar> & {
  menuItems: (MenuItem | MenuSection)[]
}

export function AppSidebar({ menuItems, ...props }: AppSidebarProps) {
  return (
    <Sidebar {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <img src="/clica-pedidos.png" className="object-cover self-center" width="50%" alt="Clica Pedidos Logo" />
          <UserProfile />
        </SidebarMenu>
      </SidebarHeader>
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
