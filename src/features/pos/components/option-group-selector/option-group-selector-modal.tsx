'use client'

import { MenuItem } from '@/features/menu/types'
import { OptionGroupWithOptions } from '@/features/option-groups/types'
import { CartItemOption } from '@/features/pos/types'
import { Button } from '@/shared/button'
import { formatValueToCurrency } from '@/shared/formatters/currency'
import { dispatchToast } from '@/shared/lib/toast'
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/shared/sheet'
import { Textarea } from '@/shared/textarea'
import { Body } from '@/shared/typography/body'
import { LargeText } from '@/shared/typography/large-text'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { OptionGroupStep } from './option-group-step'

type GroupSelections = Record<number, Record<number, number>>

type OptionGroupSelectorModalProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  item: MenuItem | null
  initialSelections?: CartItemOption[]
  initialComment?: string
  onConfirm: (
    item: MenuItem,
    selectedOptions: CartItemOption[],
    comment: string
  ) => void
}

const buildInitialSelections = (
  groups: OptionGroupWithOptions[],
  existingOptions?: CartItemOption[]
): GroupSelections => {
  const selections: GroupSelections = {}

  for (const group of groups) {
    selections[group.id] = {}
    for (const option of group.options) {
      const existingOption = existingOptions?.find(
        cartOption =>
          cartOption.optionGroupName === group.name &&
          cartOption.optionName === option.item.name
      )
      selections[group.id][option.id] = existingOption?.quantity ?? 0
    }
  }

  return selections
}

const validateSelections = (
  groups: OptionGroupWithOptions[],
  selections: GroupSelections
): boolean => {
  for (const group of groups) {
    const groupSelections = selections[group.id] ?? {}
    const totalSelected = Object.values(groupSelections).reduce(
      (accumulatedTotal, optionQuantity) => accumulatedTotal + optionQuantity,
      0
    )
    if (
      totalSelected < group.minQuantity ||
      totalSelected > group.maxQuantity
    ) {
      return false
    }
  }
  return true
}

const selectionsToCartOptions = (
  groups: OptionGroupWithOptions[],
  selections: GroupSelections
): CartItemOption[] => {
  const cartOptions: CartItemOption[] = []

  for (const group of groups) {
    const groupSelections = selections[group.id] ?? {}
    for (const option of group.options) {
      const selectedQuantity = groupSelections[option.id] ?? 0
      if (selectedQuantity > 0) {
        cartOptions.push({
          optionGroupName: group.name,
          optionName: option.item.name,
          price: Number(option.price),
          quantity: selectedQuantity,
        })
      }
    }
  }

  return cartOptions
}

const isGroupComplete = (
  group: OptionGroupWithOptions,
  selections: GroupSelections
): boolean => {
  const groupSelections = selections[group.id] ?? {}
  const totalSelected = Object.values(groupSelections).reduce(
    (accumulatedTotal, optionQuantity) => accumulatedTotal + optionQuantity,
    0
  )
  return (
    totalSelected >= group.minQuantity && totalSelected <= group.maxQuantity
  )
}

export const OptionGroupSelectorModal = ({
  open,
  onOpenChange,
  item,
  initialSelections,
  initialComment,
  onConfirm,
}: OptionGroupSelectorModalProps) => {
  const [selections, setSelections] = useState<GroupSelections>({})
  const [comment, setComment] = useState('')
  const [shake, setShake] = useState(false)
  const [highlightedGroupId, setHighlightedGroupId] = useState<number | null>(
    null
  )
  const groupRefs = useRef<Map<number, HTMLDivElement>>(new Map())

  const groups = useMemo(() => item?.optionGroups ?? [], [item])

  useEffect(() => {
    if (open && item) {
      setSelections(buildInitialSelections(groups, initialSelections))
      setComment(initialComment ?? '')
    }
  }, [open, item, groups, initialSelections, initialComment])

  const handleSelectionChange = useCallback(
    (groupId: number, optionId: number, quantity: number) => {
      setHighlightedGroupId(null)
      setSelections(previousSelections => ({
        ...previousSelections,
        [groupId]: {
          ...previousSelections[groupId],
          [optionId]: quantity,
        },
      }))
    },
    []
  )

  const handleClearOtherSelections = useCallback(
    (groupId: number, exceptOptionId: number) => {
      setSelections(previousSelections => {
        const groupSelections = previousSelections[groupId] ?? {}
        const clearedSelections: Record<number, number> = {}
        for (const optionIdKey of Object.keys(groupSelections)) {
          const optionId = Number(optionIdKey)
          clearedSelections[optionId] =
            optionId === exceptOptionId ? groupSelections[optionId] : 0
        }
        return {
          ...previousSelections,
          [groupId]: clearedSelections,
        }
      })
    },
    []
  )

  const isValid = groups.length === 0 || validateSelections(groups, selections)

  const optionsTotal = groups.reduce((accumulatedTotal, group) => {
    const groupSelections = selections[group.id] ?? {}
    const groupTotal = group.options.reduce((groupAccumulator, option) => {
      const optionQuantity = groupSelections[option.id] ?? 0
      return groupAccumulator + Number(option.price) * optionQuantity
    }, 0)
    return accumulatedTotal + groupTotal
  }, 0)

  const itemPrice = Number(item?.price ?? 0)
  const totalWithOptions = itemPrice + optionsTotal

  const handleConfirm = () => {
    if (!item) return

    if (!isValid) {
      setShake(true)
      setTimeout(() => setShake(false), 500)

      // Find and scroll to the first incomplete mandatory group
      const firstIncompleteGroup = groups.find(
        group => group.minQuantity > 0 && !isGroupComplete(group, selections)
      )
      if (firstIncompleteGroup) {
        setHighlightedGroupId(firstIncompleteGroup.id)
        const groupElement = groupRefs.current.get(firstIncompleteGroup.id)
        if (groupElement) {
          groupElement.scrollIntoView({ behavior: 'smooth', block: 'center' })
        }
      }

      dispatchToast({
        message: 'Inclua todos os complementos obrigatórios',
        type: 'error',
      })
      return
    }

    const cartOptions = selectionsToCartOptions(groups, selections)
    onConfirm(item, cartOptions, comment.trim())
    onOpenChange(false)
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-11/12 sm:max-w-lg max-h-dvh h-full rounded-l-2xl border-l-0"
        onInteractOutside={event => event.preventDefault()}
        disableCloseOnOverlayClick
      >
        {item && (
          <>
            <SheetHeader>
              <SheetTitle>{item.name}</SheetTitle>
              <Body variant={300} className="text-muted-foreground">
                {formatValueToCurrency({
                  value: item.price,
                  includeCurrencySymbol: true,
                })}
              </Body>
            </SheetHeader>
            <div className="flex-1 overflow-y-auto overflow-x-hidden">
              {groups.length > 0 && (
                <div>
                  {groups.map(group => (
                    <div
                      key={group.id}
                      ref={element => {
                        if (element) groupRefs.current.set(group.id, element)
                        else groupRefs.current.delete(group.id)
                      }}
                    >
                      <OptionGroupStep
                        group={group}
                        selections={selections[group.id] ?? {}}
                        onSelectionChange={(optionId, quantity) =>
                          handleSelectionChange(group.id, optionId, quantity)
                        }
                        onClearOtherSelections={exceptOptionId =>
                          handleClearOtherSelections(group.id, exceptOptionId)
                        }
                        shake={shake}
                        highlight={highlightedGroupId === group.id}
                      />
                    </div>
                  ))}
                </div>
              )}
              <div className="px-4 py-4 space-y-2">
                <Body variant={300} className="font-medium">
                  Observações
                </Body>
                <Textarea
                  value={comment}
                  onChange={event => setComment(event.target.value)}
                  placeholder="Ex: sem cebola, bem passado..."
                  rows={3}
                />
              </div>
            </div>
            <SheetFooter>
              <div className="flex items-center justify-between w-full mb-2">
                <Body className="text-muted-foreground">Total:</Body>
                <LargeText variant="sm" className="font-semibold">
                  {formatValueToCurrency({
                    value: totalWithOptions,
                    includeCurrencySymbol: true,
                  })}
                </LargeText>
              </div>
              <div className="grid grid-cols-2 gap-2 w-full">
                <Button variant="secondary" onClick={() => onOpenChange(false)}>
                  Cancelar
                </Button>
                <Button onClick={handleConfirm}>Confirmar</Button>
              </div>
            </SheetFooter>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}
