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

import { generateOrderReceipt, listOrders } from '@/features/order/api'
import { ordersCacheKey } from '@/features/order/cache-keys'
import { useReceiptWithQz } from '@/features/receipt/hooks/use-receipt-qz'
import { selectedStoreIdAtom } from '@/features/store/state'
import { Badge } from '@/shared/badge'
import { Button } from '@/shared/button'
import { formatValueToCurrency } from '@/shared/formatters/currency'
import { formatDate } from '@/shared/formatters/date'
import { OptionItemLine } from '@/shared/option-item-line'
import { LargeText } from '@/shared/typography/large-text'
import { useQuery } from '@tanstack/react-query'
import { useAtom } from 'jotai'
import { ChevronDown, ChevronRight, Printer } from 'lucide-react'
import { useCallback, useState } from 'react'
import { toast } from 'sonner'

type OrderWithDetails = Awaited<ReturnType<typeof listOrders>>[number]

export default function InvoicesPage() {
  const [selectedStoreId] = useAtom(selectedStoreIdAtom)

  // Move receipt hook to page level so ReceiptContent renders outside the table
  const {
    printReceipt,
    ReceiptContent,
  } = useReceiptWithQz()

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
        subtitle="Gerencie suas notas fiscais"
      />
      <Table className="table-auto overflow-x-scroll m-4 bg-white rounded-2xl">
        <TableHeader>
          <TableRow>
            <TableHead className="w-8" />
            <TableHead className="text-center">Pedido</TableHead>
            <TableHead className="text-center">Valor</TableHead>
            <TableHead className="text-center">Itens</TableHead>
            <TableHead className="text-center">Data do Pedido</TableHead>
            <TableHead className="text-center">Status</TableHead>
            <TableHead className="text-center">Ações</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {result.data?.map(order => (
            <OrderRow
              key={order.id}
              order={order}
              printReceipt={printReceipt}
            />
          ))}
        </TableBody>
      </Table>
      {/* ReceiptContent must be outside the table to avoid invalid HTML (div inside tbody) */}
      {ReceiptContent}
    </>
  )
}

type OrderRowProps = {
  order: OrderWithDetails
  printReceipt: (receiptSvg: string, orderDisplayId?: string | number) => Promise<boolean>
}

const OrderRow = ({
  order,
  printReceipt,
}: OrderRowProps) => {
  const [isExpanded, setIsExpanded] = useState(false)
  const [isPrinting, setIsPrinting] = useState(false)
  const hasItems = order.items && order.items.length > 0

  const handlePrint = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation() // Prevent row expansion when clicking print
      setIsPrinting(true)

      try {
        const result = await generateOrderReceipt(order.id)
        const printed = await printReceipt(result.receipt, result.displayId)
        if (printed) {
          toast.success('Recibo enviado para impressao', {
            description: `Pedido #${order.displayId}`,
            richColors: true,
            position: 'top-center',
            duration: 3000,
          })
        }
      } catch (error) {
        console.error('[Order Reprint Error]', error)
        toast.error('Erro ao reimprimir recibo', {
          description:
            error instanceof Error
              ? error.message
              : 'Nao foi possivel gerar o recibo do pedido.',
          richColors: true,
          position: 'top-center',
          duration: 5000,
        })
      } finally {
        setIsPrinting(false)
      }
    },
    [order.id, order.displayId, printReceipt]
  )

  return (
    <>
      <TableRow
        className={hasItems ? 'cursor-pointer hover:bg-muted/50' : ''}
        onClick={() => hasItems && setIsExpanded(!isExpanded)}
      >
        <TableCell className="w-8 text-center">
          {hasItems &&
            (isExpanded ? (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            ))}
        </TableCell>
        <TableCell className="text-center">
          <LargeText variant="sm">#{order.displayId}</LargeText>
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
            {order.items?.length ?? 0}{' '}
            {order.items?.length === 1 ? 'item' : 'itens'}
          </LargeText>
        </TableCell>
        <TableCell className="text-center">
          <LargeText variant="sm">
            {formatDate(order.createdAt, 'DD/MM/YYYY HH:mm')}
          </LargeText>
        </TableCell>
        <TableCell className="text-center">
          <LargeText variant="sm">
            <OrderStatusBadge status={order.status} />
          </LargeText>
        </TableCell>
        <TableCell className="text-center">
          <Button
            variant="ghost"
            size="sm"
            onClick={handlePrint}
            disabled={isPrinting}
            title="Imprimir recibo"
          >
            <Printer className="h-4 w-4" />
            <span className="ml-1 hidden sm:inline">Imprimir</span>
          </Button>
        </TableCell>
      </TableRow>
      {isExpanded && hasItems && (
        <TableRow>
          <TableCell colSpan={7} className="bg-muted/30 p-0">
            <div className="px-6 py-3">
              <div className="space-y-2">
                {order.items.map(item => (
                  <div key={item.id} className="flex flex-col gap-1">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">
                        {Number(item.quantity)}x {item.itemName}
                      </span>
                      <span className="text-sm text-muted-foreground">
                        {formatValueToCurrency({
                          value: item.price,
                          includeCurrencySymbol: true,
                        })}
                      </span>
                    </div>
                    {item.options && item.options.length > 0 && (
                      <div className="ml-4 space-y-0.5">
                        {item.options.map(option => (
                          <OptionItemLine
                            key={option.id}
                            name={option.optionName}
                            quantity={Number(option.quantity)}
                            price={Number(option.price)}
                            groupName={option.optionGroupName}
                          />
                        ))}
                      </div>
                    )}
                    {item.comment && (
                      <span className="text-xs text-muted-foreground italic ml-4">
                        Obs: {item.comment}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  )
}

const statusConfig: Record<
  string,
  {
    label: string
    variant: 'default' | 'secondary' | 'destructive' | 'warning'
  }
> = {
  PENDING: { label: 'Pendente', variant: 'warning' },
  COMPLETED: { label: 'Concluído', variant: 'default' },
  CANCELLED: { label: 'Cancelado', variant: 'destructive' },
}

const OrderStatusBadge = ({ status }: { status: string }) => {
  const config = statusConfig[status] ?? {
    label: status,
    variant: 'secondary' as const,
  }
  return <Badge variant={config.variant}>{config.label}</Badge>
}
