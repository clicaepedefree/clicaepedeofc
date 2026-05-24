import { cn } from '../lib/utils'
import { Headline } from '../typography/headline'

export const SettingsCategoryBlock = ({
  title,
  children,
  contentClassName,
}: {
  title: string
  children?: React.ReactNode
  contentClassName?: string
}) => {
  return (
    <div className="bg-card text-card-foreground border-1 rounded-xl p-4">
      <div className="border-b py-2 px-4 mb-4">
        <Headline variant={500} fontWeight="medium" className="text-primary">
          {title}
        </Headline>
      </div>
      <div className={cn('grid grid-cols-4 gap-4', contentClassName)}>
        {children}
      </div>
    </div>
  )
}
