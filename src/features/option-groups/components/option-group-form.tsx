'use client'

import {
  createOptionGroupSchema,
  updateOptionGroupSchema,
} from '@/features/option-groups/form-validation/option-group-schema'
import { OptionGroupWithOptions } from '@/features/option-groups/types'
import { useMenu } from '@/features/menu/hooks/use-menu'
import { selectedStoreIdAtom } from '@/features/store/state'
import { Button } from '@/shared/button'
import { Input } from '@/shared/input'
import { Label } from '@/shared/label'
import { cn } from '@/shared/lib/utils'
import { useForm } from '@tanstack/react-form'
import { useAtom } from 'jotai'
import { Plus } from 'lucide-react'
import { ItemForOptionRow, OptionRow, OptionRowValue } from './option-row'
import { SelectionRuleSelector } from './selection-rule-selector'

type OptionGroupFormProps = {
  optionGroup?: OptionGroupWithOptions
  onSubmit: (data: OptionGroupFormValues) => Promise<void>
  isSubmitting?: boolean
  FooterContainerComponent?: ComponentWithChildren
  className?: string
}

export type OptionGroupFormValues = {
  id?: number
  name: string
  minQuantity: number
  maxQuantity: number
  options: OptionRowValue[]
}

const getDefaultValues = (
  optionGroup?: OptionGroupWithOptions
): OptionGroupFormValues => {
  if (optionGroup) {
    return {
      id: optionGroup.id,
      name: optionGroup.name,
      minQuantity: optionGroup.minQuantity,
      maxQuantity: optionGroup.maxQuantity,
      options: optionGroup.options.map((opt) => ({
        id: opt.id,
        itemId: opt.itemId,
        itemName: opt.item.name,
        price: opt.price,
        originalPrice: opt.originalPrice,
        minQuantity: opt.minQuantity,
        maxQuantity: opt.maxQuantity,
        index: opt.index,
      })),
    }
  }

  return {
    name: '',
    minQuantity: 0,
    maxQuantity: 1,
    options: [],
  }
}

export const OptionGroupForm = ({
  optionGroup,
  onSubmit,
  isSubmitting = false,
  FooterContainerComponent,
  className,
}: OptionGroupFormProps) => {
  const isEditing = !!optionGroup
  const [selectedStoreId] = useAtom(selectedStoreIdAtom)
  const { menuItems } = useMenu({ menuName: 'option-group-form' })

  const itemsForCombobox: ItemForOptionRow[] =
    menuItems?.map((item) => ({
      id: item.itemId,
      name: item.name,
      categoryName: item.category.name,
      categoryId: item.category.id,
      price: item.price,
    })) ?? []

  const schema = isEditing ? updateOptionGroupSchema : createOptionGroupSchema

  const form = useForm({
    defaultValues: getDefaultValues(optionGroup),
    onSubmit: async ({ value }) => {
      const result = schema.safeParse(value)
      if (!result.success) return
      await onSubmit(value)
      if (!isEditing) form.reset()
    },
    validators: {
      onSubmit: ({ value }) => {
        const result = schema.safeParse(value)
        if (!result.success) {
          const fieldErrors: Record<string, string> = {}
          for (const issue of result.error.issues) {
            const path = issue.path.join('.')
            fieldErrors[path] = issue.message
          }
          return fieldErrors
        }
        return undefined
      },
    },
  })

  const submitButtonText = isEditing ? 'Salvar' : 'Criar grupo'
  const submitButtonLoadingText = isEditing ? 'Salvando...' : 'Criando...'

  const footerActions = (
    <form.Subscribe selector={(state) => [state.canSubmit, state.isSubmitting]}>
      {([canSubmit]) => (
        <div
          className={cn('grid grid-cols-2 gap-2 justify-around', {
            'mt-8': !FooterContainerComponent,
          })}
        >
          <Button
            variant="secondary"
            type="reset"
            onClick={(event) => {
              event.preventDefault()
              form.reset()
            }}
          >
            {isEditing ? 'Desfazer alterações' : 'Limpar'}
          </Button>
          <Button
            type="submit"
            disabled={!canSubmit || isSubmitting}
            onClick={form.handleSubmit}
          >
            {isSubmitting ? submitButtonLoadingText : submitButtonText}
          </Button>
        </div>
      )}
    </form.Subscribe>
  )

  if (!selectedStoreId) return null

  return (
    <>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          e.stopPropagation()
          form.handleSubmit()
        }}
        className={cn('space-y-4 rounded w-full self-start pb-1', className)}
      >
        <form.Field name="name">
          {(field) => (
            <Label>
              Nome do grupo
              <Input
                type="text"
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(e) => field.handleChange(e.target.value)}
                placeholder="Ex: Escolha o queijo"
                required
                error={field.state.meta.errors.join(', ') || undefined}
                autoFocus
              />
            </Label>
          )}
        </form.Field>

        <form.Subscribe selector={(state) => [state.values.minQuantity, state.values.maxQuantity]}>
          {([minQuantity, maxQuantity]) => (
            <SelectionRuleSelector
              minQuantity={minQuantity}
              maxQuantity={maxQuantity}
              onChange={(min, max) => {
                form.setFieldValue('minQuantity', min)
                form.setFieldValue('maxQuantity', max)
              }}
            />
          )}
        </form.Subscribe>

        <form.Field name="options" mode="array">
          {(field) => (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">Complementos</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    field.pushValue({
                      itemId: 0,
                      price: '0',
                      originalPrice: null,
                      minQuantity: 0,
                      maxQuantity: 1,
                      index: field.state.value.length,
                    })
                  }}
                >
                  <Plus size={16} /> Complemento
                </Button>
              </div>
              {field.state.meta.errors.length > 0 && (
                <span className="text-red-500 text-xs">
                  {field.state.meta.errors.join(', ')}
                </span>
              )}
              {field.state.value.map((option, index) => (
                <OptionRow
                  key={index}
                  value={option}
                  displayIndex={index + 1}
                  onChange={(updated) => {
                    field.replaceValue(index, updated)
                  }}
                  onRemove={() => {
                    field.removeValue(index)
                    field.state.value.forEach((_, i) => {
                      if (i >= index) {
                        const current = field.state.value[i]
                        if (current) {
                          field.replaceValue(i, { ...current, index: i })
                        }
                      }
                    })
                  }}
                  onMoveUp={
                    index > 0
                      ? () => {
                          const current = field.state.value[index]
                          const above = field.state.value[index - 1]
                          field.replaceValue(index - 1, {
                            ...current,
                            index: index - 1,
                          })
                          field.replaceValue(index, {
                            ...above,
                            index,
                          })
                        }
                      : undefined
                  }
                  onMoveDown={
                    index < field.state.value.length - 1
                      ? () => {
                          const current = field.state.value[index]
                          const below = field.state.value[index + 1]
                          field.replaceValue(index, {
                            ...below,
                            index,
                          })
                          field.replaceValue(index + 1, {
                            ...current,
                            index: index + 1,
                          })
                        }
                      : undefined
                  }
                  items={itemsForCombobox}
                />
              ))}
            </div>
          )}
        </form.Field>

        {!FooterContainerComponent && footerActions}
      </form>
      {FooterContainerComponent && (
        <FooterContainerComponent>{footerActions}</FooterContainerComponent>
      )}
    </>
  )
}
