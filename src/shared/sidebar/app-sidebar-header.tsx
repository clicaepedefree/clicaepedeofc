'use client'

import { StoreSelector } from '@/features/store/components/store-selector'
import { UserProfile } from '@/features/user/components/userProfile'
import { SidebarHeader, SidebarMenu, useSidebar } from '@/shared/sidebar/base-sidebar'
import Image from 'next/image'

export const AppSidebarHeader = () => {
  const { open, openMobile, isMobile } = useSidebar()
  const isOpen = open || openMobile
  return (
    <SidebarHeader>
      <SidebarMenu>
        {isOpen && (
          <div className="w-full h-11 relative">
            <Image
              src="/clica-pedidos.png"
              className="object-contain self-center"
              alt="Clica Pedidos Logo"
              sizes="(max-width: 768px) 271px, 239px"
              fill
              priority={true}
            />
          </div>
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
