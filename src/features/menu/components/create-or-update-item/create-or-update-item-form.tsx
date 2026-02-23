'use client'

import { createItem, updateItem } from '@/features/menu/api'
import {
  createItemSchema,
  itemOfferingSchema,
  itemOfferingSchemaWithIndex,
  updateItemSchema,
} from '@/features/menu/form-validation/item-schema'
import {
  BaseCategory,
  Item,
  ItemOfferingWithImage,
} from '@/features/menu/types'
import { LinkOptionGroupsContent } from '@/features/option-groups/components/link-option-groups-content'
import { OptionGroupFormValues } from '@/features/option-groups/components/option-group-form'
import { useOptionGroups } from '@/features/option-groups/hooks/use-option-groups'
import { selectedStoreIdAtom } from '@/features/store/state'
import { Button } from '@/shared/button'
import { CurrencyInput } from '@/shared/currency-input'
import { SingleFileUploader } from '@/shared/file-upload'
import {
  formatValueToCurrency,
  getValueFromCurrencyString,
} from '@/shared/formatters/currency'
import { Input } from '@/shared/input'
import { Label } from '@/shared/label'
import { cn } from '@/shared/lib/utils'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/tabs'
import { Textarea } from '@/shared/textarea'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/tooltip'
import { useForm, useStore } from '@tanstack/react-form'
import { useAtom } from 'jotai'
import { BadgeX, Package, Tag } from 'lucide-react'
import { useState } from 'react'
import { z } from 'zod'

type CreateOrUpdateItemFormProps = {
  item?: ItemOfferingWithImage
  category?: BaseCategory
  className?: string
  onSuccess?(item: Item): void
  FooterContainerComponent?: ComponentWithChildren
}

const getDefaultValues = (
  item?: ItemOfferingWithImage,
  category?: BaseCategory
) => {
  const defaultCategory = category ?? { id: 0, name: '' }

  if (item) {
    const itemOffering: z.input<typeof itemOfferingSchemaWithIndex> = {
      category: defaultCategory,
      price: item.price,
      originalPrice: item.originalPrice,
      index: item.index,
    }

    return {
      id: item.id,
      name: item.name,
      description: item.description,
      isAvailable: item.isAvailable,
      image: item.image,
      offerings: [itemOffering],
      inventory: item.inventory,
    } as z.input<typeof updateItemSchema>
  }

  const defaultItemOffering: z.input<typeof itemOfferingSchema> = {
    category: defaultCategory,
    price: '',
    originalPrice: null,
    index: null,
  }

  const defaultValues: z.input<typeof createItemSchema> = {
    name: '',
    description: '',
    isAvailable: true,
    image: null,
    offerings: [defaultItemOffering],
    inventory: null,
  }

  return defaultValues
}

export const CreateOrUpdateItemForm = ({
  className,
  item,
  category,
  onSuccess,
  FooterContainerComponent,
}: CreateOrUpdateItemFormProps) => {
  const isCreatingItem = !item
  const showOptionGroupsTab = isCreatingItem || !!item?.itemOfferingId

  const itemFormSchema = isCreatingItem ? createItemSchema : updateItemSchema
  const [selectedStoreId] = useAtom(selectedStoreIdAtom)

  const [activeTab, setActiveTab] = useState('item')
  const [applyDiscount, setApplyDiscount] = useState(!!item?.originalPrice)
  const [isStockEnabled, setIsStockEnabled] = useState(
    Number.isFinite(item?.inventory)
  )

  const {
    optionGroups: allGroups,
    linkOptionGroups,
    isLinking,
    createOptionGroup,
    isCreating: isCreatingOptionGroup,
  } = useOptionGroups()
  const [selectedGroupIds, setSelectedGroupIds] = useState<number[]>(
    item?.optionGroups?.map((g) => g.id) ?? []
  )

  const addOptionGroup = (groupId: number) => {
    setSelectedGroupIds((prev) => [...prev, groupId])
  }

  const removeOptionGroup = (groupId: number) => {
    setSelectedGroupIds((prev) => prev.filter((id) => id !== groupId))
  }

  const reorderOptionGroups = (updatedIds: number[]) => {
    setSelectedGroupIds(updatedIds)
  }

  const handleCreateOptionGroup = async (values: OptionGroupFormValues) => {
    if (!selectedStoreId) return
    const newGroup = await createOptionGroup({
      storeId: selectedStoreId,
      name: values.name,
      minQuantity: values.minQuantity,
      maxQuantity: values.maxQuantity,
      options: values.options.map((opt) => ({
        itemId: opt.itemId,
        price: formatValueToCurrency({ value: opt.price }),
        originalPrice: opt.originalPrice
          ? formatValueToCurrency({ value: opt.originalPrice })
          : null,
        minQuantity: opt.minQuantity,
        maxQuantity: opt.maxQuantity,
        index: opt.index,
      })),
    })
    setSelectedGroupIds((prev) => [...prev, newGroup.id])
  }

  const form = useForm({
    defaultValues: getDefaultValues(item, category),
    validators: {
      onSubmit: itemFormSchema,
    },
    onSubmit: async ({ value }) => {
      if (!selectedStoreId) {
        console.error('Selecione uma loja antes de criar / atualizar um item.')
        return
      }

      if (!isCreatingItem) {
        const updatedItem = await updateItem({
          storeId: selectedStoreId,
          id: item.id,
          name: value.name,
          description: value.description,
          offerings: value.offerings.map(itemOffering => ({
            categoryId: itemOffering.category.id,
            price: formatValueToCurrency({ value: itemOffering.price }),
            originalPrice: itemOffering.originalPrice
              ? formatValueToCurrency({ value: itemOffering.originalPrice })
              : null,
            index: itemOffering.index ?? undefined,
          })),
          imageId: value.image?.id ?? null,
          inventory: value.inventory,
        })
        if (showOptionGroupsTab && item.itemOfferingId) {
          await linkOptionGroups({
            itemOfferingId: item.itemOfferingId,
            storeId: selectedStoreId,
            optionGroupIds: selectedGroupIds,
          })
        }
        form.reset()
        onSuccess?.(updatedItem)
        return
      }

      const newItem = await createItem({
        storeId: selectedStoreId,
        name: value.name,
        description: value.description,
        offerings: value.offerings.map(itemOffering => ({
          categoryId: itemOffering.category.id,
          price: formatValueToCurrency({ value: itemOffering.price }),
          originalPrice: itemOffering.originalPrice
            ? formatValueToCurrency({ value: itemOffering.originalPrice })
            : null,
        })),
        imageId: value.image?.id ?? null,
        inventory: value.inventory,
        optionGroupIds: selectedGroupIds.length > 0 ? selectedGroupIds : undefined,
      })
      form.reset()
      setSelectedGroupIds([])
      onSuccess?.(newItem)
    },
  })

  const image = useStore(form.store, state => state.values.image)

  const submitButtonText = isCreatingItem ? 'Criar Item' : 'Atualizar Item'
  const submitButtonLoadingText = isCreatingItem
    ? 'Criando...'
    : 'Atualizando...'

  const footerActions = (
    <form.Subscribe selector={state => [state.canSubmit, state.isSubmitting]}>
      {([canSubmit, isSubmitting]) => (
        <div
          className={cn('grid grid-cols-2 gap-2 justify-around', {
            'mt-8': !FooterContainerComponent,
          })}
        >
          <Button
            variant="secondary"
            type="reset"
            onClick={event => {
              event.preventDefault()
              form.reset()
            }}
          >
            {isCreatingItem ? 'Limpar' : 'Desfazer alterações'}
          </Button>
          <Button
            type="submit"
            disabled={!canSubmit || isLinking}
            onClick={form.handleSubmit}
          >
            {isSubmitting ? submitButtonLoadingText : submitButtonText}
          </Button>
        </div>
      )}
    </form.Subscribe>
  )

  if (!selectedStoreId) return null

  const formContent = (
    <form
      onSubmit={e => {
        e.preventDefault()
        e.stopPropagation()
        form.handleSubmit()
      }}
      className={cn(
        'grid grid-cols-1 md:grid-cols-2 gap-4 rounded w-full self-start pb-1',
        !showOptionGroupsTab && className
      )}
    >
      <form.Field name="image">
        {field => (
          <SingleFileUploader
            storeId={selectedStoreId}
            fileUrl={image?.url}
            fileTag="item"
            onFileUploaded={file =>
              field.setValue({
                id: file.serverData.id,
                url: file.serverData.url,
              })
            }
            onFileDeleted={() => field.setValue(null)}
            onUploadBegin={() => {
              field.setErrorMap({ onChange: [] })
            }}
            onUploadError={error => {
              field.setErrorMap({
                onChange: [error],
              })
            }}
            className={cn('row-span-full')}
            error={field.state.meta.errors[0]?.message}
          />
        )}
      </form.Field>
      <div className="space-y-4">
        <form.Field name="name">
          {field => (
            <Label>
              Nome
              <Input
                type="text"
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={e => field.handleChange(e.target.value)}
                required
                error={field.state.meta.errors[0]?.message}
                autoFocus
              />
            </Label>
          )}
        </form.Field>
        <form.Field name="description">
          {field => (
            <Label>
              Descrição
              <Textarea
                rows={2}
                value={field.state.value ?? ''}
                onBlur={field.handleBlur}
                onChange={e => field.handleChange(e.target.value)}
                error={field.state.meta.errors[0]?.message}
              />
            </Label>
          )}
        </form.Field>
        <form.Field name="inventory">
          {field => (
            <Label>
              Estoque
              <div className="w-full flex items-center gap-1">
                {isStockEnabled && (
                  <Input
                    type="number"
                    min="0"
                    placeholder="Quantidade em estoque"
                    value={field.state.value ?? ''}
                    onBlur={field.handleBlur}
                    onChange={e =>
                      e.target.value === ''
                        ? field.handleChange(null)
                        : field.handleChange(Number(e.target.value))
                    }
                    required
                    error={field.state.meta.errors[0]?.message}
                  />
                )}
                <Button
                  variant={isStockEnabled ? 'destructive' : 'secondary'}
                  size="icon"
                  onClick={() => {
                    const updatedStockValue = isStockEnabled ? null : 0
                    field.handleChange(updatedStockValue)
                    setIsStockEnabled(!isStockEnabled)
                  }}
                  className="py-[6px] transition-all duration-700"
                >
                  <Package />
                  {isStockEnabled ? 'Desativar estoque' : 'Ativar estoque'}
                </Button>
              </div>
            </Label>
          )}
        </form.Field>
        <form.Field name="offerings" mode="array">
          {field =>
            field.state.value.map((_, index) => (
              <div
                key={index}
                className={cn(
                  'grid gap-4 grid-cols-[0fr_1fr] transition-all duration-500',
                  {
                    'grid-cols-[1fr_1fr]': applyDiscount,
                  }
                )}
              >
                {applyDiscount && (
                  <form.Field
                    name={`offerings[${index}].originalPrice`}
                    validators={{
                      onChangeListenTo: [`offerings[${index}].price`],
                      onChange: ({ value, fieldApi }) => {
                        const price = fieldApi.form.getFieldValue(
                          `offerings[${index}].price`
                        )
                        if (!value || !price) return

                        if (
                          getValueFromCurrencyString(value) <=
                          getValueFromCurrencyString(price)
                        ) {
                          return {
                            message:
                              'Preço antigo deve ser maior que o atual',
                          }
                        }
                        return undefined
                      },
                    }}
                  >
                    {subField => (
                      <CurrencyInput
                        label="Preço antigo"
                        value={subField.state.value ?? undefined}
                        onValueChange={value =>
                          subField.handleChange(value ?? '')
                        }
                        error={subField.state.meta.errors[0]?.message}
                        autoFocus
                        prefixElement={
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="icon"
                                size="icon"
                                className="group mr-2 hover:scale-105 hover:bg-white"
                                onClick={() => {
                                  subField.setValue(null)
                                  setApplyDiscount(false)
                                }}
                              >
                                <BadgeX
                                  size={18}
                                  strokeWidth={2}
                                  className="text-destructive"
                                />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Remover desconto</TooltipContent>
                          </Tooltip>
                        }
                      />
                    )}
                  </form.Field>
                )}
                <form.Field name={`offerings[${index}].price`}>
                  {subField => (
                    <CurrencyInput
                      label="Preço"
                      value={subField.state.value ?? ''}
                      onValueChange={value =>
                        subField.handleChange(value ?? '')
                      }
                      className={cn('col-span-2', {
                        'col-span-1': applyDiscount,
                      })}
                      error={subField.state.meta.errors[0]?.message}
                      prefixElement={
                        !applyDiscount && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="icon"
                                size="icon"
                                className="group mr-2 hover:scale-105 hover:bg-white"
                                onClick={event => {
                                  event.preventDefault()
                                  form.setFieldValue(
                                    `offerings[${index}].originalPrice`,
                                    subField.state.value ?? null,
                                    {
                                      dontUpdateMeta: true,
                                    }
                                  )
                                  setApplyDiscount(true)
                                }}
                              >
                                <Tag
                                  size={18}
                                  strokeWidth={2}
                                  className="text-destructive"
                                />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                              Adicionar desconto
                            </TooltipContent>
                          </Tooltip>
                        )
                      }
                    />
                  )}
                </form.Field>
              </div>
            ))
          }
        </form.Field>
        {!FooterContainerComponent && !showOptionGroupsTab && footerActions}
      </div>
    </form>
  )

  if (!showOptionGroupsTab) {
    return (
      <>
        {formContent}
        {FooterContainerComponent && (
          <FooterContainerComponent>{footerActions}</FooterContainerComponent>
        )}
      </>
    )
  }

  return (
    <>
      <Tabs
        value={activeTab}
        onValueChange={setActiveTab}
        className={cn('overflow-y-auto', className)}
      >
        <TabsList className="mx-4">
          <TabsTrigger value="item">Item</TabsTrigger>
          <TabsTrigger value="option-groups">Grupos de Complementos</TabsTrigger>
        </TabsList>
        <TabsContent value="item">{formContent}</TabsContent>
        <TabsContent value="option-groups" className="px-4">
          <LinkOptionGroupsContent
            allGroups={allGroups}
            selectedIds={selectedGroupIds}
            onAddGroup={addOptionGroup}
            onRemoveGroup={removeOptionGroup}
            onReorder={reorderOptionGroups}
            onCreateGroup={handleCreateOptionGroup}
            isCreating={isCreatingOptionGroup}
          />
        </TabsContent>
      </Tabs>
      {FooterContainerComponent ? (
        <FooterContainerComponent>{footerActions}</FooterContainerComponent>
      ) : (
        <div className="px-4 mt-4">{footerActions}</div>
      )}
    </>
  )
}
