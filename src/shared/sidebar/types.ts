import { IconName } from 'lucide-react/dynamic'
import type { StorePermission } from '@/features/store-users/store-users-policy'

export type MenuItem = {
  type?: 'item'
  title: string
  url: string
  icon?: IconName
  requiredPermission?: StorePermission
}

export type MenuSection = {
  type: 'section'
  title: string
  items: MenuItem[]
  url?: string
  icon?: IconName
  requiredPermission?: StorePermission
}
