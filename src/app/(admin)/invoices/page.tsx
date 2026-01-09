'use client'
import { PageHeaderBlock } from '@/shared/blocks/page-header-block'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/shared/table'

import { listOrders } from '@/features/order/api'
import { ordersCacheKey } from '@/features/order/cache-keys'
import { Order } from '@/features/order/types'
import { selectedStoreIdAtom } from '@/features/store/state'
import { formatValueToCurrency } from '@/shared/formatters/currency'
import { formatDate } from '@/shared/formatters/date'
import { LargeText } from '@/shared/typography/large-text'
import { useQuery } from '@tanstack/react-query'
import { useAtom } from 'jotai'

export default function InvoicesPage() {
  const [selectedStoreId] = useAtom(selectedStoreIdAtom)

  const result = useQuery({
    enabled: !!selectedStoreId,
    queryKey: ordersCacheKey(selectedStoreId),
    queryFn: async () => {
      if (!selectedStoreId) throw new Error('No store selected')
      return listOrders(selectedStoreId)
    },
    refetchOnMount: 'always',
    refetchOnReconnect: true,
  })

  return (
    <>
      <PageHeaderBlock
        title="Notas fiscais"
        subtitle="Gerencie duas notas fiscais"
      />
      <Table className="table-auto overflow-x-scroll m-4 bg-white rounded-2xl">
        <TableHeader>
          <TableRow>
            <TableHead className="text-center">Pedido</TableHead>
            <TableHead className="text-center">Número</TableHead>
            <TableHead className="text-center">Série</TableHead>
            <TableHead className="text-center">Valor</TableHead>
            <TableHead className="text-center">Data do Pedido</TableHead>
            <TableHead className="text-center">Data da Emissão</TableHead>
            <TableHead className="text-center">Emitida</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {result.data?.map(order => <OrderRow key={order.id} order={order} />)}
        </TableBody>
      </Table>
    </>
  )
}

const OrderRow = ({ order }: { order: Order }) => {
  return (
    <TableRow>
      <TableCell className="text-center">
        <LargeText variant="sm">#{order.id}</LargeText>
      </TableCell>
      <TableCell className="text-center">
        <LargeText variant="sm">{order.id}</LargeText>
      </TableCell>
      <TableCell className="text-center">
        <LargeText variant="sm">1</LargeText>
      </TableCell>
      <TableCell className="text-center">
        <LargeText variant="sm">
          {formatValueToCurrency({
            value: order.totalPrice,
            includeCurrencySymbol: true,
          })}
        </LargeText>
      </TableCell>
      <TableCell className="text-center">
        <LargeText variant="sm">
          {formatDate(order.createdAt, 'DD/MM/YYYY HH:mm')}
        </LargeText>
      </TableCell>
      <TableCell className="text-center">
        <LargeText variant="sm">
          {formatDate(order.createdAt, 'DD/MM/YYYY HH:mm')}
        </LargeText>
      </TableCell>
      <TableCell className="text-center">
        <LargeText variant="sm">{order.id}</LargeText>
      </TableCell>
    </TableRow>
  )
}
