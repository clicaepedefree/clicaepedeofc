'use client'
/**
 * Test page to verify the invoices table HTML structure is valid
 * (no div inside tbody hydration errors)
 */

import { useOrderReceipt } from '@/features/receipt/hooks/use-order-receipt'
import { Badge } from '@/shared/badge'
import { Button } from '@/shared/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/shared/table'
import { LargeText } from '@/shared/typography/large-text'
import { ChevronDown, ChevronRight, Printer } from 'lucide-react'
import { useState } from 'react'

// Mock orders for testing table structure
const mockOrders = [
  {
    id: '1',
    displayId: '001',
    totalPrice: 5000, // R$ 50.00
    status: 'COMPLETED',
    createdAt: new Date(),
    items: [
      { id: 'item1', itemName: 'Item A', quantity: 2, price: 2500 },
      { id: 'item2', itemName: 'Item B', quantity: 1, price: 2500 },
    ],
  },
  {
    id: '2',
    displayId: '002',
    totalPrice: 3000, // R$ 30.00
    status: 'PENDING',
    createdAt: new Date(),
    items: [],
  },
]

export default function TestInvoicesTablePage() {
  // Receipt hook at page level - the key fix we're testing
  const {
    printOrderReceipt,
    ReceiptContent,
    printError,
    showPrintErrorToast,
  } = useOrderReceipt()

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-4">Test: Invoices Table Structure</h1>
      <p className="mb-4 text-gray-600">
        This page tests that the table structure is valid HTML (no div inside tbody).
        Check the browser console for hydration errors.
      </p>

      <Table className="table-auto overflow-x-scroll bg-white rounded-2xl">
        <TableHeader>
          <TableRow>
            <TableHead className="w-8" />
            <TableHead className="text-center">Pedido</TableHead>
            <TableHead className="text-center">Valor</TableHead>
            <TableHead className="text-center">Itens</TableHead>
            <TableHead className="text-center">Data do Pedido</TableHead>
            <TableHead className="text-center">Status</TableHead>
            <TableHead className="text-center">Acoes</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {mockOrders.map(order => (
            <MockOrderRow
              key={order.id}
              order={order}
              printOrderReceipt={printOrderReceipt}
              printError={printError}
              showPrintErrorToast={showPrintErrorToast}
            />
          ))}
        </TableBody>
      </Table>
      {/* ReceiptContent is now outside the table - no div inside tbody! */}
      {ReceiptContent}

      <div className="mt-4 p-4 bg-green-100 rounded">
        <h2 className="font-bold text-green-800">Structure Check:</h2>
        <ul className="list-disc list-inside text-green-700">
          <li>ReceiptContent (div) is rendered outside the table</li>
          <li>TableBody only contains TableRow elements</li>
          <li>No hydration error should appear in console</li>
        </ul>
      </div>
    </div>
  )
}

type MockOrder = (typeof mockOrders)[number]

type MockOrderRowProps = {
  order: MockOrder
  printOrderReceipt: (receiptSvg: string, orderDisplayId?: string | number) => void
  printError: Error | null
  showPrintErrorToast: (orderDisplayId?: string | number) => void
}

const MockOrderRow = ({
  order,
  printOrderReceipt,
  printError,
  showPrintErrorToast,
}: MockOrderRowProps) => {
  const [isExpanded, setIsExpanded] = useState(false)
  const [isPrinting, setIsPrinting] = useState(false)
  const hasItems = order.items && order.items.length > 0

  const handlePrint = async (e: React.MouseEvent) => {
    e.stopPropagation()
    setIsPrinting(true)
    // Simulate print action
    setTimeout(() => setIsPrinting(false), 1000)
  }

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
          <LargeText variant="sm">R$ {(order.totalPrice / 100).toFixed(2)}</LargeText>
        </TableCell>
        <TableCell className="text-center">
          <LargeText variant="sm">
            {order.items?.length ?? 0}{' '}
            {order.items?.length === 1 ? 'item' : 'itens'}
          </LargeText>
        </TableCell>
        <TableCell className="text-center">
          <LargeText variant="sm">28/02/2026 10:00</LargeText>
        </TableCell>
        <TableCell className="text-center">
          <Badge variant={order.status === 'COMPLETED' ? 'default' : 'warning'}>
            {order.status === 'COMPLETED' ? 'Concluido' : 'Pendente'}
          </Badge>
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
                  <div key={item.id} className="flex items-center justify-between">
                    <span className="text-sm font-medium">
                      {Number(item.quantity)}x {item.itemName}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      R$ {(item.price / 100).toFixed(2)}
                    </span>
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
