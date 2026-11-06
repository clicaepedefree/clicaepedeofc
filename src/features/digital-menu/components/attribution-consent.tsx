'use client'

import { Button } from '@/shared/button'
import { Check, X } from 'lucide-react'

export type AttributionConsentProps = {
  onAccept: () => void
  onDecline: () => void
  busy?: boolean
}

export function AttributionConsent({
  onAccept,
  onDecline,
  busy = false,
}: AttributionConsentProps) {
  return (
    <section
      aria-label="Consentimento de origem da visita"
      aria-busy={busy}
      className="flex min-w-0 flex-col gap-3 border-y py-4 text-foreground sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="min-w-0">
        <h2 className="text-sm font-medium">
          Compartilhar a origem desta visita com a loja?
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Sem telefone, IP ou rastreamento entre sites.
        </p>
      </div>
      <div className="flex shrink-0 flex-wrap gap-2">
        <Button onClick={onAccept} disabled={busy}>
          <Check aria-hidden="true" className="size-4" />
          Permitir
        </Button>
        <Button variant="outline" onClick={onDecline} disabled={busy}>
          <X aria-hidden="true" className="size-4" />
          Agora nao
        </Button>
      </div>
    </section>
  )
}
