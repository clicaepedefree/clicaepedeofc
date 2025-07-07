'use client'

import { selectedStoreIdAtom } from '@/features/store/state'
import { Button } from '@/shared/button'
import { CurrencyInput } from '@/shared/currency-input'
import { formatValueToCurrency } from '@/shared/formatters/currency'
import { Input } from '@/shared/input'
import { Label } from '@/shared/label'
import { cn } from '@/shared/lib/utils'
import { Textarea } from '@/shared/textarea'
import { useForm } from '@tanstack/react-form'
import { useAtom } from 'jotai'
import { z } from 'zod'
import { openCounter } from '../../api'
import { openCounterSchema } from '../../form-validation/counter.schema'
import { Counter } from '../../types'

type OpenCounterFormProps = {
  counter: Counter
  className?: string
  onSuccess?(): void
  onCancel?(): void
  FooterContainerComponent?: ComponentWithChildren
}

export const OpenCounterForm = ({
  className,
  counter,
  onSuccess,
  onCancel,
  FooterContainerComponent,
}: OpenCounterFormProps) => {
  const [selectedStoreId] = useAtom(selectedStoreIdAtom)

  const form = useForm({
    defaultValues: {
      counterId: counter.id,
      openAmount: '0',
      openNotes: null,
    } as z.input<typeof openCounterSchema>,
    validators: {
      onSubmit: openCounterSchema,
    },
    onSubmit: async ({ value }) => {
      if (!selectedStoreId) {
        console.error('Selecione uma loja antes de criar / atualizar um item.')
        return
      }

      await openCounter({
        storeId: selectedStoreId,
        counterId: counter.id,
        openAmount: formatValueToCurrency({ value: value.openAmount }),
        openNotes: value.openNotes,
      })

      form.reset()
      onSuccess?.()
      return
    },
  })

  const footerActions = (
    <form.Subscribe selector={state => [state.canSubmit]}>
      {([canSubmit]) => (
        <div
          className={cn('grid grid-cols-2 gap-2 justify-around', {
            'mt-8': !FooterContainerComponent,
          })}
        >
          <Button
            variant="secondary"
            type="button"
            onClick={event => {
              event.preventDefault()
              form.reset()
              onCancel?.()
            }}
          >
            Cancelar
          </Button>
          <Button
            type="submit"
            disabled={!canSubmit}
            onClick={form.handleSubmit}
          >
            Abrir balcão '{counter.name}'
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
        className={cn(
          'flex flex-col gap-4 rounded w-full self-start pb-1',
          className
        )}
      >
        <form.Field name="openAmount">
          {field => (
            <CurrencyInput
              label="Valor em dinheiro disponível no caixa"
              value={field.state.value ?? ''}
              onValueChange={value => field.handleChange(value ?? '')}
              className={cn('col-span-2')}
              error={field.state.meta.errors[0]?.message}
            />
          )}
        </form.Field>
        <form.Field name="openNotes">
          {field => (
            <Label>
              Observações
              <Textarea
                value={field.state.value ?? ''}
                onBlur={field.handleBlur}
                onChange={e => field.handleChange(e.target.value)}
                required
                error={field.state.meta.errors[0]?.message}
              />
            </Label>
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
