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
    label: 'Ticket',
    logoPath: '/images/card-operators/ticket.svg',
  },
  {
    value: 'vr',
    label: 'VR',
    logoPath: '/images/card-operators/vr.svg',
  },
  {
    value: 'banes',
    label: 'Banes Card',
    logoPath: '/images/card-operators/banes.svg',
  },
  {
    value: 'ben',
    label: 'Ben Card',
    logoPath: '/images/card-operators/ben.svg',
  },
  {
    value: 'good',
    label: 'Good Card',
    logoPath: '/images/card-operators/good.svg',
  },
  {
    value: 'green',
    label: 'Green Card',
    logoPath: '/images/card-operators/green.svg',
  },
  {
    value: 'vale',
    label: 'Vale Card',
    logoPath: '/images/card-operators/vale.svg',
  },
]

type FoodVoucherOperatorSelectorProps = {
  value: string
  onChange(value: string): void
}

export const FoodVoucherOperatorSelector = ({ value, onChange }: FoodVoucherOperatorSelectorProps) => {
  return <RadioGroupWithImage options={options} selectedValue={value} onValueChange={onChange} />
}
