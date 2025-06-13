import { RadioGroupWithImage } from '@/shared/radio-group-with-image'

const options = [
  {
    value: 'AMEX',
    label: 'American Express',
    logoPath: '/images/card-operators/american-express.svg',
  },
  {
    value: 'DINERS',
    label: 'Diners',
    logoPath: '/images/card-operators/diners.svg',
  },
  {
    value: 'ELO',
    label: 'Elo',
    logoPath: '/images/card-operators/elo.svg',
  },
  {
    value: 'HIPERCARD',
    label: 'Hiper',
    logoPath: '/images/card-operators/hipercard.svg',
  },
  {
    value: 'MASTERCARD',
    label: 'Mastercard',
    logoPath: '/images/card-operators/mastercard.svg',
  },
  {
    value: 'VISA',
    label: 'Visa',
    logoPath: '/images/card-operators/visa.svg',
  },
] as const

type CreditCardOperatorSelectorProps = {
  value: (typeof options)[number]['value'] | null
  onChange(value: (typeof options)[number]['value']): void
}

export const CreditCardOperatorSelector = ({ value, onChange }: CreditCardOperatorSelectorProps) => {
  return (
    <RadioGroupWithImage
      name="credit-card-operator-selector"
      options={[...options]}
      selectedValue={value}
      onValueChange={onChange}
    />
  )
}
