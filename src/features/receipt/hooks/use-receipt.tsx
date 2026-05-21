import { JSX, useCallback, useEffect, useId, useRef, useState } from 'react'
import { useReactToPrint } from 'react-to-print'

type UseReceiptOptions = {
  onPrintEnd?: () => void
  onPrintError?: (error: Error) => void
}

export const useReceipt = (options?: UseReceiptOptions) => {
  const { onPrintEnd, onPrintError } = options ?? {}
  const receiptNonceId = useId()
  const receiptPrintableContentRef = useRef<HTMLDivElement>(null)
  const [receiptImage, setReceiptImage] = useState<JSX.Element | null>(null)
  const [lastReceiptSvg, setLastReceiptSvg] = useState<string | null>(null)
  const [printError, setPrintError] = useState<Error | null>(null)

  const [isPrinting, setIsPrinting] = useState(false)

  const updateReceiptContent = async (receiptSvg: string) => {
    const receiptImageComponent = receiptSvg ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={`data:image/svg+xml;utf8,${encodeURIComponent(receiptSvg)}`}
        alt=""
      />
    ) : null

    setReceiptImage(receiptImageComponent)
  }

  const ReceiptContent = (
    <div
      className="hidden w-0 h-0 print:block print:w-auto print:h-auto"
      ref={receiptPrintableContentRef}
    >
      {receiptImage}
    </div>
  )

  const handlePrintError = useCallback(
    (errorLocation: 'onBeforePrint' | 'print', error: Error) => {
      console.error(`[Receipt Print Error] Location: ${errorLocation}`, error)
      setIsPrinting(false)
      setPrintError(error)
      onPrintError?.(error)
    },
    [onPrintError]
  )

  const runReceiptPrinting = useReactToPrint({
    contentRef: receiptPrintableContentRef,
    nonce: receiptNonceId,
    onAfterPrint: () => {
      setIsPrinting(false)
      setPrintError(null)
      onPrintEnd?.()
    },
    onPrintError: handlePrintError,
  })

  const printReceipt = useCallback((receiptSvg: string) => {
    setIsPrinting(true)
    setPrintError(null)
    setLastReceiptSvg(receiptSvg)
    updateReceiptContent(receiptSvg)
  }, [])

  const retryPrint = useCallback(() => {
    if (lastReceiptSvg) {
      setPrintError(null)
      setIsPrinting(true)
      updateReceiptContent(lastReceiptSvg)
    }
  }, [lastReceiptSvg])

  const clearError = useCallback(() => {
    setPrintError(null)
  }, [])

  useEffect(() => {
    if (!receiptImage || !isPrinting) return

    try {
      runReceiptPrinting()
    } catch (error) {
      handlePrintError('print', error instanceof Error ? error : new Error(String(error)))
    }
  }, [receiptImage, isPrinting, runReceiptPrinting, handlePrintError])

  return {
    ReceiptContent,
    printReceipt,
    isPrinting,
    printError,
    retryPrint,
    clearError,
    canRetry: !!lastReceiptSvg,
  }
}
