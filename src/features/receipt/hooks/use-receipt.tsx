import { generateTestTemplate } from '@/features/receipt/api'
import { TestTemplateInput } from '@/features/receipt/templates/test'
import { ReceiptTemplateInput } from '@/features/receipt/types'
import { JSX, useEffect, useId, useRef, useState } from 'react'
import { useReactToPrint } from 'react-to-print'

export const useReceipt = <T extends ReceiptTemplateInput>() => {
  const receiptNonceId = useId()
  const receiptPrintableContentRef = useRef<HTMLDivElement>(null)
  const [receiptImage, setReceiptImage] = useState<JSX.Element | null>(null)

  const [isPrinting, setIsPrinting] = useState(false)

  const updateReceiptContent = async (data: T) => {
    const receiptSvg = await generateTestTemplate(
      data as unknown as TestTemplateInput
    )

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
    },
  })

  const printReceipt = (data: T) => {
    setIsPrinting(true)
    updateReceiptContent(data)
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
