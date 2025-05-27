import { Button } from '@/shared/button'

export const IconButton = ({
  onClick,
  children,
  ...props
}: {
  onClick?: () => void
  children: React.ReactNode
} & React.ComponentProps<'button'>) => {
  return (
    <Button variant="icon" size="icon" onClick={onClick} isClickable {...props}>
      {children}
    </Button>
  )
}
