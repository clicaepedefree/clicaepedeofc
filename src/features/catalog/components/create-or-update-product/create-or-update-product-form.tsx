'use client'

import {
  createProductSchema,
  productCategorySchema,
  updateProductSchema,
} from '@/features/catalog/form-validation/product-schema'
import { BaseCategory, Product, ProductWithImage } from '@/features/catalog/types'
import { selectedStoreIdAtom } from '@/features/store/state'
import { Button } from '@/shared/button'
import { CurrencyInput } from '@/shared/currency-input'
import { SingleFileUploader } from '@/shared/file-upload'
import { Input } from '@/shared/input'
import { Label } from '@/shared/label'
import { cn } from '@/shared/lib/utils'
import { Textarea } from '@/shared/textarea'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/tooltip'
import { useForm, useStore } from '@tanstack/react-form'
import { useAtom } from 'jotai'
import { BadgeX, Tag } from 'lucide-react'
import { useState } from 'react'
import { z } from 'zod'
import { createProduct } from '../../api'

type CreateOrUpdateProductFormProps = {
  product?: ProductWithImage
  category?: BaseCategory
  className?: string
  onSuccess?(product: Product): void
  FooterContainerComponent?: ComponentWithChildren
}

const getDefaultValues = (product?: ProductWithImage, category?: BaseCategory) => {
  const defaultCategory = category ?? { id: 0, name: '' }
  const defaultProductCategory: z.input<typeof productCategorySchema> = {
    category: defaultCategory,
    price: '',
    originalPrice: null,
  }
  const defaultValues: z.input<typeof createProductSchema> = {
    name: '',
    description: '',
    isAvailable: true,
    image: null,
    categories: [defaultProductCategory],
  }

  if (!product) return defaultValues
}

export const CreateOrUpdateProductForm = ({
  className,
  product,
  category,
  onSuccess,
  FooterContainerComponent,
}: CreateOrUpdateProductFormProps) => {
  const isCreatingProduct = !product

  const productFormSchema = isCreatingProduct ? createProductSchema : updateProductSchema
  const [selectedStoreId] = useAtom(selectedStoreIdAtom)

  const [applyDiscount, setApplyDiscount] = useState(false)
  const form = useForm({
    defaultValues: getDefaultValues(product, category),
    validators: {
      onSubmit: productFormSchema,
    },
    onSubmit: async ({ value }) => {
      if (!selectedStoreId) {
        console.error('Selecione uma loja antes de criar / atualizar um produto.')
        return
      }

      // if (!isCreatingProduct) {
      //   const updatedProduct = await updateProduct({
      //     id: product.id,
      //     index: product.index,
      //     storeId: product.storeId,
      //     name: value.name,
      //     description: value.description,
      //     isAvailable: value.isAvailable,
      //     imageId: value.image?.id,
      //   })
      //   form.reset()
      //   onSuccess?.(updatedCategory)
      //   return
      // }
      const newProduct = await createProduct({
        storeId: selectedStoreId,
        name: value.name,
        description: value.description,
        categories: value.categories.map(productCategory => ({
          categoryId: productCategory.category?.id ?? 0,
          price: productCategory.price ? parseInt(productCategory.price) : 0,
          originalPrice: productCategory.originalPrice ? parseInt(productCategory.originalPrice) : 0,
        })),
        imageId: value.image?.id ?? null,
      })
      form.reset()
      onSuccess?.(newProduct)
    },
  })

  const image = useStore(form.store, state => state.values.image)

  const submitButtonText = isCreatingProduct ? 'Criar Produto' : 'Atualizar Produto'
  const submitButtonLoadingText = isCreatingProduct ? 'Criando...' : 'Atualizando...'
  const footerActions = (
    <form.Subscribe selector={state => [state.canSubmit, state.isSubmitting]}>
      {([canSubmit, isSubmitting]) => (
        <div className={cn('grid grid-cols-2 gap-2 justify-around', { 'mt-8': !FooterContainerComponent })}>
          <Button variant="secondary" type="reset" onClick={() => form.reset()}>
            {isCreatingProduct ? 'Limpar' : 'Desfazer alterações'}
          </Button>
          <Button type="submit" disabled={!canSubmit} onClick={form.handleSubmit}>
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
        onSubmit={e => {
          e.preventDefault()
          e.stopPropagation()
          form.handleSubmit()
        }}
        className={cn('grid grid-cols-1 md:grid-cols-2 gap-4 rounded w-full self-start pb-1', className)}
      >
        <form.Field name="image">
          {field => (
            <SingleFileUploader
              storeId={selectedStoreId}
              fileUrl={image?.url}
              fileTag="product"
              onFileUploaded={file => field.setValue({ id: file.serverData.id, url: file.serverData.url })}
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
          <form.Field name="categories" mode="array">
            {field =>
              field.state.value.map((_, index) => (
                <div
                  key={index}
                  className={cn('grid gap-4 grid-cols-[0fr_1fr] transition-all duration-500', {
                    'grid-cols-[1fr_1fr]': applyDiscount,
                  })}
                >
                  {applyDiscount && (
                    <form.Field
                      name={`categories[${index}].originalPrice`}
                      validators={{
                        onChangeListenTo: [`categories[${index}].price`],
                        onChange: ({ value, fieldApi }) => {
                          const price = fieldApi.form.getFieldValue(`categories[${index}].price`)
                          if (!value || !price) return

                          if (parseInt(value) <= parseInt(price)) {
                            return { message: 'Preço antigo deve ser maior que o atual' }
                          }
                          return undefined
                        },
                      }}
                    >
                      {subField => (
                        <CurrencyInput
                          label="Preço antigo"
                          value={subField.state.value ?? undefined}
                          onValueChange={value => subField.handleChange(value ?? null)}
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
                                  <BadgeX size={18} strokeWidth={2} className="text-destructive" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Remover desconto</TooltipContent>
                            </Tooltip>
                          }
                        />
                      )}
                    </form.Field>
                  )}
                  <form.Field name={`categories[${index}].price`}>
                    {subField => (
                      <CurrencyInput
                        label="Preço"
                        value={subField.state.value ?? ''}
                        onValueChange={value => subField.handleChange(value ?? '')}
                        className={cn('col-span-2', { 'col-span-1': applyDiscount })}
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
                                      `categories[${index}].originalPrice`,
                                      subField.state.value ?? null,
                                      {
                                        dontUpdateMeta: true,
                                      }
                                    )
                                    setApplyDiscount(true)
                                  }}
                                >
                                  <Tag size={18} strokeWidth={2} className="text-destructive" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Adicionar desconto</TooltipContent>
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
          {!FooterContainerComponent && footerActions}
        </div>
      </form>
      {FooterContainerComponent && <FooterContainerComponent>{footerActions}</FooterContainerComponent>}
    </>
  )
}
