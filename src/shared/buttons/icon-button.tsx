import { Button } from '../button'

export const IconButton = ({ onClick, children }: { onClick?: () => void; children: React.ReactNode }) => {
  return (
    <Button variant="icon" size="icon" onClick={onClick}>
      {children}
    </Button>
  )
}
