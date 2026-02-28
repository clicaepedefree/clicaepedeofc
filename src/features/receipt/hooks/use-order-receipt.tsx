import { useCallback } from 'react'
import { toast } from 'sonner'
import { useReceipt } from './use-receipt'

/**
 * Hook for printing order receipts with graceful error handling.
 *
 * Features:
 * - Wraps print call in try-catch
 * - Displays toast notification on print failure
 * - Includes retry option in error message
 * - Doesn't block or rollback the order on print failure
 * - Logs print errors for debugging
 */
export const useOrderReceipt = () => {
  const handlePrintError = useCallback((error: Error) => {
    console.error('[Order Receipt Print Error]', {
      message: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString(),
    })
  }, [])

  const {
    ReceiptContent,
    printReceipt: basePrintReceipt,
    isPrinting,
    printError,
    retryPrint,
    clearError,
    canRetry,
  } = useReceipt({
    onPrintError: handlePrintError,
  })

  const printOrderReceipt = useCallback(
    (receiptSvg: string, orderDisplayId?: string | number) => {
      try {
        basePrintReceipt(receiptSvg)
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        console.error('[Order Receipt Print Error] Synchronous error:', {
          orderDisplayId,
          error: errorMessage,
          timestamp: new Date().toISOString(),
        })

        toast.error('Erro ao imprimir recibo', {
          description: orderDisplayId
            ? `O pedido #${orderDisplayId} foi salvo, mas a impressao falhou.`
            : 'O pedido foi salvo, mas a impressao falhou.',
          richColors: true,
          position: 'top-center',
          dismissible: true,
          closeButton: true,
          duration: 10000,
          action: {
            label: 'Tentar novamente',
            onClick: () => {
              retryPrint()
            },
          },
        })
      }
    },
    [basePrintReceipt, retryPrint]
  )

  const showPrintErrorToast = useCallback(
    (orderDisplayId?: string | number) => {
      toast.error('Erro ao imprimir recibo', {
        description: orderDisplayId
          ? `O pedido #${orderDisplayId} foi salvo, mas a impressao falhou.`
          : 'O pedido foi salvo, mas a impressao falhou.',
        richColors: true,
        position: 'top-center',
        dismissible: true,
        closeButton: true,
        duration: 10000,
        action: canRetry
          ? {
              label: 'Tentar novamente',
              onClick: () => {
                clearError()
                retryPrint()
              },
            }
          : undefined,
      })
    },
    [canRetry, clearError, retryPrint]
  )

  return {
    ReceiptContent,
    printOrderReceipt,
    isPrinting,
    printError,
    retryPrint,
    showPrintErrorToast,
    canRetry,
  }
}
