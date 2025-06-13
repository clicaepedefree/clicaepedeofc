import { RadioGroupWithImage } from '@/shared/radio-group-with-image'

const options = [
  {
    value: 'ALELO',
    label: 'Alelo',
    logoPath: '/images/card-operators/alelo.svg',
  },
  {
    value: 'SODEXO',
    label: 'Sodexo',
    logoPath: '/images/card-operators/sodexo.svg',
  },
  {
    value: 'TICKET',
    label: 'Ticket Restaurante',
    logoPath: '/images/card-operators/ticket-restaurante.svg',
  },
  {
    value: 'VR_BENEFICIOS',
    label: 'VR',
    logoPath: '/images/card-operators/vr-vale-refeicao.svg',
  },
  {
    value: 'BANES_CARD',
    label: 'Banes Card',
    logoPath: '/images/card-operators/banes-card.svg',
  },
  {
    value: 'BEN_CARD',
    label: 'Ben Card',
    logoPath: '/images/card-operators/ben-card.svg',
  },
  {
    value: 'GOOD_CARD',
    label: 'Good Card',
    logoPath: '/images/card-operators/good-card.png',
  },
  {
    value: 'GREEN_CARD',
    label: 'Green Card',
    logoPath: '/images/card-operators/green-card.png',
  },
  {
    value: 'VALE_CARD',
    label: 'Vale Card',
    logoPath: '/images/card-operators/vale-card.svg',
  },
] as const

type MealVoucherOperatorSelectorProps = {
  value: (typeof options)[number]['value'] | null
  onChange(value: (typeof options)[number]['value']): void
}

export const MealVoucherOperatorSelector = ({ value, onChange }: MealVoucherOperatorSelectorProps) => {
  return (
    <RadioGroupWithImage
      name="meal-voucher-operator-selector"
      options={[...options]}
      selectedValue={value}
      onValueChange={onChange}
    />
  )
}
