'use client'

import {
  activateStoreAfterImplementationAction,
  archiveStoreAction,
  reactivateStoreAction,
  resendStoreAccessInviteAction,
  updateStoreImplementationChecklistItemAction,
} from '@/features/internal-operations/actions'
import type { InternalStoreListItem } from '@/features/internal-operations/db'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/shared/alert-dialog'
import { Badge } from '@/shared/badge'
import { Button } from '@/shared/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/shared/dialog'
import { Input } from '@/shared/input'
import { Label } from '@/shared/label'
import { cn } from '@/shared/lib/utils'
import { Progress } from '@/shared/progress'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/shared/table'
import { Textarea } from '@/shared/textarea'
import {
  Archive,
  CheckCircle2,
  ClipboardCheck,
  Copy,
  Eye,
  LockKeyhole,
  Loader2,
  Rocket,
  RotateCcw,
  Send,
} from 'lucide-react'
import Link from 'next/link'
import { useState, useTransition } from 'react'

type InternalStoresTableProps = {
  stores: SerializableInternalStoreListItem[]
  personalDataMasked: boolean
  canReactivate: boolean
  canArchive: boolean
  canCreateStore: boolean
  canManageImplementationChecklist: boolean
  canActivateImplementedStore: boolean
  returnTo: string
}

export type SerializableInternalStoreListItem = Omit<
  InternalStoreListItem,
  | 'statusUpdatedAt'
  | 'createdAt'
  | 'updatedAt'
  | 'admins'
  | 'billing'
  | 'implementationChecklist'
> & {
  statusUpdatedAt: string
  createdAt: string
  updatedAt: string
  billing: Omit<InternalStoreListItem['billing'], 'nextBillingAt'> & {
    nextBillingAt: string | null
  }
  implementationChecklist: {
    progress: InternalStoreListItem['implementationChecklist']['progress']
    items: Array<
      Omit<
        InternalStoreListItem['implementationChecklist']['items'][number],
        'completedAt' | 'updatedAt'
      > & {
        completedAt: string | null
        updatedAt: string
      }
    >
  }
  admins: Array<
    Omit<InternalStoreListItem['admins'][number], 'revokedAt'> & {
      revokedAt: string | null
    }
  >
}

const statusLabel: Record<InternalStoreListItem['status'], string> = {
  implementing: 'Em implantacao',
  active: 'Ativa',
  inactive: 'Inativa',
  pending_recovery: 'Pendente',
  archived: 'Arquivada',
}

const statusClassName: Record<InternalStoreListItem['status'], string> = {
  implementing:
    'bg-sky-100 text-sky-800 border-sky-200 dark:bg-sky-950/40 dark:text-sky-200 dark:border-sky-900',
  active:
    'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-200 dark:border-emerald-900',
  inactive: 'bg-muted text-muted-foreground border-border',
  pending_recovery:
    'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-200 dark:border-amber-900',
  archived:
    'bg-rose-100 text-rose-800 border-rose-200 dark:bg-rose-950/40 dark:text-rose-200 dark:border-rose-900',
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

const formatDate = (date: Date | string | null) => {
  if (!date) return '-'

  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(date))
}

const formatCurrency = (value: string | null, currency: string | null) => {
  if (!value) return '-'

  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: currency ?? 'BRL',
  }).format(Number(value))
}

const getPrimaryAdminEmail = (store: SerializableInternalStoreListItem) => {
  const activeAdmin =
    store.admins.find(admin => !admin.revokedAt && admin.isPrimaryResponsible) ??
    store.admins.find(admin => !admin.revokedAt)
  return activeAdmin?.email ?? store.admins[0]?.email ?? ''
}

const getResponsible = (store: SerializableInternalStoreListItem) => {
  const primaryAdmin =
    store.admins.find(admin => !admin.revokedAt && admin.isPrimaryResponsible) ??
    store.admins.find(admin => !admin.revokedAt)

  return {
    name: store.company.responsibleName ?? primaryAdmin?.name ?? 'Sem nome',
    email: store.company.responsibleEmail ?? primaryAdmin?.email ?? '',
    phone: store.company.responsiblePhone ?? primaryAdmin?.phone ?? '',
  }
}

export function InternalStoresTable({
  stores,
  personalDataMasked,
  canReactivate,
  canArchive,
  canCreateStore,
  canManageImplementationChecklist,
  canActivateImplementedStore,
  returnTo,
}: InternalStoresTableProps) {
  const [isInvitePending, startInviteTransition] = useTransition()
  const [inviteResult, setInviteResult] = useState<{
    storeId: number
    inviteUrl: string
    targetEmail: string
    expiresAt: string
  } | null>(null)
  const [inviteError, setInviteError] = useState<string | null>(null)

  if (stores.length === 0) {
    return (
      <div className="rounded-lg border border-dashed bg-card p-10 text-center text-sm text-muted-foreground">
        Nenhuma loja encontrada para os filtros atuais.
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      {personalDataMasked && (
        <div className="flex items-center gap-2 border-b bg-muted/40 px-4 py-3 text-xs text-muted-foreground">
          <LockKeyhole className="size-4 text-primary" />
          Dados pessoais aparecem mascarados conforme a permissao do seu perfil.
        </div>
      )}
      <div className="overflow-x-auto">
        <Table className="min-w-[1180px]">
          <TableHeader>
            <TableRow className="bg-muted/60 hover:bg-muted/60">
              <TableHead>Loja</TableHead>
              <TableHead>Responsavel</TableHead>
              <TableHead>Cadastro</TableHead>
              <TableHead>Plano</TableHead>
              <TableHead>Valor</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Vencimento</TableHead>
              <TableHead className="w-[220px] text-right">Acoes</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {stores.map(store => {
              const canStoreBeReactivated =
                store.status === 'pending_recovery' ||
                store.status === 'inactive'
              const primaryAdminEmail = getPrimaryAdminEmail(store)
              const responsible = getResponsible(store)
              const canInviteResponsible =
                canCreateStore &&
                store.status !== 'archived' &&
                primaryAdminEmail.length > 0
              const checklistProgress = store.implementationChecklist.progress
              const canActivateFromChecklist =
                canActivateImplementedStore &&
                store.status === 'implementing' &&
                checklistProgress.canActivate

              return (
                <TableRow key={store.id} className="align-top">
                  <TableCell>
                    <div className="min-w-[220px] space-y-1">
                      <div className="font-medium text-foreground">
                        {store.name}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        #{store.id} - {store.subdomain}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {store.company.city
                          ? `${store.company.city}${store.company.stateCode ? `/${store.company.stateCode}` : ''}`
                          : 'Cidade nao informada'}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {store.company.companyTaxNumber}
                        {store.company.companyPhone
                          ? ` - ${store.company.companyPhone}`
                          : ''}
                      </div>
                      {store.statusReason && (
                        <div className="max-w-[260px] text-xs text-muted-foreground">
                          Motivo: {store.statusReason}
                        </div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="min-w-[220px] space-y-1 text-sm">
                      <div className="font-medium text-foreground">
                        {responsible.name}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {responsible.email || 'E-mail nao informado'}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {responsible.phone || 'Telefone nao informado'} -{' '}
                        {store.company.responsibleTaxNumber}
                      </div>
                      <div className="space-y-1 pt-1">
                        {store.admins.length === 0 ? (
                          <span className="text-xs text-muted-foreground">
                            Sem admin vinculado
                          </span>
                        ) : (
                          store.admins.slice(0, 2).map(admin => (
                            <div
                              key={`${store.id}-${admin.userId}`}
                              className="text-xs text-muted-foreground"
                            >
                              {admin.email} - {admin.userStatus}
                              {admin.revokedAt && (
                                <> - revogado em {formatDate(admin.revokedAt)}</>
                              )}
                            </div>
                          ))
                        )}
                        {store.admins.length > 2 && (
                          <div className="text-xs text-muted-foreground">
                            +{store.admins.length - 2} admins
                          </div>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="min-w-[130px] text-sm text-muted-foreground">
                    <div>{formatDate(store.createdAt)}</div>
                    <div className="text-xs">
                      Atualizada {formatDate(store.updatedAt)}
                    </div>
                  </TableCell>
                  <TableCell className="min-w-[150px] text-sm">
                    <div className="font-medium text-foreground">
                      {store.billing.planName ?? 'Sem plano'}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {store.billing.planCode ?? 'Plano nao definido'}
                    </div>
                  </TableCell>
                  <TableCell className="min-w-[110px] text-sm font-medium text-foreground">
                    {formatCurrency(
                      store.billing.contractedAmount,
                      store.billing.currency
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="min-w-[170px] space-y-2">
                      <Badge
                        variant="outline"
                        className={cn('border', statusClassName[store.status])}
                      >
                        {statusLabel[store.status]}
                      </Badge>
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span>Implantacao</span>
                          <span>
                            {checklistProgress.completed}/
                            {checklistProgress.total}
                          </span>
                        </div>
                        <Progress value={checklistProgress.percent} />
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="min-w-[130px] text-sm text-muted-foreground">
                    <div>{formatDate(store.billing.nextBillingAt)}</div>
                    <div className="text-xs">
                      {store.billing.subscriptionStatus ?? 'sem assinatura'}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap justify-end gap-2">
                      <Button asChild size="sm" variant="outline" isClickable>
                        <Link href={`/internal/stores/${store.id}`}>
                          <Eye className="size-4" />
                          Abrir
                        </Link>
                      </Button>
                    <Dialog>
                      <DialogTrigger asChild>
                        <Button size="sm" variant="outline">
                          <ClipboardCheck className="size-4" />
                          Implantacao
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="max-w-3xl">
                        <DialogHeader>
                          <DialogTitle>Checklist de implantacao</DialogTitle>
                          <DialogDescription>
                            Controle a passagem da loja de implantacao para
                            ativa sem alterar cobranca ou acessos.
                          </DialogDescription>
                        </DialogHeader>

                        <div className="space-y-4">
                          <div className="rounded-lg border bg-muted/40 p-4">
                            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                              <div>
                                <div className="font-medium text-foreground">
                                  {store.name}
                                </div>
                                <div className="text-sm text-muted-foreground">
                                  {store.subdomain} -{' '}
                                  {statusLabel[store.status]}
                                </div>
                              </div>
                              <div className="min-w-[180px] space-y-1">
                                <div className="flex justify-between text-xs text-muted-foreground">
                                  <span>Progresso</span>
                                  <span>{checklistProgress.percent}%</span>
                                </div>
                                <Progress value={checklistProgress.percent} />
                              </div>
                            </div>
                          </div>

                          <div className="space-y-3">
                            {store.implementationChecklist.items.map(item => (
                              <form
                                key={item.itemKey}
                                action={
                                  updateStoreImplementationChecklistItemAction
                                }
                                className="rounded-lg border bg-card p-4"
                              >
                                <input
                                  type="hidden"
                                  name="storeId"
                                  value={store.id}
                                />
                                <input
                                  type="hidden"
                                  name="itemKey"
                                  value={item.itemKey}
                                />
                                <input
                                  type="hidden"
                                  name="returnTo"
                                  value={returnTo}
                                />
                                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                                  <label className="flex gap-3 text-sm">
                                    <input
                                      type="checkbox"
                                      name="completed"
                                      defaultChecked={
                                        item.status === 'completed'
                                      }
                                      disabled={
                                        !canManageImplementationChecklist ||
                                        store.status === 'archived'
                                      }
                                      className="mt-1 size-4 rounded border-border accent-primary"
                                    />
                                    <span>
                                      <span className="block font-medium text-foreground">
                                        {item.title}
                                      </span>
                                      <span className="mt-1 block text-xs text-muted-foreground">
                                        {item.status === 'completed'
                                          ? `Concluido por ${item.completedByEmail ?? 'operador'} em ${formatDateTime(item.completedAt)}`
                                          : 'Pendente de validacao'}
                                      </span>
                                    </span>
                                  </label>
                                  {item.status === 'completed' && (
                                    <Badge
                                      variant="outline"
                                      className="border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200"
                                    >
                                      <CheckCircle2 className="size-3" />
                                      Auditado
                                    </Badge>
                                  )}
                                </div>
                                <div className="mt-3 flex flex-col gap-2 md:flex-row">
                                  <Input
                                    name="observation"
                                    defaultValue={item.observation ?? ''}
                                    placeholder="Observacao do responsavel"
                                    disabled={
                                      !canManageImplementationChecklist ||
                                      store.status === 'archived'
                                    }
                                    containerClassName="flex-1"
                                  />
                                  <Button
                                    type="submit"
                                    variant="outline"
                                    disabled={
                                      !canManageImplementationChecklist ||
                                      store.status === 'archived'
                                    }
                                  >
                                    Salvar item
                                  </Button>
                                </div>
                              </form>
                            ))}
                          </div>

                          <form
                            action={activateStoreAfterImplementationAction}
                            className="rounded-lg border border-sky-200 bg-sky-50 p-4 dark:border-sky-900/70 dark:bg-sky-950/25"
                          >
                            <input
                              type="hidden"
                              name="storeId"
                              value={store.id}
                            />
                            <input
                              type="hidden"
                              name="returnTo"
                              value={returnTo}
                            />
                            <div className="space-y-3">
                              <div>
                                <div className="font-medium text-sky-950 dark:text-sky-100">
                                  Ativacao comercial
                                </div>
                                <p className="mt-1 text-sm text-sky-800 dark:text-sky-200">
                                  Disponivel apenas quando todos os itens
                                  obrigatorios estiverem concluidos.
                                </p>
                              </div>
                              <Textarea
                                name="reason"
                                placeholder="Ex.: implantacao validada com pedido teste e treinamento concluido."
                                disabled={!canActivateFromChecklist}
                                required
                              />
                              <Button
                                type="submit"
                                disabled={!canActivateFromChecklist}
                              >
                                <Rocket className="size-4" />
                                Ativar loja
                              </Button>
                            </div>
                          </form>
                        </div>
                      </DialogContent>
                    </Dialog>

                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!canInviteResponsible || isInvitePending}
                      onClick={() => {
                        setInviteError(null)
                        setInviteResult(null)
                        startInviteTransition(async () => {
                          const result = await resendStoreAccessInviteAction({
                            storeId: store.id,
                            targetEmail: primaryAdminEmail,
                          })

                          if (!result.success) {
                            setInviteError(result.error)
                            return
                          }

                          setInviteResult({
                            storeId: store.id,
                            inviteUrl: result.inviteUrl,
                            targetEmail: result.targetEmail,
                            expiresAt: result.expiresAt,
                          })
                        })
                      }}
                    >
                      {isInvitePending ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Send className="size-4" />
                      )}
                      Reenviar convite
                    </Button>
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
                            Vincule um usuario ativo como administrador e volte
                            a loja para producao.
                          </DialogDescription>
                        </DialogHeader>
                        <form
                          action={reactivateStoreAction}
                          className="space-y-4"
                        >
                          <input
                            type="hidden"
                            name="storeId"
                            value={store.id}
                          />
                          <input
                            type="hidden"
                            name="returnTo"
                            value={returnTo}
                          />
                          <div className="rounded-md border bg-muted/60 p-3 text-sm">
                            <div className="font-medium text-foreground">
                              {store.name}
                            </div>
                            <div className="text-muted-foreground">
                              {store.subdomain}
                            </div>
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
                          <Label
                            htmlFor={`reason-reactivate-${store.id}`}
                            size="sm"
                          >
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
                              <Button type="button" variant="outline">
                                Cancelar
                              </Button>
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
                            Essa acao revoga acessos ativos e tira a loja da
                            operacao. Para confirmar, digite o subdominio da
                            loja.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <form action={archiveStoreAction} className="space-y-4">
                          <input
                            type="hidden"
                            name="storeId"
                            value={store.id}
                          />
                          <input
                            type="hidden"
                            name="returnTo"
                            value={returnTo}
                          />
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
                          <Label
                            htmlFor={`reason-archive-${store.id}`}
                            size="sm"
                          >
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

      <Dialog
        open={!!inviteResult || !!inviteError}
        onOpenChange={open => {
          if (!open) {
            setInviteResult(null)
            setInviteError(null)
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {inviteResult ? 'Convite seguro gerado' : 'Convite nao gerado'}
            </DialogTitle>
            <DialogDescription>
              {inviteResult
                ? 'Envie este link para o responsavel. Convites anteriores pendentes para esta loja e e-mail foram invalidados.'
                : 'Revise os dados da loja e tente novamente.'}
            </DialogDescription>
          </DialogHeader>
          {inviteResult ? (
            <div className="space-y-3">
              <div className="rounded-md border bg-muted/50 p-3 text-sm">
                <div className="font-medium text-foreground">
                  {inviteResult.targetEmail}
                </div>
                <div className="text-xs text-muted-foreground">
                  Expira em {formatDateTime(inviteResult.expiresAt)}
                </div>
              </div>
              <p className="break-all rounded-md border bg-background p-3 font-mono text-xs text-foreground">
                {inviteResult.inviteUrl}
              </p>
            </div>
          ) : (
            <div className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800 dark:border-rose-900/70 dark:bg-rose-950/30 dark:text-rose-200">
              {inviteError}
            </div>
          )}
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Fechar
              </Button>
            </DialogClose>
            {inviteResult && (
              <Button
                type="button"
                onClick={() =>
                  navigator.clipboard?.writeText(inviteResult.inviteUrl)
                }
              >
                <Copy className="size-4" />
                Copiar link
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
