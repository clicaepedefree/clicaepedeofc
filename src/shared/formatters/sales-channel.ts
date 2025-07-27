import { SalesChannel } from '@/features/order/types'

const salesChannelToInfoMapping: Record<SalesChannel, { name: string }> = {
  POS: {
    name: 'PDV',
  },
}
export const getSalesChannelName = (salesChannel: SalesChannel | string) => {
  return (
    salesChannelToInfoMapping[salesChannel as SalesChannel]?.name ??
    salesChannel
  )
}
