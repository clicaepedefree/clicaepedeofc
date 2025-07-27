'use client'

import { useReceipt } from '@/features/receipt/hooks/use-receipt'
import { selectedStoreIdAtom } from '@/features/store/state'
import { Badge } from '@/shared/badge'
import { Button } from '@/shared/button'
import { CurrencyInput } from '@/shared/currency-input'
import { formatValueToCurrency } from '@/shared/formatters/currency'
import { Label } from '@/shared/label'
import { cn } from '@/shared/lib/utils'
import { LoadingSpinner } from '@/shared/spinner'
import { Table, TableBody, TableCell, TableRow } from '@/shared/table'
import { Textarea } from '@/shared/textarea'
import { Headline } from '@/shared/typography/headline'
import { useForm } from '@tanstack/react-form'
import { useAtom } from 'jotai'
import { z } from 'zod'
import { closeCounter } from '../../api'
import { closeCounterSchema } from '../../form-validation/counter.schema'
import { useCounterSession } from '../../hooks/use-counter-session'
import { Counter } from '../../types'

type CloseCounterFormProps = {
  counter: Counter
  className?: string
  onSuccess?(): void
  onCancel?(): void
  FooterContainerComponent?: ComponentWithChildren
}

export const CloseCounterForm = ({
  className,
  counter,
  onSuccess,
  onCancel,
  FooterContainerComponent,
}: CloseCounterFormProps) => {
  const [selectedStoreId] = useAtom(selectedStoreIdAtom)
  const { counterSessionSummary, isLoading } = useCounterSession({
    counterId: counter.id,
    counterSessionId: counter.currentSession?.id,
  })
  const { isPrinting, printReceipt, ReceiptContent } = useReceipt()

  const form = useForm({
    defaultValues: {
      counterId: counter.id,
      closeAmount: '0',
      closeNotes: null,
    } as z.input<typeof closeCounterSchema>,
    validators: {
      onSubmit: closeCounterSchema,
    },
    onSubmit: async ({ value }) => {
      if (!selectedStoreId) {
        console.error('Selecione uma loja antes de criar / atualizar um item.')
        return
      }

      const closedSession = await closeCounter({
        storeId: selectedStoreId,
        counterId: counter.id,
        closeAmount: formatValueToCurrency({ value: value.closeAmount }),
        closeNotes: value.closeNotes,
      })

      form.reset()
      onSuccess?.()
      if (closedSession?.closeReceipt) {
        printReceipt(closedSession.closeReceipt)
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
            {`Fechar caixa '${counter.name}'`}
          </Button>
        </div>
      )}
    </form.Subscribe>
  )

  if (!selectedStoreId) return null

  if (isLoading) return <LoadingSpinner />

  const { expectedCashLeft = '0', categoriesSummary } =
    counterSessionSummary ?? {}

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
        <section>
          <Headline variant={500}>Resumo de caixa</Headline>
          <Table className="w-fit">
            <TableBody>
              <TableRow>
                <TableCell>Caixa inicial:</TableCell>
                <TableCell>
                  {formatValueToCurrency({
                    value: counter.currentSession?.openAmount ?? '0',
                    includeCurrencySymbol: true,
                  })}
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell>Valor recebido em dinheiro:</TableCell>
                <TableCell>
                  {formatValueToCurrency({
                    value: categoriesSummary?.paymentMethod.CASH.total ?? '0',
                    includeCurrencySymbol: true,
                  })}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </section>
        <form.Field name="closeAmount">
          {field => (
            <CurrencyInput
              prefixElement={
                <Badge variant="warning" className="mr-2 self-stretch">
                  Esperado{' '}
                  {formatValueToCurrency({
                    value: expectedCashLeft,
                    includeCurrencySymbol: true,
                  })}
                </Badge>
              }
              label="Valor em dinheiro restante no caixa"
              value={field.state.value ?? ''}
              onValueChange={value => field.handleChange(value ?? '')}
              className={cn('col-span-2')}
              error={field.state.meta.errors[0]?.message}
            />
          )}
        </form.Field>
        <form.Field name="closeNotes">
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
