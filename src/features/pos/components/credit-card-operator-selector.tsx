import { RadioGroupWithImage } from '@/shared/radio-group-with-image'

const options = [
  {
    value: 'american-express',
    label: 'American Express',
    logoPath: '/images/card-operators/american-express.svg',
  },
  {
    value: 'diners',
    label: 'Diners',
    logoPath: '/images/card-operators/diners.svg',
  },
  {
    value: 'elo',
    label: 'Elo',
    logoPath: '/images/card-operators/elo.svg',
  },
  {
    value: 'hiper',
    label: 'Hiper',
    logoPath: '/images/card-operators/hipercard.svg',
  },
  {
    value: 'mastercard',
    label: 'Mastercard',
    logoPath: '/images/card-operators/mastercard.svg',
  },
  {
    value: 'visa',
    label: 'Visa',
    logoPath: '/images/card-operators/visa.svg',
  },
]

type CreditCardOperatorSelectorProps = {
  value?: string
  onChange: (value: string) => void
}

export const CreditCardOperatorSelector = ({ value, onChange }: CreditCardOperatorSelectorProps) => {
  return (
    <RadioGroupWithImage
      name="credit-card-operator-selector"
      options={options}
      selectedValue={value}
      onValueChange={onChange}
    />
  )
}
