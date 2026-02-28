import { paymentMethods } from '@/features/order/shared/payment-methods'
import { Badge } from '@/shared/badge'
import { formatValueToCurrency } from '@/shared/formatters/currency'
import { Separator } from '@/shared/separator'
import { Body } from '@/shared/typography/body'
import { LargeText } from '@/shared/typography/large-text'
import { Banknote, CreditCard } from 'lucide-react'
import { Fragment } from 'react'
import { CartPayment } from '../../types'

const getPaymentMethodInfo = (
  paymentMethod: (typeof paymentMethods)[number]['id']
): (typeof paymentMethods)[number] => {
  return paymentMethods.find(method => method.id === paymentMethod)!
}

export const PaymentsList = ({ payments }: { payments: CartPayment[] }) => {
  return (
    <div>
      <LargeText>Pagamentos</LargeText>
      <div>
        {payments?.map((payment, index) => {
          const methodInfo = getPaymentMethodInfo(payment.method)

          return (
            <Fragment key={index}>
              <div className="grid grid-cols-[auto_1fr_auto] gap-4 items-center py-2">
                <Badge className="rounded-full aspect-square w-6">
                  {index + 1}
                </Badge>
                <Body className="flex items-center gap-2">
                  {methodInfo.icon}
                  {methodInfo.name}
                </Body>
                <Body variant={200} className="text-right">
                  {formatValueToCurrency({
                    value: payment.value,
                    includeCurrencySymbol: true,
                  })}
                </Body>
              </div>
              {index < payments.length - 1 && <Separator />}
            </Fragment>
          )
        })}
      </div>
    </div>
  )
}
