import { InsertOptionGroup, SelectOptionGroup } from '@/services/db/schema/option-groups'
import { InsertOption, SelectOption } from '@/services/db/schema/options'
import { SelectItem } from '@/services/db/schema/items'

export type NewOption = Omit<InsertOption, 'id' | 'optionGroupId'>

export type Option = SelectOption & {
  item: Pick<SelectItem, 'id' | 'name'>
}

export type NewOptionGroup = Omit<InsertOptionGroup, 'id'> & {
  options: NewOption[]
}

export type OptionGroupWithOptions = SelectOptionGroup & {
  options: Option[]
}

export type UpdateOptionGroup = Omit<InsertOptionGroup, 'storeId'> & {
  id: number
  storeId: number
  options: (NewOption & { id?: number })[]
}

export type LinkOptionGroupsToItemOffering = {
  itemOfferingId: number
  storeId: number
  optionGroupIds: number[]
}
