import { Button } from '@/shared/button'
import { formatValueToCurrency, getValueFromCurrencyString } from '@/shared/formatters/currency'
import { TabsContent, TabsWithIcons } from '@/shared/tabs-with-icons'
import { Body } from '@/shared/typography/body'
import { LargeText } from '@/shared/typography/large-text'
import { ArrowLeft, Banknote, CreditCard } from 'lucide-react'
import { useCart } from '../../hooks/use-cart'
import { useCounters } from '../../hooks/use-counters'
import { CartPayment } from '../../types'
import { CardPayment } from './card-payment'
import { CashPayment } from './cash-payment'

const paymentTabs = [
  {
    name: 'Dinheiro',
    value: 'cash',
    content: 'Dinheiro',
    icon: <Banknote />,
  },
  {
    name: 'Cartão',
    value: 'card',
    content: 'Cartão',
    icon: <CreditCard />,
  },
  {
    name: 'PIX',
    value: 'pix',
    content: 'PIX',
    disabled: true,
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" fill="currentColor" className="p-0.5">
        <path d="M242.4 292.5C247.8 287.1 257.1 287.1 262.5 292.5L339.5 369.5C353.7 383.7 372.6 391.5 392.6 391.5H407.7L310.6 488.6C280.3 518.1 231.1 518.1 200.8 488.6L103.3 391.2H112.6C132.6 391.2 151.5 383.4 165.7 369.2L242.4 292.5zM262.5 218.9C256.1 224.4 247.9 224.5 242.4 218.9L165.7 142.2C151.5 127.1 132.6 120.2 112.6 120.2H103.3L200.7 22.8C231.1-7.6 280.3-7.6 310.6 22.8L407.8 119.9H392.6C372.6 119.9 353.7 127.7 339.5 141.9L262.5 218.9zM112.6 142.7C126.4 142.7 139.1 148.3 149.7 158.1L226.4 234.8C233.6 241.1 243 245.6 252.5 245.6C261.9 245.6 271.3 241.1 278.5 234.8L355.5 157.8C365.3 148.1 378.8 142.5 392.6 142.5H430.3L488.6 200.8C518.9 231.1 518.9 280.3 488.6 310.6L430.3 368.9H392.6C378.8 368.9 365.3 363.3 355.5 353.5L278.5 276.5C264.6 262.6 240.3 262.6 226.4 276.6L149.7 353.2C139.1 363 126.4 368.6 112.6 368.6H80.8L22.8 310.6C-7.6 280.3-7.6 231.1 22.8 200.8L80.8 142.7H112.6z" />
      </svg>
    ),
  },
]

type PosPaymentsProps = {
  amountPaid?: number
  amountLeftToPay?: number
  onClose: () => void
}

export const PosPayments = ({ amountPaid = 0, amountLeftToPay = 0, onClose }: PosPaymentsProps) => {
  const { createOrder, addPayment } = useCart('POS')
  const { activeCounterId, activeCounterName } = useCounters()

  const onPaymentAdded = async (payment: CartPayment) => {
    const paymentAmount = getValueFromCurrencyString(payment.value)
    addPayment(payment)

    if (paymentAmount >= amountLeftToPay) {
      await createOrder({
        counterId: activeCounterId!,
        counterName: activeCounterName!,
      })
    }
  }
  const paymentsFooter = (
    <div className="sticky float-end bottom-0 left-0 w-full p-2 bg-accent border-t z-20 grid grid-cols-[1fr_1fr_1fr] gap-4">
      <Button
        variant="secondary"
        size="xl"
        onClick={onClose}
        className="rounded-sm flex items-center justify-start gap-4 w-fit"
      >
        <ArrowLeft size={20} />
        <span className="text-start">
          Retornar para
          <br />
          atendimento
        </span>
      </Button>
      <div className="text-center text-amber-800 space-y-0.5">
        <Body variant={200} className="text-inherit">
          Valor restante
        </Body>
        <LargeText variant="xl">
          {formatValueToCurrency({ value: amountLeftToPay, includeCurrencySymbol: true })}
        </LargeText>
      </div>
      <div className="text-center text-green-800 space-y-0.5">
        <Body variant={200} className="text-inherit">
          Valor pago
        </Body>
        <LargeText variant="xl">{formatValueToCurrency({ value: amountPaid, includeCurrencySymbol: true })}</LargeText>
      </div>
    </div>
  )

  return (
    <TabsWithIcons
      className="relative bg-white w-full h-full rounded-xl border"
      headerClassName=" bg-bottom"
      triggerClassName="[&>svg]:h-7 [&>svg]:w-7 "
      tabs={paymentTabs}
      footer={paymentsFooter}
    >
      <TabsContent value={'cash'}>
        <CashPayment amountLeftToPay={amountLeftToPay} onPaymentAdded={onPaymentAdded} />
      </TabsContent>
      <TabsContent value={'card'}>
        <CardPayment amountLeftToPay={amountLeftToPay} onPaymentAdded={onPaymentAdded} />
      </TabsContent>
      <TabsContent value={'pix'}>PIX</TabsContent>
    </TabsWithIcons>
  )
}
