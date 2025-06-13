import { CardBrand } from '@/features/order/types'
import { Button } from '@/shared/button'
import { Combobox } from '@/shared/combobox'
import { CurrencyInput } from '@/shared/currency-input'
import { formatValueToCurrency, getValueFromCurrencyString } from '@/shared/formatters/currency'
import { Label } from '@/shared/label'
import { useForm, useStore } from '@tanstack/react-form'

import { useMemo } from 'react'
import { z } from 'zod'

import { cardPaymentSchema, cardTypes } from '@/features/pos/form-validation/card-payment-schema'
import { CartPayment } from '@/features/pos/types'
import { CreditCardOperatorSelector } from '../credit-card-operator-selector'
import { DebitCardOperatorSelector } from '../debit-card-operator-selector'
import { FoodVoucherOperatorSelector } from '../food-voucher-operator-selector'
import { MealVoucherOperatorSelector } from '../meal-voucher-operator-selector'

type CardPaymentProps = {
  amountLeftToPay: number
  onPaymentAdded?(payment: CartPayment): Promise<void>
}

type CardType = (typeof cardTypes)[number]

type CardOperatorSelector = React.FC<{
  value: CardBrand | null
  onChange(value: CardBrand): void
}>

const cardOperatorSelectorByType: Record<CardType, CardOperatorSelector> = {
  CREDIT: CreditCardOperatorSelector as CardOperatorSelector,
  DEBIT: DebitCardOperatorSelector as CardOperatorSelector,
  FOOD_VOUCHER: FoodVoucherOperatorSelector as CardOperatorSelector,
  MEAL_VOUCHER: MealVoucherOperatorSelector as CardOperatorSelector,
}

export const CardPayment = ({ amountLeftToPay, onPaymentAdded }: CardPaymentProps) => {
  const form = useForm({
    defaultValues: {
      type: 'PREPAID',
      value: String(amountLeftToPay),
      cardType: 'CREDIT',
    } as z.input<typeof cardPaymentSchema>,
    validators: {
      onSubmit: cardPaymentSchema,
    },
    onSubmit: async ({ value }) => {
      const formattedPaymentValue = formatValueToCurrency({ value: value.value })

      const payment = {
        type: value.type,
        value: formattedPaymentValue,
        method: value.cardType,
        cardBrand: value.cardBrand,
      } as const

      await onPaymentAdded?.(payment)
    },
  })

  const amountLeftToPayAsString = formatValueToCurrency({ value: amountLeftToPay })

  const selectedCardType = useStore(form.store, state => state.values.cardType)
  const payingAmount = useStore(form.store, state => state.values.value)

  const isPaymentTotalAmount = amountLeftToPay == getValueFromCurrencyString(payingAmount)

  const CardOperatorSelector = useMemo(() => cardOperatorSelectorByType[selectedCardType], [selectedCardType])

  return (
    <form
      onSubmit={event => {
        event.preventDefault()
        event.stopPropagation()
        form.handleSubmit()
      }}
      className="flex flex-col gap-6 px-4"
    >
      <form.Field
        name="cardType"
        listeners={{
          onChange: () => form.resetField('cardBrand'),
        }}
      >
        {field => (
          <Label size="sm" className="w-full">
            Tipo de cartão
            <Combobox
              options={[
                {
                  value: 'DEBIT',
                  label: 'Cartão de débito',
                },
                {
                  value: 'CREDIT',
                  label: 'Cartão de crédito',
                },
                {
                  value: 'FOOD_VOUCHER',
                  label: 'Vale alimentação',
                },
                {
                  value: 'MEAL_VOUCHER',
                  label: 'Vale refeição',
                },
              ]}
              value={field.state.value}
              onChange={updatedValue => field.handleChange(updatedValue as CardType)}
              placeholder="Tipo de cartão"
              noResultMessage="Nenhum tipo de cartão encontrado"
              disableUnselectingOption
            />
          </Label>
        )}
      </form.Field>
      {selectedCardType && (
        <form.Field name="cardBrand">
          {field => (
            <Label size="sm" className="w-full" disableAutoFocus>
              Operadora
              <CardOperatorSelector
                value={field.state.value}
                onChange={value => (!!value ? field.handleChange(value) : form.resetField(field.name))}
              />
            </Label>
          )}
        </form.Field>
      )}
      <form.Field
        name="value"
        listeners={{
          onBlur: ({ value }) => {
            if (getValueFromCurrencyString(value) > amountLeftToPay) {
              form.resetField('value')
              form.setFieldValue('value', amountLeftToPayAsString)
            }
          },
        }}
        validators={{
          onChange: ({ value }) => {
            if (getValueFromCurrencyString(value) > amountLeftToPay) {
              return { message: 'Valor pago não pode ser maior do que o restante' }
            }
          },
          onBlur: ({ value }) => {
            if (getValueFromCurrencyString(value) <= 0) return { message: 'Valor deve ser maior que 0' }
          },
        }}
      >
        {field => (
          <Label size="sm" className="w-full">
            Valor pago
            <div className="flex items-center gap-4">
              <CurrencyInput
                className="max-w-72 w-fit"
                inputClassName="w-fit"
                value={field.state.value}
                onValueChange={updatedValue => field.handleChange(updatedValue ?? '0')}
                error={field.state.meta.errors[0]?.message}
                onBlur={field.handleBlur}
              />
              <Button
                variant="outline"
                className="font-normal self-baseline  flex flex-col items-center justify-center border-amber-600 text-amber-800"
                onClick={() => field.handleChange(amountLeftToPayAsString)}
              >
                TOTAL (
                {formatValueToCurrency({
                  value: amountLeftToPayAsString,
                  includeCurrencySymbol: true,
                  decimalPlaces: 2,
                })}
                )
              </Button>
            </div>
          </Label>
        )}
      </form.Field>
      <form.Subscribe selector={state => [state.canSubmit, state.isSubmitting]}>
        {([canSubmitPayment, isSubmittingOrder]) => (
          <div className="space-y-2">
            <Button type="submit" disabled={!canSubmitPayment} isLoading={isSubmittingOrder}>
              {!isSubmittingOrder && (!isPaymentTotalAmount ? 'Adicionar pagamento' : 'Finalizar pedido')}
              {isSubmittingOrder && 'Finalizando pedido...'}
            </Button>
          </div>
        )}
      </form.Subscribe>
    </form>
  )
}
