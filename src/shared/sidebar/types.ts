import { IconName } from 'lucide-react/dynamic'

export type MenuItem = {
  type?: 'item'
  title: string
  url: string
  icon?: IconName
}

export type MenuSection = {
  type: 'section'
  title: string
  items: MenuItem[]
  url?: string
  icon?: IconName
}
