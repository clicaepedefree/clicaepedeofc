'use client'

import { createCategory, updateCategory } from '@/features/menu/api'
import { createCategorySchema, updateCategorySchema } from '@/features/menu/form-validation/category-schema'
import { Category, CategoryWithImage } from '@/features/menu/types'
import { selectedStoreIdAtom } from '@/features/store/state'
import { Button } from '@/shared/button'
import { SingleFileUploader } from '@/shared/file-upload'
import { Input } from '@/shared/input'
import { Label } from '@/shared/label'
import { cn } from '@/shared/lib/utils'
import { Textarea } from '@/shared/textarea'
import { useForm, useStore } from '@tanstack/react-form'
import { useAtom } from 'jotai'
import { z } from 'zod'

type CreateOrUpdateCategoryFormProps = {
  category?: CategoryWithImage
  className?: string
  onSuccess?(category: Category): void
  FooterContainerComponent?: ComponentWithChildren
}

const defaultValues: z.input<typeof createCategorySchema> = {
  name: '',
  description: null,
  isAvailable: true,
  image: null,
}

export const CreateOrUpdateCategoryForm = ({
  className,
  category,
  onSuccess,
  FooterContainerComponent,
}: CreateOrUpdateCategoryFormProps) => {
  const isCreatingCategory = !category

  const categoryFormSchema = isCreatingCategory ? createCategorySchema : updateCategorySchema
  const [selectedStoreId] = useAtom(selectedStoreIdAtom)
  const form = useForm({
    defaultValues: category ?? defaultValues,
    validators: {
      onChange: categoryFormSchema,
    },
    onSubmit: async ({ value }) => {
      if (!selectedStoreId) {
        console.error('Selecione uma loja antes de criar / atualizar uma categoria.')
        return
      }
      if (!isCreatingCategory) {
        const updatedCategory = await updateCategory({
          id: category.id,
          index: category.index,
          storeId: category.storeId,
          name: value.name,
          description: value.description,
          isAvailable: value.isAvailable,
          imageId: value.image?.id,
        })
        form.reset()
        onSuccess?.(updatedCategory)
        return
      }
      const newCategory = await createCategory({
        storeId: selectedStoreId,
        name: value.name,
        description: value.description,
        isAvailable: value.isAvailable,
        imageId: value.image?.id ?? null,
      })
      form.reset()
      onSuccess?.(newCategory)
    },
  })

  const image = useStore(form.store, state => state.values.image)

  const submitButtonText = isCreatingCategory ? 'Criar Categoria' : 'Atualizar Categoria'
  const submitButtonLoadingText = isCreatingCategory ? 'Criando...' : 'Atualizando...'
  const footerActions = (
    <form.Subscribe selector={state => [state.canSubmit, state.isSubmitting]}>
      {([canSubmit, isSubmitting]) => (
        <div className={cn('grid grid-cols-2 gap-2 justify-around', { 'mt-8': !FooterContainerComponent })}>
          <Button
            variant="secondary"
            type="reset"
            onClick={event => {
              event.preventDefault()
              form.reset()
            }}
          >
            {isCreatingCategory ? 'Limpar' : 'Desfazer alterações'}
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
        className={cn('grid grid-cols-1 md:grid-cols-2 gap-4 rounded w-full self-start', className)}
      >
        <form.Field name="image">
          {field => (
            <SingleFileUploader
              storeId={selectedStoreId}
              fileUrl={image?.url}
              fileTag="category"
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
          {!FooterContainerComponent && footerActions}
        </div>
      </form>
      {FooterContainerComponent && <FooterContainerComponent>{footerActions}</FooterContainerComponent>}
    </>
  )
}
