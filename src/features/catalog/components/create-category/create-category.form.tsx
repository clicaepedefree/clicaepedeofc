'use client'

import { z } from 'zod'
import { useForm, useStore } from '@tanstack/react-form'
import { useAtom } from 'jotai'
import { selectedStoreIdAtom } from '@/features/store/state'
import { createCategory } from '../../api'
import { SingleFileUploader } from '@/shared/file-upload'
import { Input } from '@/shared/input'
import { Label } from '@/shared/label'
import { Button } from '@/shared/button'
import { Textarea } from '@/shared/textarea'
import { Category } from '../../types'
import { cn } from '@/lib/utils'
import { fileSchema } from '@/features/store/form-validation/file-schema'

type CreateCategoryFormProps = {
  className?: string
  onSuccess?(newCategory: Category): void
  FooterContainerComponent?: ComponentWithChildren
}

const createCategorySchema = z.object({
  name: z
    .string()
    .nonempty('Nome da categoria é obrigatório')
    .min(3, 'Nome da categoria deve ter pelo menos 3 caracteres'),
  description: z.union([z.string(), z.null()]),
  isAvailable: z.boolean(),
  image: z.union([fileSchema, z.null()]),
})

const defaultValues: z.input<typeof createCategorySchema> = {
  name: '',
  description: null,
  isAvailable: true,
  image: null,
}

export const CreateCategoryForm = ({ className, onSuccess, FooterContainerComponent }: CreateCategoryFormProps) => {
  const [selectedStoreId] = useAtom(selectedStoreIdAtom)
  const form = useForm({
    defaultValues,
    validators: {
      onChange: createCategorySchema,
    },
    onSubmit: async ({ value }) => {
      if (!selectedStoreId) {
        console.error('Selecione uma loja antes de criar uma categoria.')
        return
      }
      const newCategory = await createCategory({
        storeId: selectedStoreId,
        name: value.name,
        description: value.description,
        isAvailable: value.isAvailable,
        imageId: value.image?.id,
      })
      form.reset()
      onSuccess?.(newCategory)
    },
  })

  const image = useStore(form.store, state => state.values.image)

  const footerActions = (
    <form.Subscribe selector={state => [state.canSubmit, state.isSubmitting]}>
      {([canSubmit, isSubmitting]) => (
        <div className={cn('grid grid-cols-2 gap-2 justify-around', { 'mt-8': !FooterContainerComponent })}>
          <Button variant="secondary" type="reset" onClick={() => form.reset()}>
            Limpar
          </Button>
          <Button type="submit" disabled={!canSubmit} onClick={form.handleSubmit}>
            {isSubmitting ? 'Criando...' : 'Criar Categoria'}
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
        <SingleFileUploader
          storeId={selectedStoreId}
          fileUrl={image?.url}
          onFileUploaded={file => form.setFieldValue('image', { id: file.serverData.id, url: file.serverData.url })}
          onFileDeleted={() => form.setFieldValue('image', null)}
          className={cn('row-span-full')}
        />
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
