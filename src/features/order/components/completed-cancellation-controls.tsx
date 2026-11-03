'use client'

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Ban, ClipboardCheck } from 'lucide-react'
import { toast } from 'sonner'
import {
  cancelCompletedOrder,
  confirmManualRefundReview,
  listOrderManualRefunds,
} from '../api'
import { ordersCacheKey } from '../cache-keys'
import { Button } from '@/shared/button'
import { Textarea } from '@/shared/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/dialog'

export function CompletedCancellationControls({
  storeId,
  orderId,
  status,
}: {
  storeId: number
  orderId: number
  status: string
}) {
  const client = useQueryClient()
  const [command, setCommand] = useState<{
    mode: 'cancel' | 'review'
    key: string
  } | null>(null)
  const [reason, setReason] = useState('')
  const refunds = useQuery({
    queryKey: ['order-manual-refunds', storeId, orderId],
    queryFn: () => listOrderManualRefunds({ storeId, orderId }),
    enabled: status === 'CANCELLED',
  })
  const record = refunds.data?.[0]
  const mutation = useMutation({
    mutationFn: async () => {
      if (!command) throw new Error('Comando ausente.')
      const action =
        command.mode === 'cancel'
          ? cancelCompletedOrder
          : confirmManualRefundReview
      return action({ storeId, orderId, reason, idempotencyKey: command.key })
    },
    onSuccess: async () => {
      setCommand(null)
      setReason('')
      await client.invalidateQueries({ queryKey: ordersCacheKey(storeId) })
      await client.invalidateQueries({
        queryKey: ['order-manual-refunds', storeId, orderId],
      })
      toast.success('Operacao registrada no historico do pedido.')
    },
    onError: error =>
      toast.error('Nao foi possivel registrar a operacao.', {
        description: error instanceof Error ? error.message : undefined,
      }),
  })
  const open = (mode: 'cancel' | 'review') => {
    setReason('')
    setCommand({ mode, key: crypto.randomUUID() })
  }
  return (
    <section className="border-b p-4 sm:p-6">
      <h3 className="mb-3 text-sm font-semibold">Cancelamento e conciliacao</h3>
      {status === 'COMPLETED' && (
        <Button
          type="button"
          variant="destructive"
          size="sm"
          onClick={() => open('cancel')}
        >
          <Ban className="size-4" />
          Cancelar pedido finalizado
        </Button>
      )}
      {status === 'CANCELLED' && (
        <>
          {refunds.isPending && (
            <p className="text-sm text-muted-foreground">
              Consultando conciliacao...
            </p>
          )}
          {refunds.isError && (
            <p role="alert" className="text-sm text-destructive">
              Nao foi possivel consultar a conciliacao.
            </p>
          )}
          {record && (
            <div className="space-y-3 text-sm">
              <p className="font-medium">
                {record.reviewStatus === 'manual_review_pending'
                  ? 'Conciliacao financeira pendente'
                  : record.reviewStatus === 'documented'
                    ? 'Conciliacao documentada'
                    : 'Sem pagamentos registrados'}
              </p>
              <p className="text-muted-foreground">{record.financialNotice}</p>
              <p>Nao houve reposicao automatica de estoque.</p>
              {record.reviewStatus === 'manual_review_pending' && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => open('review')}
                >
                  <ClipboardCheck className="size-4" />
                  Registrar conciliacao manual
                </Button>
              )}
              {record.confirmationReason && (
                <p className="whitespace-pre-wrap break-words">
                  {record.confirmationReason}
                </p>
              )}
            </div>
          )}
        </>
      )}
      <Dialog
        open={!!command}
        onOpenChange={value => {
          if (!value && !mutation.isPending) setCommand(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {command?.mode === 'cancel'
                ? 'Cancelar pedido finalizado'
                : 'Registrar conciliacao manual'}
            </DialogTitle>
            <DialogDescription>
              {command?.mode === 'cancel'
                ? 'Os beneficios serao ajustados. Pagamentos e caixa originais serao preservados. Nao havera devolucao automatica de dinheiro nem reposicao de estoque.'
                : 'Documente o que foi conferido e feito manualmente, incluindo valores e eventual retirada no caixa. Este registro nao executa nem comprova reembolso.'}
            </DialogDescription>
          </DialogHeader>
          <label className="space-y-2 text-sm font-medium">
            Motivo obrigatorio
            <Textarea
              value={reason}
              maxLength={1000}
              disabled={mutation.isPending}
              onChange={event => setReason(event.target.value)}
            />
          </label>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={mutation.isPending}
              onClick={() => setCommand(null)}
            >
              Voltar
            </Button>
            <Button
              type="button"
              variant={command?.mode === 'cancel' ? 'destructive' : 'default'}
              disabled={mutation.isPending || !reason.trim()}
              onClick={() => mutation.mutate()}
            >
              {mutation.isPending ? 'Registrando...' : 'Confirmar registro'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  )
}
