import { RadioGroupWithImage } from '@/shared/radio-group-with-image'

const options = [
  {
    value: 'alelo',
    label: 'Alelo',
    logoPath: '/images/card-operators/alelo.svg',
  },
  {
    value: 'sodexo',
    label: 'Sodexo',
    logoPath: '/images/card-operators/sodexo.svg',
  },
  {
    value: 'ticket',
    label: 'Ticket Restaurante',
    logoPath: '/images/card-operators/ticket-restaurante.svg',
  },
  {
    value: 'vr',
    label: 'VR',
    logoPath: '/images/card-operators/vr-vale-refeicao.svg',
  },
  {
    value: 'banes',
    label: 'Banes Card',
    logoPath: '/images/card-operators/banes-card.svg',
  },
  {
    value: 'ben',
    label: 'Ben Card',
    logoPath: '/images/card-operators/ben-card.svg',
  },
  {
    value: 'good',
    label: 'Good Card',
    logoPath: '/images/card-operators/good-card.png',
  },
  {
    value: 'green',
    label: 'Green Card',
    logoPath: '/images/card-operators/green-card.png',
  },
  {
    value: 'vale',
    label: 'Vale Card',
    logoPath: '/images/card-operators/vale-card.svg',
  },
]

type MealVoucherOperatorSelectorProps = {
  value?: string
  onChange(value: string): void
}

export const MealVoucherOperatorSelector = ({ value, onChange }: MealVoucherOperatorSelectorProps) => {
  return (
    <RadioGroupWithImage
      name="meal-voucher-operator-selector"
      options={options}
      selectedValue={value}
      onValueChange={onChange}
    />
  )
}
