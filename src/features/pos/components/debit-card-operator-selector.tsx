import { RadioGroupWithImage } from '@/shared/radio-group-with-image'

const options = [
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
    logoPath: '/images/card-operators/hiper.svg',
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

type DebitCardOperatorSelectorProps = {
  value: (typeof options)[number]['value'] | null
  onChange(value: (typeof options)[number]['value']): void
}

export const DebitCardOperatorSelector = ({ value, onChange }: DebitCardOperatorSelectorProps) => {
  return (
    <RadioGroupWithImage
      name="debit-card-operator-selector"
      options={[...options]}
      selectedValue={value}
      onValueChange={onChange}
    />
  )
}
