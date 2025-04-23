'use client'

import { z } from 'zod'
import { useForm } from '@tanstack/react-form'
import { useAtom } from 'jotai'
import { selectedStoreIdAtom } from '@/features/store/state'
import { createCategory } from '../../api'
import { useState } from 'react'
import { FormFieldError } from '@/shared/form/form-field-error'
import { UploadButton } from '@/shared/file-upload'

const createCategorySchema = z.object({
  name: z.string().min(3, 'Nome da categoria é obrigatório'),
  description: z.string(),
  isAvailable: z.boolean(),
  imagePath: z.string(),
})

export const CreateCategoryForm = () => {
  const [success, setSuccess] = useState(false)
  const [selectedStoreId] = useAtom(selectedStoreIdAtom)
  const form = useForm({
    defaultValues: {
      name: '',
      description: '',
      isAvailable: true,
      imagePath: '',
    },
    validators: {
      onChange: createCategorySchema,
    },
    onSubmit: async ({ value }) => {
      if (!selectedStoreId) {
        alert('Selecione uma loja antes de criar uma categoria.')
        return
      }
      await createCategory({
        storeId: selectedStoreId,
        name: value.name,
        description: value.description,
        isAvailable: value.isAvailable,
        imagePath: value.imagePath,
      })
      setSuccess(true)
      form.reset()
    },
  })
  return (
    <form
      onSubmit={e => {
        e.preventDefault()
        e.stopPropagation()
        form.handleSubmit()
      }}
      className="grid grid-cols-2 gap-3 bg-white p-4 rounded shadow w-full"
    >
      <UploadButton
        onClientUploadComplete={res => {
          console.log('Files: ', res)
          form.setFieldValue('imagePath', res[0].url)
        }}
        onUploadError={(error: Error) => {
          console.error(`ERROR! ${error.message}`)
        }}
      />
      <img src={form.state.values.imagePath} alt="Imagem da categoria" className="w-20 h-20" />
      <form.Field name="imagePath">
        {field => (
          <label>
            Caminho da Imagem
            <input
              type="text"
              value={field.state.value}
              onBlur={field.handleBlur}
              onChange={e => field.handleChange(e.target.value)}
              className="border p-2 rounded w-full"
            />
            <FormFieldError field={field} />
          </label>
        )}
      </form.Field>
      <form.Field name="name">
        {field => (
          <label>
            Nome
            <input
              type="text"
              value={field.state.value}
              onBlur={field.handleBlur}
              onChange={e => field.handleChange(e.target.value)}
              required
              className="border p-2 rounded w-full"
            />
            <FormFieldError field={field} />
          </label>
        )}
      </form.Field>
      <form.Field name="description">
        {field => (
          <label>
            Descrição
            <input
              type="text"
              value={field.state.value ?? ''}
              onBlur={field.handleBlur}
              onChange={e => field.handleChange(e.target.value)}
              className="border p-2 rounded w-full"
            />
            <FormFieldError field={field} />
          </label>
        )}
      </form.Field>
      <form.Field name="isAvailable">
        {field => (
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={field.state.value} onChange={e => field.handleChange(e.target.checked)} />
            Disponível
          </label>
        )}
      </form.Field>
      <form.Subscribe selector={state => [state.canSubmit, state.isSubmitting]}>
        {([canSubmit, isSubmitting]) => (
          <>
            <button
              type="submit"
              className="bg-blue-600 text-white py-2 rounded hover:bg-blue-700 mt-2"
              disabled={!canSubmit}
            >
              {isSubmitting ? 'Criando...' : 'Criar Categoria'}
            </button>
            <button type="reset" className="ml-2 border px-4 py-2 rounded" onClick={() => form.reset()}>
              Limpar
            </button>
          </>
        )}
      </form.Subscribe>
      {success && <div className="text-green-600 mt-2">Categoria criada com sucesso!</div>}
    </form>
  )
}
