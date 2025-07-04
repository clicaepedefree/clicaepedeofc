'use client'

import { Button } from '@/shared/button'
import { DeleteButton } from '@/shared/buttons/delete-button'
import { CurrencyInput } from '@/shared/currency-input'
import { formatValueToCurrency } from '@/shared/formatters/currency'
import { ImageWithPlaceholder } from '@/shared/image-with-placeholder'
import { Label } from '@/shared/label'
import { cn } from '@/shared/lib/utils'
import { DeleteResourceConfirmationModal } from '@/shared/modals/delete-resource-confirmation-modal'
import { Switch } from '@/shared/switch'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/shared/table'
import { LargeText } from '@/shared/typography/large-text'
import { SmallText } from '@/shared/typography/small-text'
import { Edit } from 'lucide-react'
import { useItem } from '../../hooks/use-item'
import { BaseCategory, ItemOfferingWithImage } from '../../types'
import { UpdateItemAction } from '../create-or-update-item/update-item-action'

export const ItemOfferingsTable = ({
  category,
  itemOfferings,
  firstRowAction,
  onItemUpdated,
}: {
  category: BaseCategory
  itemOfferings: ItemOfferingWithImage[]
  firstRowAction?: React.ReactNode
  onItemUpdated?(): void
}) => {
  const hasOfferings = itemOfferings.length > 0

  return (
    <Table className="table-auto overflow-x-scroll">
      <TableHeader>
        {firstRowAction && (
          <TableRow className="hover:bg-unset">
            <TableCell className="px-0 m-0" colSpan={50}>
              {firstRowAction}
            </TableCell>
          </TableRow>
        )}
        {hasOfferings && (
          <TableRow>
            <TableHead className="text-center">Item</TableHead>
            <TableHead className="text-center">Preço</TableHead>
            <TableHead className="text-center">Status de venda</TableHead>
            <TableHead className="text-center">Ações</TableHead>
          </TableRow>
        )}
      </TableHeader>
      <TableBody>
        {itemOfferings.map(itemOffering => (
          <ItemOfferingRow
            key={itemOffering.id}
            item={itemOffering}
            category={category}
            onItemUpdated={onItemUpdated}
          />
        ))}
      </TableBody>
    </Table>
  )
}

const ItemOfferingRow = ({
  item,
  category,
  onItemUpdated,
}: {
  item: ItemOfferingWithImage
  category: BaseCategory
  onItemUpdated?(): void
}) => {
  const { deleteItem, isDeleting, onItemUpdated: onUpdateItem } = useItem()

  return (
    <TableRow>
      <TableCell className="w-fit flex items-center  justify-baseline gap-1 sm:gap-4 flex-wrap sm:flex-nowrap ">
        <ImageWithPlaceholder image={item.image} alt={item.name} />
        <LargeText variant="sm" className="text-wrap line-clamp-2 pr-2 md:pr-8">
          {item.name}
        </LargeText>
      </TableCell>
      <TableCell className="max-w-24 w-fit place-items-center space-y-2">
        {item.originalPrice && (
          <SmallText className="line-through text-xs">
            {formatValueToCurrency({
              value: item.originalPrice,
              includeCurrencySymbol: true,
            })}
          </SmallText>
        )}
        <CurrencyInput
          className="w-fit"
          inputClassName="min-w-[58px] sm:min-w-[80px] sm:max-w-[100px] text-xs sm:text-normal disabled:opacity-100"
          value={item.price}
          disabled
        />
      </TableCell>
      <TableCell className="place-items-center">
        <Label size="sm" className="gap-1 items-center">
          <LargeText variant="sm" className="font-medium">
            {item.isAvailable ? 'Ativo' : 'Inativo'}
          </LargeText>
          <Switch
            size="lg"
            checked={item.isAvailable}
            className="disabled:opacity-90"
            disabled
          />
        </Label>
      </TableCell>
      <TableCell>
        <div className="flex items-center justify-center gap-2">
          <UpdateItemAction
            category={category}
            item={item}
            trigger={
              <Button
                variant="ghost"
                size="icon"
                className="group/edit"
                disabled={isDeleting}
              >
                <Edit
                  size={16}
                  className={cn('group-hover/edit:text-primary')}
                />
              </Button>
            }
            onSuccess={item => {
              onUpdateItem(item)
              onItemUpdated?.()
            }}
          />
          <DeleteResourceConfirmationModal
            trigger={<DeleteButton isDeleting={isDeleting} />}
            resource="item"
            resourceName={item.name}
            isDeleting={isDeleting}
            onConfirm={async () =>
              deleteItem(item, { onSuccess: onItemUpdated })
            }
          />
        </div>
      </TableCell>
    </TableRow>
  )
}
