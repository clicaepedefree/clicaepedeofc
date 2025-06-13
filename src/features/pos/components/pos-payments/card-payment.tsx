import { Button } from '@/shared/button'
import { Combobox } from '@/shared/combobox'
import { CurrencyInput } from '@/shared/currency-input'
import { formatValueToCurrency, getValueFromCurrencyString } from '@/shared/formatters/currency'
import { Label } from '@/shared/label'
import { LargeText } from '@/shared/typography/large-text'
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

const cardPaymentButtons = ['100', '50', '20', '10', '5', '2']

const cardTypes = ['CREDIT', 'DEBIT', 'FOOD_VOUCHER', 'MEAL_VOUCHER'] as const
type CardType = (typeof cardTypes)[number]

const cardOperatorSelectorByType: Record<CardType, React.FC<{ value?: string; onChange: (value: string) => void }>> = {
  CREDIT: CreditCardOperatorSelector,
  DEBIT: DebitCardOperatorSelector,
  FOOD_VOUCHER: FoodVoucherOperatorSelector,
  MEAL_VOUCHER: MealVoucherOperatorSelector,
} as const

export const CardPayment = ({ amountLeftToPay, onPaymentAdded }: CardPaymentProps) => {
  const amountLeftToPayAsString = String(amountLeftToPay)
  const [selectedCardType, setSelectedCardType] = useState<CardType>('CREDIT')
  const [cardAmount, setCardAmount] = useState(amountLeftToPayAsString)
  const [cardOperator, setCardOperator] = useState<string | undefined>(undefined)
  console.log('cardOperator', cardOperator)
  const [isSubmittingOrder, setIsSubmittingOrder] = useState(false)

  const cardAmountAsNumber = getValueFromCurrencyString(cardAmount)

  const onClickCardOption = (buttonValue: string) => {
    const formattedValue = formatValueToCurrency({ value: buttonValue })
    setCardAmount(formattedValue)
  }

  const onSubmitPayment = async () => {
    setIsSubmittingOrder(true)

    const changeFor = totalChange > 0 ? cardAmount : null
    const paymentAmount = totalChange > 0 ? amountLeftToPay : cardAmountAsNumber

    const payment = {
      type: 'PREPAID',
      value: formatValueToCurrency({ value: paymentAmount }),
      method: 'CREDIT',
      changeFor,
    } as const

    await onPaymentAdded?.(payment)
    setIsSubmittingOrder(false)
  }

  const totalChange = cardAmountAsNumber - amountLeftToPay
  const canSubmitPayment = cardAmountAsNumber > 0

  const CardOperatorSelector = useMemo(() => cardOperatorSelectorByType[selectedCardType], [selectedCardType])

  return (
    <div className="flex flex-col items-center gap-4">
      <Label size="sm" className="w-full px-4">
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
            setCardOperator(undefined)
            setSelectedCardType(updatedValue as CardType)
          }}
          placeholder="Tipo de cartão"
          noResultMessage="Nenhum tipo de cartão encontrado"
          disableUnselectingOption
        />
      </Label>
      {selectedCardType && (
        <Label size="sm" className="w-full px-4" disableAutoFocus>
          Operadora
          <CardOperatorSelector value={cardOperator} onChange={setCardOperator} />
        </Label>
      )}
      <CurrencyInput
        className="max-w-72 w-fit"
        inputClassName="text-center w-fit"
        value={cardAmount}
        onValueChange={updatedValue => setCardAmount(updatedValue ?? '0')}
        autoFocus
      />
      <div className="flex items-center gap-4 justify-center">
        <Button
          variant="outline"
          className="font-normal flex flex-col items-center justify-center border-amber-600 text-amber-800"
          onClick={() => onClickCardOption(amountLeftToPayAsString)}
        >
          {formatValueToCurrency({ value: amountLeftToPayAsString, includeCurrencySymbol: true, decimalPlaces: 2 })}
        </Button>
        {cardPaymentButtons.map(buttonValue => (
          <Button
            variant="outline"
            className="font-normal"
            key={buttonValue}
            onClick={() => onClickCardOption(buttonValue)}
          >
            {formatValueToCurrency({ value: buttonValue, includeCurrencySymbol: true, decimalPlaces: 0 })}
          </Button>
        ))}
      </div>
      <div className="space-y-2 text-center">
        <Button className="mt-4" onClick={onSubmitPayment} disabled={!canSubmitPayment} isLoading={isSubmittingOrder}>
          {!isSubmittingOrder && (totalChange < 0 ? 'Adicionar pagamento' : 'Finalizar pedido')}
          {isSubmittingOrder && 'Finalizando pedido...'}
        </Button>
        {totalChange > 0 && (
          <LargeText variant="md">
            Troco: {formatValueToCurrency({ value: totalChange, includeCurrencySymbol: true, decimalPlaces: 2 })}
          </LargeText>
        )}
      </div>
    </div>
  )
}
