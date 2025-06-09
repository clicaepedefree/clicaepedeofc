import { Tabs, TabsList, TabsTrigger } from '@/shared/tabs'
import { cn } from './lib/utils'
import { Body } from './typography/body'
export { TabsContent } from '@/shared/tabs'

type Tab = {
  name: string
  value: string
  content: string
  icon: React.ReactNode
}

type TabsWithIconsProps = {
  tabs: Tab[]
  className?: string
  headerClassName?: string
  triggerClassName?: string
  children: React.ReactNode
}

export const TabsWithIcons = ({ tabs, className, headerClassName, triggerClassName, children }: TabsWithIconsProps) => {
  return (
    <Tabs defaultValue={tabs[0].value} className={cn('w-full', className)}>
      <TabsList
        className={cn(
          'h-fit w-full grid grid-cols-[repeat(auto-fill,minmax(5rem,1fr))] gap-2 justify-start rounded-[inherit] rounded-b-none px-2 py-2',
          headerClassName
        )}
      >
        {tabs.map(tab => (
          <TabsTrigger
            key={tab.value}
            value={tab.value}
            className={cn(
              'flex flex-col gap-2 h-full border-b-2 border-transparent data-[state=active]:border-primary rounded-sm data-[state=active]:shadow-md data-[state=active]:text-primary [&>svg]:h-5 [&>svg]:w-5 [&>svg]:shrink-0 data-[state=inactive]:hover:shadow-sm data-[state=inactive]:hover:border data-[state=inactive]:hover:bg-white',
              triggerClassName
            )}
          >
            {tab.icon}
            <Body variant={200} fontWeight="inherit" highlight="inherit">
              {tab.name}
            </Body>
          </TabsTrigger>
        ))}
      </TabsList>
      <div className="w-full h-full px-2">{children}</div>
    </Tabs>
  )
}
