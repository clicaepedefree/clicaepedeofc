import { CardBrand } from '@/features/order/types'
import { Button } from '@/shared/button'
import { Combobox } from '@/shared/combobox'
import { CurrencyInput } from '@/shared/currency-input'
import { formatValueToCurrency, getValueFromCurrencyString } from '@/shared/formatters/currency'
import { Label } from '@/shared/label'
import { useMemo, useState } from 'react'
import { CartPayment } from '../../types'
import { CreditCardOperatorSelector } from '../credit-card-operator-selector'
import { DebitCardOperatorSelector } from '../debit-card-operator-selector'
import { FoodVoucherOperatorSelector } from '../food-voucher-operator-selector'
import { MealVoucherOperatorSelector } from '../meal-voucher-operator-selector'

type CardPaymentProps = {
  amountLeftToPay: number
  onPaymentAdded?(payment: CartPayment): Promise<void>
}

const cardTypes = ['CREDIT', 'DEBIT', 'FOOD_VOUCHER', 'MEAL_VOUCHER'] as const
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
  const amountLeftToPayAsString = String(amountLeftToPay)
  const [selectedCardType, setSelectedCardType] = useState<CardType>('CREDIT')
  const [cardAmount, setCardAmount] = useState(amountLeftToPayAsString)
  const [cardOperator, setCardOperator] = useState<CardBrand | null>(null)
  const [isSubmittingOrder, setIsSubmittingOrder] = useState(false)

  const cardAmountAsNumber = getValueFromCurrencyString(cardAmount)

  const onUpdateAmount = (value: string) => {
    const valueAsNumber = getValueFromCurrencyString(value)

    const isValueBiggerThanAmountLeftToPay = valueAsNumber > amountLeftToPay

    const updatedValue = isValueBiggerThanAmountLeftToPay ? amountLeftToPayAsString : value
    const formattedValue = formatValueToCurrency({ value: updatedValue })
    setCardAmount(formattedValue)
  }

  const onSubmitPayment = async () => {
    setIsSubmittingOrder(true)

    const payment = {
      type: 'PREPAID',
      value: formatValueToCurrency({ value: cardAmountAsNumber }),
      method: selectedCardType,
      cardBrand: cardOperator,
    } as const

    await onPaymentAdded?.(payment)
    setIsSubmittingOrder(false)
  }

  const isPaymentTotalAmount = amountLeftToPay == cardAmountAsNumber
  const canSubmitPayment = cardAmountAsNumber > 0 && cardOperator

  const CardOperatorSelector = useMemo(() => cardOperatorSelectorByType[selectedCardType], [selectedCardType])

  return (
    <div className="flex flex-col gap-6 px-4">
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
          value={selectedCardType}
          onChange={updatedValue => {
            setCardOperator(null)
            setSelectedCardType(updatedValue as CardType)
          }}
          placeholder="Tipo de cartão"
          noResultMessage="Nenhum tipo de cartão encontrado"
          disableUnselectingOption
        />
      </Label>
      {selectedCardType && (
        <Label size="sm" className="w-full" disableAutoFocus>
          Operadora
          <CardOperatorSelector value={cardOperator} onChange={value => setCardOperator(value)} />
        </Label>
      )}
      <Label size="sm" className="w-full">
        Valor pago
        <div className="flex items-center gap-4">
          <CurrencyInput
            className="max-w-72 w-fit"
            inputClassName="w-fit"
            value={cardAmount}
            onValueChange={updatedValue => onUpdateAmount(updatedValue ?? '0')}
          />
          <Button
            variant="outline"
            className="font-normal flex flex-col items-center justify-center border-amber-600 text-amber-800"
            onClick={() => onUpdateAmount(amountLeftToPayAsString)}
          >
            TOTAL (
            {formatValueToCurrency({ value: amountLeftToPayAsString, includeCurrencySymbol: true, decimalPlaces: 2 })})
          </Button>
        </div>
      </Label>
      <div className="space-y-2">
        <Button onClick={onSubmitPayment} disabled={!canSubmitPayment} isLoading={isSubmittingOrder}>
          {!isSubmittingOrder && (!isPaymentTotalAmount ? 'Adicionar pagamento' : 'Finalizar pedido')}
          {isSubmittingOrder && 'Finalizando pedido...'}
        </Button>
      </div>
    </div>
  )
}
