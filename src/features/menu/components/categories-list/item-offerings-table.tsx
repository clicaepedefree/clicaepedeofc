'use client'

import { useRef } from 'react'
import { LinkOptionGroupsModal } from '@/features/option-groups/components/link-option-groups-modal'
import { Button } from '@/shared/button'
import { DeleteButton } from '@/shared/buttons/delete-button'
import { CurrencyInput } from '@/shared/currency-input'
import { formatValueToCurrency } from '@/shared/formatters/currency'
import { ImageWithPlaceholder } from '@/shared/image-with-placeholder'
import { Input } from '@/shared/input'
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
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/tooltip'
import { Badge } from '@/shared/badge'
import { Body } from '@/shared/typography/body'
import { LargeText } from '@/shared/typography/large-text'
import { SmallText } from '@/shared/typography/small-text'
import { Edit, ListChecks } from 'lucide-react'
import { useTextTruncated } from '@/shared/hooks/use-text-truncated'
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
    <Table className="table-fixed">
      <colgroup>
        <col style={{ width: '350px', maxWidth: '350px' }} />
        <col style={{ width: '100px' }} />
        <col style={{ width: '120px' }} />
        <col style={{ width: '140px' }} />
        <col style={{ width: '100px' }} />
      </colgroup>
      <TableHeader>
        {firstRowAction && (
          <TableRow className="hover:bg-unset">
            <TableCell className="px-0 m-0" colSpan={5}>
              {firstRowAction}
            </TableCell>
          </TableRow>
        )}
        {hasOfferings && (
          <TableRow>
            <TableHead className="text-center">Item</TableHead>
            <TableHead className="text-center">Estoque</TableHead>
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
  const textRef = useRef<HTMLSpanElement>(null)
  const isItemNameTruncated = useTextTruncated(textRef, [item.name])

  const itemNameElement = (
    <span
      ref={textRef}
      className="text-sm font-semibold cursor-default block flex-1 min-w-0 overflow-hidden"
      style={{
        display: '-webkit-box',
        WebkitLineClamp: 3,
        WebkitBoxOrient: 'vertical',
      }}
    >
      {item.name}
    </span>
  )

  return (
    <TableRow>
      <TableCell className="!whitespace-normal overflow-hidden align-middle">
        <div className="flex items-center gap-2 sm:gap-4">
          <div className="shrink-0">
            <ImageWithPlaceholder image={item.image} alt={item.name} />
          </div>
          {isItemNameTruncated ? (
            <Tooltip>
              <TooltipTrigger asChild>{itemNameElement}</TooltipTrigger>
              <TooltipContent side="top" className="max-w-[300px]">
                {item.name}
              </TooltipContent>
            </Tooltip>
          ) : (
            itemNameElement
          )}
        </div>
      </TableCell>
      <TableCell className="max-w-24 w-fit place-items-center space-y-2 text-center">
        {item.inventory !== null && (
          <Input
            value={item.inventory ?? undefined}
            placeholder="Estoque"
            containerClassName="w-fit"
            className="text-xs sm:text-normal disabled:opacity-100 max-w-16 w-fit text-center"
            disabled
          />
        )}
        {item.inventory === null && (
          <Body className=" text-wrap text-center">Estoque desativado</Body>
        )}
      </TableCell>
      <TableCell className="max-w-24 w-fit">
        <div className="flex flex-col items-center gap-1">
          {item.originalPrice && (
            <SmallText className="line-through text-xs text-center">
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
        </div>
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
          <LinkOptionGroupsModal
            trigger={
              <Button
                variant="ghost"
                size="icon"
                className="group/options relative"
                disabled={isDeleting}
              >
                <ListChecks
                  size={16}
                  className="group-hover/options:text-primary"
                />
                {!!item.optionGroups?.length && (
                  <Badge
                    variant="default"
                    className="absolute -top-1 -right-1 h-4 w-4 p-0 flex items-center justify-center text-[10px]"
                  >
                    {item.optionGroups.length}
                  </Badge>
                )}
              </Button>
            }
            itemOfferingId={item.itemOfferingId}
            itemName={item.name}
            currentOptionGroups={item.optionGroups}
            onSuccess={onItemUpdated}
          />
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
