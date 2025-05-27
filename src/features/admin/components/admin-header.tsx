import '@/app/globals.css'
import { AdminPageTitle } from '@/features/admin/components/admin-page-title'
import { StoreSelector } from '@/features/store/components/store-selector'
import { UserProfile } from '@/features/user/components/userProfile'
import { Breadcrumb, BreadcrumbItem, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from '@/shared/breadcrumb'
import { Button } from '@/shared/button'
import { Separator } from '@/shared/separator'
import { SidebarTrigger } from '@/shared/sidebar/base-sidebar'
import { SignInButton, SignUpButton, SignedOut } from '@clerk/nextjs'

export const AdminHeader = () => {
  return (
    <header className="flex h-16 shrink-0 items-center justify-between gap-2 border-b px-4">
      <div className="flex items-center gap-2">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="mr-2 h-4" />
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem className="hidden md:block">
              <StoreSelector />
            </BreadcrumbItem>
            <BreadcrumbSeparator className="hidden md:block" />
            <AdminPageTitle />
          </BreadcrumbList>
        </Breadcrumb>
      </div>
      <div>
        <SignedOut>
          <SignInButton>
            <Button variant="outline">Entrar</Button>
          </SignInButton>
          <SignUpButton>
            <Button>Criar conta</Button>
          </SignUpButton>
        </SignedOut>
        <UserProfile />
      </div>
    </header>
  )
}
