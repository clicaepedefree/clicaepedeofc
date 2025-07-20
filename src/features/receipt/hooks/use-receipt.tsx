import { JSX, useEffect, useId, useRef, useState } from 'react'
import { useReactToPrint } from 'react-to-print'

export const useReceipt = (onPrintEndCallback?: () => void) => {
  const receiptNonceId = useId()
  const receiptPrintableContentRef = useRef<HTMLDivElement>(null)
  const [receiptImage, setReceiptImage] = useState<JSX.Element | null>(null)

  const [isPrinting, setIsPrinting] = useState(false)

  const updateReceiptContent = async (receiptSvg: string) => {
    const receiptImageComponent = receiptSvg ? (
      <img src={`data:image/svg+xml;utf8,${encodeURIComponent(receiptSvg)}`} />
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

  const runReceiptPrinting = useReactToPrint({
    contentRef: receiptPrintableContentRef,
    nonce: receiptNonceId,
    onAfterPrint: () => {
      setIsPrinting(false)
      onPrintEndCallback?.()
    },
  })

  const printReceipt = (receiptSvg: string) => {
    setIsPrinting(true)
    updateReceiptContent(receiptSvg)
  }

  useEffect(() => {
    if (!receiptImage || !isPrinting) return

    runReceiptPrinting()
  }, [receiptImage])

  return {
    ReceiptContent,
    printReceipt,
    isPrinting,
  }
}
