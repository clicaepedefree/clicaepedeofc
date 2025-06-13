import { Button } from '@/shared/button'
import { CurrencyInput } from '@/shared/currency-input'
import { formatValueToCurrency, getValueFromCurrencyString } from '@/shared/formatters/currency'
import { Label } from '@/shared/label'
import { LargeText } from '@/shared/typography/large-text'
import { useState } from 'react'
import { CartPayment } from '../../types'

type CashPaymentProps = {
  amountLeftToPay: number
  onPaymentAdded?(payment: CartPayment): Promise<void>
}

const cashPaymentButtons = ['100', '50', '20', '10', '5', '2']

export const CashPayment = ({ amountLeftToPay, onPaymentAdded }: CashPaymentProps) => {
  const amountLeftToPayAsString = String(amountLeftToPay)
  const [cashAmount, setCashAmount] = useState(amountLeftToPayAsString)
  const [isSubmittingOrder, setIsSubmittingOrder] = useState(false)

  const cashAmountAsNumber = getValueFromCurrencyString(cashAmount)

  const onClickCashOption = (buttonValue: string) => {
    const formattedValue = formatValueToCurrency({ value: buttonValue })
    setCashAmount(formattedValue)
  }

  const onSubmitPayment = async () => {
    setIsSubmittingOrder(true)

    const changeFor = totalChange > 0 ? cashAmount : null
    const paymentAmount = totalChange > 0 ? amountLeftToPay : cashAmountAsNumber

    const payment = {
      type: 'PREPAID',
      value: formatValueToCurrency({ value: paymentAmount }),
      method: 'CASH',
      changeFor,
    } as const

    await onPaymentAdded?.(payment)
    setIsSubmittingOrder(false)
  }

  const totalChange = cashAmountAsNumber - amountLeftToPay
  const canSubmitPayment = cashAmountAsNumber > 0

  return (
    <div className="flex flex-col gap-6 px-4">
      <Label size="sm" className="w-full">
        Valor pago
        <CurrencyInput
          className="w-full"
          inputClassName="w-fit"
          value={cashAmount}
          onValueChange={updatedValue => setCashAmount(updatedValue ?? '0')}
          autoFocus
        />
      </Label>
      <div className="flex items-center gap-4 justify-center">
        <Button
          variant="outline"
          className="font-normal flex flex-col items-center justify-center border-amber-600 text-amber-800"
          onClick={() => onClickCashOption(amountLeftToPayAsString)}
        >
          {formatValueToCurrency({ value: amountLeftToPayAsString, includeCurrencySymbol: true, decimalPlaces: 2 })}
        </Button>
        {cashPaymentButtons.map(buttonValue => (
          <Button
            variant="outline"
            className="font-normal"
            key={buttonValue}
            onClick={() => onClickCashOption(buttonValue)}
          >
            {formatValueToCurrency({ value: buttonValue, includeCurrencySymbol: true, decimalPlaces: 0 })}
          </Button>
        ))}
      </div>

      <div className="space-y-2">
        <Button onClick={onSubmitPayment} disabled={!canSubmitPayment} isLoading={isSubmittingOrder}>
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
