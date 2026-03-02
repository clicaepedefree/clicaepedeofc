'use client'

import { usePrintToQZTray } from '@/features/qz-tray/hooks/use-print-to-qz-tray'
import { useCallback } from 'react'
import { toast } from 'sonner'
import { useReceipt } from './use-receipt'

/**
 * Hook for printing receipts with QZ Tray support.
 *
 * Behavior:
 * 1. If QZ Tray enabled + connected → print via QZ Tray (silent)
 * 2. If QZ Tray enabled but NOT connected → show warning, offer retry or Chrome print
 * 3. If QZ Tray NOT enabled → use Chrome printing (current behavior)
 *
 * This hook wraps useReceipt and useQzPrint to provide smart printing.
 */
export const useReceiptWithQz = () => {
  const handlePrintError = useCallback((error: Error) => {
    console.error('[Receipt Print Error]', {
      message: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString(),
    })
  }, [])

  // Chrome print fallback
  const {
    ReceiptContent,
    printReceipt: chromePrintReceipt,
    isPrinting: isChromePrinting,
    retryPrint: chromeRetryPrint,
    canRetry: chromeCanRetry,
  } = useReceipt({
    onPrintError: handlePrintError,
  })

  // QZ Tray print
  const {
    printWithQzTray,
    isPrinting: isQzPrinting,
    isQzTrayEnabled,
    isQzTrayConnected,
    showConnectionWarning,
    selectedPrinter,
    retryPrint: qzRetryPrint,
  } = usePrintToQZTray({
    onPrintError: handlePrintError,
  })

  const isPrinting = isChromePrinting || isQzPrinting

  /**
   * Print a receipt with smart QZ Tray/Chrome fallback.
   * Returns true if print was attempted, false otherwise.
   */
  const printReceipt = useCallback(
    async (receiptSvg: string, orderDisplayId?: string | number): Promise<boolean> => {
      // If QZ Tray is not enabled, use Chrome print
      if (!isQzTrayEnabled) {
        try {
          chromePrintReceipt(receiptSvg)
          return true
        } catch (error) {
          console.error('[Receipt Print Error] Chrome print failed:', error)
          return false
        }
      }

      // If QZ Tray is enabled but not connected
      if (!isQzTrayConnected) {
        // Show warning toast with options
        toast.warning('Impressora desconectada', {
          description: orderDisplayId
            ? `O pedido #${orderDisplayId} foi salvo, mas a impressao automatica nao esta disponivel.`
            : 'A impressao automatica nao esta disponivel.',
          richColors: true,
          position: 'top-center',
          dismissible: true,
          closeButton: true,
          duration: 15000,
          action: {
            label: 'Imprimir manualmente',
            onClick: () => {
              try {
                chromePrintReceipt(receiptSvg)
              } catch (error) {
                console.error('[Receipt Print Error] Manual print failed:', error)
              }
            },
          },
        })
        return false
      }

      // QZ Tray is enabled and connected - print via QZ Tray
      try {
        const result = await printWithQzTray(receiptSvg)

        if (result.success) {
          return true
        }

        // QZ Tray print failed - offer Chrome fallback
        toast.error('Erro ao imprimir', {
          description: result.error || 'A impressao via QZ Tray falhou.',
          richColors: true,
          position: 'top-center',
          dismissible: true,
          closeButton: true,
          duration: 10000,
          action: {
            label: 'Imprimir manualmente',
            onClick: () => {
              try {
                chromePrintReceipt(receiptSvg)
              } catch (error) {
                console.error('[Receipt Print Error] Fallback print failed:', error)
              }
            },
          },
        })
        return false
      } catch (error) {
        console.error('[Receipt Print Error] QZ Tray print failed:', error)

        // Offer Chrome fallback
        toast.error('Erro ao imprimir', {
          description: error instanceof Error ? error.message : 'A impressao falhou.',
          richColors: true,
          position: 'top-center',
          dismissible: true,
          closeButton: true,
          duration: 10000,
          action: {
            label: 'Imprimir manualmente',
            onClick: () => {
              try {
                chromePrintReceipt(receiptSvg)
              } catch (e) {
                console.error('[Receipt Print Error] Fallback print failed:', e)
              }
            },
          },
        })
        return false
      }
    },
    [isQzTrayEnabled, isQzTrayConnected, chromePrintReceipt, printWithQzTray]
  )

  const retryPrint = useCallback(() => {
    if (isQzTrayEnabled && isQzTrayConnected) {
      return qzRetryPrint()
    }
    return chromeRetryPrint()
  }, [isQzTrayEnabled, isQzTrayConnected, qzRetryPrint, chromeRetryPrint])

  return {
    // For Chrome print fallback (hidden div for react-to-print)
    ReceiptContent,

    // Print function
    printReceipt,
    retryPrint,

    // State
    isPrinting,
    canRetry: isQzTrayEnabled ? true : chromeCanRetry,

    // QZ Tray info
    isQzTrayEnabled,
    isQzTrayConnected,
    showConnectionWarning,
    selectedPrinter,

    // Legacy Chrome print (for direct usage if needed)
    chromePrintReceipt,
  }
}
