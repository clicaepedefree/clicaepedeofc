'use client'

import { archiveStoreAction, reactivateStoreAction } from '@/features/internal-operations/actions'
import type { InternalStoreListItem } from '@/features/internal-operations/db'
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/shared/alert-dialog'
import { Badge } from '@/shared/badge'
import { Button } from '@/shared/button'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/shared/dialog'
import { Input } from '@/shared/input'
import { Label } from '@/shared/label'
import { cn } from '@/shared/lib/utils'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/table'
import { Textarea } from '@/shared/textarea'
import { Archive, History, RotateCcw } from 'lucide-react'
import Link from 'next/link'

type InternalStoresTableProps = {
  stores: SerializableInternalStoreListItem[]
  canReactivate: boolean
  canArchive: boolean
  canViewSensitiveAuditLogs: boolean
  returnTo: string
}

export type SerializableInternalStoreListItem = Omit<
  InternalStoreListItem,
  'statusUpdatedAt' | 'createdAt' | 'updatedAt' | 'admins'
> & {
  statusUpdatedAt: string
  createdAt: string
  updatedAt: string
  admins: Array<
    Omit<InternalStoreListItem['admins'][number], 'revokedAt'> & {
      revokedAt: string | null
    }
  >
}

const statusLabel: Record<InternalStoreListItem['status'], string> = {
  active: 'Ativa',
  inactive: 'Inativa',
  pending_recovery: 'Pendente',
  archived: 'Arquivada',
}

const statusClassName: Record<InternalStoreListItem['status'], string> = {
  active: 'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-200 dark:border-emerald-900',
  inactive: 'bg-muted text-muted-foreground border-border',
  pending_recovery: 'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-200 dark:border-amber-900',
  archived: 'bg-rose-100 text-rose-800 border-rose-200 dark:bg-rose-950/40 dark:text-rose-200 dark:border-rose-900',
}

const formatDateTime = (date: Date | string | null) => {
  if (!date) return '-'

  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(date))
}

const getPrimaryAdminEmail = (store: SerializableInternalStoreListItem) => {
  const activeAdmin = store.admins.find(admin => !admin.revokedAt)
  return activeAdmin?.email ?? store.admins[0]?.email ?? ''
}

export function InternalStoresTable({
  stores,
  canReactivate,
  canArchive,
  canViewSensitiveAuditLogs,
  returnTo,
}: InternalStoresTableProps) {
  if (stores.length === 0) {
    return (
      <div className="rounded-lg border border-dashed bg-card p-10 text-center text-sm text-muted-foreground">
        Nenhuma loja encontrada para os filtros atuais.
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/60 hover:bg-muted/60">
            <TableHead>Loja</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Administradores</TableHead>
            <TableHead>Atualizada</TableHead>
            <TableHead className="w-[220px] text-right">Acoes</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {stores.map(store => {
            const canStoreBeReactivated =
              store.status === 'pending_recovery' || store.status === 'inactive'
            const primaryAdminEmail = getPrimaryAdminEmail(store)

            return (
              <TableRow key={store.id} className="align-top">
                <TableCell>
                  <div className="space-y-1">
                    <div className="font-medium text-foreground">{store.name}</div>
                    <div className="text-xs text-muted-foreground">
                      #{store.id} - {store.subdomain}
                    </div>
                    {store.statusReason && (
                      <div className="max-w-[420px] text-xs text-muted-foreground">
                        Motivo: {store.statusReason}
                      </div>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <Badge
                    variant="outline"
                    className={cn('border', statusClassName[store.status])}
                  >
                    {statusLabel[store.status]}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="space-y-2">
                    {store.admins.length === 0 ? (
                      <span className="text-sm text-muted-foreground">Sem admin vinculado</span>
                    ) : (
                      store.admins.map(admin => (
                        <div key={`${store.id}-${admin.userId}`} className="text-sm">
                          <div className="font-medium text-foreground">{admin.email}</div>
                          <div className="text-xs text-muted-foreground">
                            {admin.name ?? 'Sem nome'} - {admin.userStatus}
                            {admin.revokedAt && (
                              <>
                                {' '}
                                - revogado em {formatDateTime(admin.revokedAt)}
                              </>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {formatDateTime(store.statusUpdatedAt)}
                </TableCell>
                <TableCell>
                  <div className="flex justify-end gap-2">
                    {canViewSensitiveAuditLogs && (
                      <Button asChild size="sm" variant="outline">
                        <Link href={`/internal/stores/${store.id}/audit`}>
                          <History className="size-4" />
                          Auditoria
                        </Link>
                      </Button>
                    )}

                    <Dialog>
                      <DialogTrigger asChild>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={!canReactivate || !canStoreBeReactivated}
                        >
                          <RotateCcw className="size-4" />
                          Reativar
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Reativar loja</DialogTitle>
                          <DialogDescription>
                            Vincule um usuario ativo como administrador e volte a loja para producao.
                          </DialogDescription>
                        </DialogHeader>
                        <form action={reactivateStoreAction} className="space-y-4">
                          <input type="hidden" name="storeId" value={store.id} />
                          <input type="hidden" name="returnTo" value={returnTo} />
                          <div className="rounded-md border bg-muted/60 p-3 text-sm">
                            <div className="font-medium text-foreground">{store.name}</div>
                            <div className="text-muted-foreground">{store.subdomain}</div>
                          </div>
                          <Label htmlFor={`adminEmail-${store.id}`} size="sm">
                            E-mail do novo administrador
                          </Label>
                          <Input
                            id={`adminEmail-${store.id}`}
                            name="adminEmail"
                            type="email"
                            defaultValue={primaryAdminEmail}
                            placeholder="admin@restaurante.com"
                            required
                          />
                          <Label htmlFor={`reason-reactivate-${store.id}`} size="sm">
                            Motivo da reativacao
                          </Label>
                          <Textarea
                            id={`reason-reactivate-${store.id}`}
                            name="reason"
                            placeholder="Ex.: cliente solicitou recuperacao apos validacao pelo suporte."
                            required
                          />
                          <DialogFooter>
                            <DialogClose asChild>
                              <Button type="button" variant="outline">Cancelar</Button>
                            </DialogClose>
                            <Button type="submit">
                              <RotateCcw className="size-4" />
                              Reativar loja
                            </Button>
                          </DialogFooter>
                        </form>
                      </DialogContent>
                    </Dialog>

                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          size="sm"
                          variant="destructive"
                          disabled={!canArchive || store.status === 'archived'}
                        >
                          <Archive className="size-4" />
                          Arquivar
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Arquivar loja</AlertDialogTitle>
                          <AlertDialogDescription>
                            Essa acao revoga acessos ativos e tira a loja da operacao.
                            Para confirmar, digite o subdominio da loja.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <form action={archiveStoreAction} className="space-y-4">
                          <input type="hidden" name="storeId" value={store.id} />
                          <input type="hidden" name="returnTo" value={returnTo} />
                          <div className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900 dark:border-rose-900/70 dark:bg-rose-950/30 dark:text-rose-100">
                            <strong>{store.name}</strong>
                            <div>{store.subdomain}</div>
                          </div>
                          <Label htmlFor={`confirmation-${store.id}`} size="sm">
                            Digite {store.subdomain}
                          </Label>
                          <Input
                            id={`confirmation-${store.id}`}
                            name="confirmation"
                            autoComplete="off"
                            required
                          />
                          <Label htmlFor={`reason-archive-${store.id}`} size="sm">
                            Motivo do arquivamento
                          </Label>
                          <Textarea
                            id={`reason-archive-${store.id}`}
                            name="reason"
                            placeholder="Ex.: cancelamento confirmado pelo responsavel comercial."
                            required
                          />
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <Button type="submit" variant="destructive">
                              <Archive className="size-4" />
                              Arquivar loja
                            </Button>
                          </AlertDialogFooter>
                        </form>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}
