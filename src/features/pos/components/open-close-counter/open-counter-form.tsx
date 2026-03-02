'use client'

import { shouldUseQzTrayPrintingAtom } from '@/features/qz-tray/state'
import { useReceiptWithQz } from '@/features/receipt/hooks/use-receipt-qz'
import { selectedStoreIdAtom } from '@/features/store/state'
import { Button } from '@/shared/button'
import { CurrencyInput } from '@/shared/currency-input'
import { formatValueToCurrency } from '@/shared/formatters/currency'
import { Label } from '@/shared/label'
import { cn } from '@/shared/lib/utils'
import { Textarea } from '@/shared/textarea'
import { Body } from '@/shared/typography/body'
import { SmallText } from '@/shared/typography/small-text'
import { useForm } from '@tanstack/react-form'
import { useAtom } from 'jotai'
import { AlertTriangle, CheckCircle2, ExternalLink } from 'lucide-react'
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
  const [shouldUseQzTrayPrinting] = useAtom(shouldUseQzTrayPrintingAtom)
  const { isPrinting, printReceipt, ReceiptContent } = useReceiptWithQz()

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

      const openedSession = await openCounter({
        storeId: selectedStoreId,
        counterId: counter.id,
        openAmount: formatValueToCurrency({ value: value.openAmount }),
        openNotes: value.openNotes,
      })

      form.reset()
      onSuccess?.()
      if (openedSession?.openReceipt) {
        printReceipt(openedSession.openReceipt)
      }
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
            isLoading={isPrinting}
            disabled={!canSubmit || isPrinting}
            onClick={form.handleSubmit}
          >
            {`Abrir caixa '${counter.name}'`}
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
        {/* QZ Tray print status indicator */}
        {shouldUseQzTrayPrinting ? (
          <div className="flex items-center gap-2 text-green-700 dark:text-green-400">
            <CheckCircle2 className="h-4 w-4" />
            <SmallText>QZ Tray conectado</SmallText>
          </div>
        ) : (
          <div className="rounded-md bg-amber-50 border border-amber-200 p-3 text-amber-800 dark:bg-amber-950 dark:border-amber-800 dark:text-amber-200">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-5 w-5 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <Body variant={200} fontWeight="medium">
                  QZ Tray não está conectado
                </Body>
                <Body variant={200} fontWeight="regular" className="mt-1">
                  Os recibos serão impressos pelo navegador. Para impressão
                  automática,{' '}
                  <a
                    href="/settings/integracoes"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline hover:no-underline inline-flex items-center gap-1"
                  >
                    conecte o QZ Tray
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </Body>
              </div>
            </div>
          </div>
        )}

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
      {ReceiptContent}
    </>
  )
}
