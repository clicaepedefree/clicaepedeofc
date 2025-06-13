import { RadioGroupWithImage } from '@/shared/radio-group-with-image'

const options = [
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
    logoPath: '/images/card-operators/hiper.svg',
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

type DebitCardOperatorSelectorProps = {
  value?: string
  onChange(value: string): void
}

export const DebitCardOperatorSelector = ({ value, onChange }: DebitCardOperatorSelectorProps) => {
  return (
    <RadioGroupWithImage
      name="debit-card-operator-selector"
      options={options}
      selectedValue={value}
      onValueChange={onChange}
    />
  )
}
