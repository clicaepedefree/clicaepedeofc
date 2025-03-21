'use client'

import { UserProfile } from '@/features/user/components/userProfile'
import { SidebarHeader, SidebarMenu, useSidebar } from './base-sidebar'
import { StoreSelector } from '@/features/store/components/store-selector'

export const AppSidebarHeader = () => {
  const { open, openMobile, isMobile } = useSidebar()
  const isOpen = open || openMobile
  return (
    <SidebarHeader>
      <SidebarMenu>
        {isOpen && (
          <img src="/clica-pedidos.png" className="object-cover self-center" width="50%" alt="Clica Pedidos Logo" />
        )}
        {isOpen && <UserProfile showName />}
        {!isOpen && <UserProfile className={{ alignSelf: 'center', marginTop: '0.7rem' }} />}
        {isMobile && (
          <div className="w-full mt-2">
            <StoreSelector />
          </div>
        )}
      </SidebarMenu>
    </SidebarHeader>
  )
}
