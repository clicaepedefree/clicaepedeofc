'use client'

import { Button } from '@/shared/button'
import { CheckCircle2, Copy } from 'lucide-react'
import { useState } from 'react'

type CopyInvoicePaymentLinkButtonProps = {
  paymentLink: string | null
  disabled?: boolean
  disabledReason?: string
}

export function CopyInvoicePaymentLinkButton({
  paymentLink,
  disabled = false,
  disabledReason = 'Link indisponivel para esta fatura.',
}: CopyInvoicePaymentLinkButtonProps) {
  const [copied, setCopied] = useState(false)
  const isDisabled = disabled || !paymentLink

  async function copyPaymentLink() {
    if (!paymentLink || isDisabled) return

    await navigator.clipboard.writeText(paymentLink)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1800)
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      isClickable={!isDisabled}
      disabled={isDisabled}
      title={isDisabled ? disabledReason : 'Copiar link de pagamento'}
      onClick={copyPaymentLink}
    >
      {copied ? (
        <CheckCircle2 className="size-4 text-emerald-500" />
      ) : (
        <Copy className="size-4" />
      )}
      {copied ? 'Copiado' : 'Copiar link'}
    </Button>
  )
}
