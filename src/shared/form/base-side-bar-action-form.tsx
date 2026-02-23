'use client'

import { cn } from '@/shared/lib/utils'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/shared/sheet'
import { useState } from 'react'

export type SidebarActionFormChildrenProps = {
  FooterContainer: typeof SheetFooter
  closeSidebar(): void
}

export type BaseSideBarActionFormProps = {
  title: string
  description?: string
  children: (props: SidebarActionFormChildrenProps) => React.ReactNode
  trigger: React.ReactNode
  contentClassName?: string
}

export const BaseSideBarActionForm = ({ children, title, description, trigger, contentClassName }: BaseSideBarActionFormProps) => {
  const [open, setOpen] = useState(false)

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>{trigger}</SheetTrigger>
      <SheetContent
        className={cn('w-11/12 sm:max-w-5xl max-h-dvh h-fit rounded-l-2xl', contentClassName)}
        onPointerDownOutside={() => {}}
        onInteractOutside={event => event.preventDefault()}
        onFocusOutside={() => {}}
        disableCloseOnOverlayClick
      >
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          {description && <SheetDescription>{description}</SheetDescription>}
        </SheetHeader>
        {children({ FooterContainer: SheetFooter, closeSidebar: () => setOpen(false) })}
      </SheetContent>
    </Sheet>
  )
}
