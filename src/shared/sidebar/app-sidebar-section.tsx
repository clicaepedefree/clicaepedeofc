import { Minus, Plus } from 'lucide-react'

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/shared/collapsible'
import { SidebarMenuButton, SidebarMenuItem, SidebarMenuSub } from '@/shared/sidebar/base-sidebar'
import { MenuSection } from './types'
import { AppSidebarSubItem } from './app-sidebar-item'
import { DynamicIcon } from 'lucide-react/dynamic'

type AppSidebarSectionProps = {
  section: MenuSection
}

export const AppSidebarSection = ({ section }: AppSidebarSectionProps) => {
  const hasSubItems = !!section.items?.length

  return (
    <Collapsible defaultOpen className="group/collapsible">
      <SidebarMenuItem>
        <CollapsibleTrigger asChild>
          <SidebarMenuButton>
            {section.icon && <DynamicIcon name={section.icon} className="mr-2" />}
            {section.title} <Plus className="ml-auto group-data-[state=open]/collapsible:hidden" />
            <Minus className="ml-auto group-data-[state=closed]/collapsible:hidden" />
          </SidebarMenuButton>
        </CollapsibleTrigger>
        {hasSubItems && (
          <CollapsibleContent>
            <SidebarMenuSub>
              {section.items.map(item => (
                <AppSidebarSubItem key={item.title} item={item} />
              ))}
            </SidebarMenuSub>
          </CollapsibleContent>
        )}
      </SidebarMenuItem>
    </Collapsible>
  )
}
