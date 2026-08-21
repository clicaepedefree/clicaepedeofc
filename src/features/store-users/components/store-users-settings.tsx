'use client'

import { useStoreUsers } from '@/features/store-users/use-store-users'
import type {
  StorePendingInvite,
  StoreUserListItem,
  StoreUsersStatusFilter,
} from '@/features/store-users/api'
import {
  getStoreUserRoleOption,
  storeUserRoleOptions,
  type StoreUserRole,
} from '@/features/store-users/store-users-policy'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/shared/alert-dialog'
import { Badge } from '@/shared/badge'
import { SettingsCategoryBlock } from '@/shared/blocks/settings-category-block'
import { Button } from '@/shared/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/dialog'
import { Input } from '@/shared/input'
import { cn } from '@/shared/lib/utils'
import { Switch } from '@/shared/switch'
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
  ChevronLeft,
  ChevronRight,
  Copy,
  KeyRound,
  LockKeyhole,
  LockKeyholeOpen,
  Mail,
  Pencil,
  RefreshCw,
  Search,
  ShieldCheck,
  UserMinus,
  UserPlus,
  Users,
  XCircle,
} from 'lucide-react'
import { useEffect, useState } from 'react'

const statusOptions: Array<{ value: StoreUsersStatusFilter; label: string }> = [
  { value: 'all', label: 'Todos' },
  { value: 'active', label: 'Ativos' },
  { value: 'blocked', label: 'Bloqueados' },
  { value: 'revoked', label: 'Desvinculados' },
  { value: 'deleted', label: 'Contas deletadas' },
]

const accessStatusLabels: Record<StoreUserListItem['accessStatus'], string> = {
  active: 'Ativo',
  blocked: 'Bloqueado',
  revoked: 'Desvinculado',
  deleted: 'Conta deletada',
}

const accessStatusClassNames: Record<
  StoreUserListItem['accessStatus'],
  string
> = {
  active:
    'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  blocked:
    'border-orange-500/40 bg-orange-500/10 text-orange-700 dark:text-orange-300',
  revoked: 'border-muted-foreground/30 bg-muted text-muted-foreground',
  deleted: 'border-destructive/40 bg-destructive/10 text-destructive',
}

const formatDateTime = (value: Date | string | null) => {
  if (!value) return '-'

  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value))
}

export function StoreUsersSettings() {
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<StoreUsersStatusFilter>('all')
  const [role, setRole] = useState<StoreUserRole | 'all'>('all')
  const [inviteOpen, setInviteOpen] = useState(false)
  const [inviteResult, setInviteResult] = useState<{
    inviteUrl: string
    targetEmail: string
  } | null>(null)
  const [generatedAccessLink, setGeneratedAccessLink] = useState<{
    title: string
    description: string
    url: string
    targetEmail: string
    warning: string
  } | null>(null)
  const [editingUser, setEditingUser] = useState<StoreUserListItem | null>(null)
  const [blockingUser, setBlockingUser] = useState<StoreUserListItem | null>(
    null
  )
  const [unblockingUser, setUnblockingUser] =
    useState<StoreUserListItem | null>(null)
  const [revokingUser, setRevokingUser] = useState<StoreUserListItem | null>(
    null
  )
  const [revokingInvite, setRevokingInvite] =
    useState<StorePendingInvite | null>(null)
  const [resendingInviteId, setResendingInviteId] = useState<number | null>(
    null
  )
  const [resettingUserId, setResettingUserId] = useState<string | null>(null)

  const {
    selectedStoreId,
    data,
    isLoading,
    inviteUser,
    resendInvite,
    updateUser,
    blockUser,
    unblockUser,
    revokeUser,
    revokeInvite,
    requestPasswordReset,
    isInvitingUser,
    isResendingInvite,
    isUpdatingUser,
    isBlockingUser,
    isUnblockingUser,
    isRevokingUser,
    isRevokingInvite,
    isRequestingPasswordReset,
  } = useStoreUsers({ page, search, status, role })

  const users = data?.users ?? []
  const pendingInvites = data?.pendingInvites ?? []
  const pagination = data?.pagination
  const handleSearchChange = (value: string) => {
    setSearch(value)
    setPage(1)
  }

  const handleStatusChange = (value: StoreUsersStatusFilter) => {
    setStatus(value)
    setPage(1)
  }

  const handleRoleChange = (value: StoreUserRole | 'all') => {
    setRole(value)
    setPage(1)
  }

  if (!selectedStoreId) {
    return (
      <SettingsCategoryBlock
        title="Equipe e perfis"
        contentClassName="grid-cols-1"
      >
        <EmptyState
          title="Selecione uma loja"
          description="Escolha uma loja no topo do painel para gerenciar os acessos vinculados a ela."
        />
      </SettingsCategoryBlock>
    )
  }

  return (
    <div className="space-y-4">
      <SettingsCategoryBlock
        title="Equipe e perfis"
        contentClassName="grid-cols-1"
      >
        <div className="flex flex-col gap-4">
          <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-center">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <Users className="size-4 text-primary" aria-hidden="true" />
                Acessos vinculados
              </div>
              <p className="text-sm text-muted-foreground">
                Convide, edite e desvincule usuários conforme o perfil de
                acesso.
              </p>
            </div>
            <Button onClick={() => setInviteOpen(true)}>
              <UserPlus className="size-4" aria-hidden="true" />
              Convidar usuário
            </Button>
          </div>

          <div className="grid gap-3 lg:grid-cols-[1fr_220px_220px]">
            <label className="relative block">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Buscar por nome, e-mail ou telefone"
                value={search}
                onChange={event => handleSearchChange(event.target.value)}
              />
            </label>
            <select
              className="h-9 rounded border border-input bg-background px-3 text-sm text-foreground shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-primary/20 dark:bg-input/30"
              value={status}
              onChange={event =>
                handleStatusChange(event.target.value as StoreUsersStatusFilter)
              }
            >
              {statusOptions.map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <select
              className="h-9 rounded border border-input bg-background px-3 text-sm text-foreground shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-primary/20 dark:bg-input/30"
              value={role}
              onChange={event =>
                handleRoleChange(event.target.value as StoreUserRole | 'all')
              }
            >
              <option value="all">Todos os perfis</option>
              {storeUserRoleOptions.map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          {pendingInvites.length > 0 && (
            <PendingInvitesList
              invites={pendingInvites}
              resendingInviteId={resendingInviteId}
              isResending={isResendingInvite}
              onResend={async invite => {
                setResendingInviteId(invite.id)
                try {
                  const result = await resendInvite({ inviteId: invite.id })
                  setGeneratedAccessLink({
                    title: 'Convite reenviado',
                    description: `Novo convite gerado para ${result.targetEmail}.`,
                    url: result.inviteUrl,
                    targetEmail: result.targetEmail,
                    warning:
                      'O link anterior foi invalidado. Envie apenas este novo link.',
                  })
                } finally {
                  setResendingInviteId(null)
                }
              }}
              onRevoke={setRevokingInvite}
            />
          )}

          <div className="overflow-hidden rounded-lg border bg-card">
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead>Usuário</TableHead>
                  <TableHead>Perfil</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Último acesso</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading && (
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      className="py-8 text-center text-muted-foreground"
                    >
                      Carregando usuários...
                    </TableCell>
                  </TableRow>
                )}

                {!isLoading && users.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="p-0">
                      <EmptyState
                        title="Nenhum usuário encontrado"
                        description="Ajuste os filtros ou convide um novo usuário para esta loja."
                      />
                    </TableCell>
                  </TableRow>
                )}

                {!isLoading &&
                  users.map(user => (
                    <TableRow key={user.userId} className="align-top">
                      <TableCell className="min-w-[280px] whitespace-normal">
                        <div className="font-medium text-foreground">
                          {user.name || user.email}
                        </div>
                        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                          <span className="inline-flex items-center gap-1">
                            <Mail className="size-3" aria-hidden="true" />
                            {user.email}
                          </span>
                          {user.phone && <span>{user.phone}</span>}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-2">
                          <RoleBadge role={user.role} />
                          {user.isPrimaryResponsible && (
                            <Badge className="bg-primary/10 text-primary hover:bg-primary/10">
                              <ShieldCheck
                                className="size-3"
                                aria-hidden="true"
                              />
                              Responsável
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={accessStatusClassNames[user.accessStatus]}
                        >
                          {accessStatusLabels[user.accessStatus]}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDateTime(user.lastLoginAt)}
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={user.accessStatus !== 'active'}
                            isLoading={
                              resettingUserId === user.userId &&
                              isRequestingPasswordReset
                            }
                            onClick={async () => {
                              setResettingUserId(user.userId)
                              try {
                                const result = await requestPasswordReset({
                                  userId: user.userId,
                                })
                                setGeneratedAccessLink({
                                  title: 'Link de redefinição criado',
                                  description: `Link temporario gerado para ${result.targetEmail}.`,
                                  url: result.resetUrl,
                                  targetEmail: result.targetEmail,
                                  warning:
                                    'A senha nunca fica visivel para a loja. Este link e temporario, de uso unico e deve ser enviado apenas para a pessoa dona da conta.',
                                })
                              } finally {
                                setResettingUserId(null)
                              }
                            }}
                          >
                            <KeyRound className="size-4" aria-hidden="true" />
                            Enviar redefinição
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={user.accessStatus !== 'active'}
                            onClick={() => setEditingUser(user)}
                          >
                            <Pencil className="size-4" aria-hidden="true" />
                            Editar
                          </Button>
                          {user.accessStatus === 'blocked' ? (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setUnblockingUser(user)}
                            >
                              <LockKeyholeOpen
                                className="size-4"
                                aria-hidden="true"
                              />
                              Desbloquear
                            </Button>
                          ) : (
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={user.accessStatus !== 'active'}
                              onClick={() => setBlockingUser(user)}
                            >
                              <LockKeyhole
                                className="size-4"
                                aria-hidden="true"
                              />
                              Bloquear
                            </Button>
                          )}
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={user.accessStatus !== 'active'}
                            onClick={() => setRevokingUser(user)}
                          >
                            <UserMinus className="size-4" aria-hidden="true" />
                            Desvincular
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </div>

          {pagination && (
            <div className="flex flex-col gap-2 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
              <span>
                Página {pagination.page} de {pagination.pageCount} ·{' '}
                {pagination.total} usuário(s)
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={pagination.page <= 1}
                  onClick={() => setPage(current => Math.max(1, current - 1))}
                >
                  <ChevronLeft className="size-4" aria-hidden="true" />
                  Anterior
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={pagination.page >= pagination.pageCount}
                  onClick={() => setPage(current => current + 1)}
                >
                  Próxima
                  <ChevronRight className="size-4" aria-hidden="true" />
                </Button>
              </div>
            </div>
          )}
        </div>
      </SettingsCategoryBlock>

      <InviteUserDialog
        open={inviteOpen}
        busy={isInvitingUser}
        inviteResult={inviteResult}
        onOpenChange={open => {
          setInviteOpen(open)
          if (!open) setInviteResult(null)
        }}
        onSubmit={async values => {
          const result = await inviteUser(values)
          setInviteResult({
            inviteUrl: result.inviteUrl,
            targetEmail: result.targetEmail,
          })
        }}
      />

      <EditUserDialog
        user={editingUser}
        busy={isUpdatingUser}
        onOpenChange={open => !open && setEditingUser(null)}
        onSubmit={async values => {
          if (!editingUser) return
          await updateUser({ userId: editingUser.userId, ...values })
          setEditingUser(null)
        }}
      />

      <RevokeAccessDialog
        title="Desbloquear acesso"
        description={
          unblockingUser
            ? `Informe o motivo para restaurar o acesso de ${unblockingUser.email}.`
            : ''
        }
        open={!!unblockingUser}
        busy={isUnblockingUser}
        confirmLabel="Desbloquear"
        confirmVariant="default"
        onOpenChange={open => !open && setUnblockingUser(null)}
        onConfirm={async reason => {
          if (!unblockingUser) return
          await unblockUser({ userId: unblockingUser.userId, reason })
          setUnblockingUser(null)
        }}
      />

      <BlockAccessDialog
        user={blockingUser}
        busy={isBlockingUser}
        onOpenChange={open => !open && setBlockingUser(null)}
        onConfirm={async values => {
          if (!blockingUser) return
          await blockUser({ userId: blockingUser.userId, ...values })
          setBlockingUser(null)
        }}
      />

      <RevokeAccessDialog
        title="Desvincular usuário"
        description={
          revokingUser
            ? `Informe o motivo para remover o acesso de ${revokingUser.email}. Para voltar, sera necessario criar um novo convite.`
            : ''
        }
        open={!!revokingUser}
        busy={isRevokingUser}
        confirmLabel="Desvincular"
        onOpenChange={open => !open && setRevokingUser(null)}
        onConfirm={async reason => {
          if (!revokingUser) return
          await revokeUser({ userId: revokingUser.userId, reason })
          setRevokingUser(null)
        }}
      />

      <RevokeAccessDialog
        title="Cancelar convite"
        description={
          revokingInvite
            ? `Informe o motivo para cancelar o convite enviado para ${revokingInvite.targetEmail}.`
            : ''
        }
        open={!!revokingInvite}
        busy={isRevokingInvite}
        confirmLabel="Cancelar convite"
        onOpenChange={open => !open && setRevokingInvite(null)}
        onConfirm={async reason => {
          if (!revokingInvite) return
          await revokeInvite({ inviteId: revokingInvite.id, reason })
          setRevokingInvite(null)
        }}
      />

      <AccessLinkResultDialog
        result={generatedAccessLink}
        onOpenChange={open => {
          if (!open) setGeneratedAccessLink(null)
        }}
      />
    </div>
  )
}

function EmptyState({
  title,
  description,
}: {
  title: string
  description: string
}) {
  return (
    <div className="flex min-h-40 flex-col items-center justify-center rounded-lg bg-muted/20 p-6 text-center">
      <Users className="mb-3 size-8 text-muted-foreground" aria-hidden="true" />
      <div className="font-semibold text-foreground">{title}</div>
      <p className="mt-1 max-w-md text-sm text-muted-foreground">
        {description}
      </p>
    </div>
  )
}

function RoleBadge({ role }: { role: StoreUserRole }) {
  const roleOption = getStoreUserRoleOption(role)

  return (
    <Badge variant="outline" className="gap-1">
      {role === 'owner' && (
        <ShieldCheck className="size-3 text-primary" aria-hidden="true" />
      )}
      <span>{roleOption.label}</span>
      <span className="text-muted-foreground">· {roleOption.shortLabel}</span>
    </Badge>
  )
}

function PendingInvitesList({
  invites,
  resendingInviteId,
  isResending,
  onResend,
  onRevoke,
}: {
  invites: StorePendingInvite[]
  resendingInviteId: number | null
  isResending: boolean
  onResend: (invite: StorePendingInvite) => Promise<void>
  onRevoke: (invite: StorePendingInvite) => void
}) {
  return (
    <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
        <Mail className="size-4 text-primary" aria-hidden="true" />
        Convites pendentes
      </div>
      <div className="grid gap-2 md:grid-cols-2">
        {invites.map(invite => (
          <div
            key={invite.id}
            className="flex items-start justify-between gap-3 rounded-md border bg-card p-3"
          >
            <div className="min-w-0">
              <div className="truncate text-sm font-medium text-foreground">
                {invite.targetName || invite.targetEmail}
              </div>
              <div className="truncate text-xs text-muted-foreground">
                {invite.targetEmail}
              </div>
              <div className="mt-2">
                <RoleBadge role={invite.role} />
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                Expira em {formatDateTime(invite.expiresAt)}
              </div>
            </div>
            <div className="flex shrink-0 gap-1">
              <Button
                variant="ghost"
                size="sm"
                isLoading={isResending && resendingInviteId === invite.id}
                onClick={() => onResend(invite)}
              >
                <RefreshCw className="size-4" aria-hidden="true" />
                Reenviar
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onRevoke(invite)}
              >
                <XCircle className="size-4" aria-hidden="true" />
                <span className="sr-only">Cancelar convite</span>
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function AccessLinkResultDialog({
  result,
  onOpenChange,
}: {
  result: {
    title: string
    description: string
    url: string
    targetEmail: string
    warning: string
  } | null
  onOpenChange: (open: boolean) => void
}) {
  const handleCopy = async () => {
    if (!result) return
    await navigator.clipboard.writeText(result.url)
  }

  return (
    <Dialog open={!!result} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{result?.title ?? 'Link gerado'}</DialogTitle>
          <DialogDescription>{result?.description}</DialogDescription>
        </DialogHeader>

        {result && (
          <div className="space-y-3">
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-200">
              {result.warning}
            </div>
            <div className="grid gap-1 text-sm font-medium">
              Link para {result.targetEmail}
              <div className="flex gap-2">
                <Input readOnly value={result.url} />
                <Button variant="outline" onClick={handleCopy}>
                  <Copy className="size-4" aria-hidden="true" />
                  Copiar
                </Button>
              </div>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function InviteUserDialog({
  open,
  busy,
  inviteResult,
  onOpenChange,
  onSubmit,
}: {
  open: boolean
  busy: boolean
  inviteResult: { inviteUrl: string; targetEmail: string } | null
  onOpenChange: (open: boolean) => void
  onSubmit: (values: {
    email: string
    name?: string
    phone?: string
    role: StoreUserRole
  }) => Promise<void>
}) {
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [role, setRole] = useState<StoreUserRole>('manager')

  const handleSubmit = async () => {
    await onSubmit({ email, name, phone, role })
  }

  const handleCopy = async () => {
    if (!inviteResult) return
    await navigator.clipboard.writeText(inviteResult.inviteUrl)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Convidar usuário</DialogTitle>
          <DialogDescription>
            Crie um link manual para vincular uma pessoa com o perfil correto.
          </DialogDescription>
        </DialogHeader>

        {inviteResult ? (
          <div className="space-y-3 rounded-lg border bg-muted/30 p-3">
            <p className="text-sm text-foreground">
              Convite criado para <strong>{inviteResult.targetEmail}</strong>.
            </p>
            <div className="flex gap-2">
              <Input readOnly value={inviteResult.inviteUrl} />
              <Button variant="outline" onClick={handleCopy}>
                <Copy className="size-4" aria-hidden="true" />
                Copiar
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <label className="grid gap-1 text-sm font-medium">
              E-mail
              <Input
                type="email"
                placeholder="cliente@restaurante.com"
                value={email}
                onChange={event => setEmail(event.target.value)}
              />
            </label>
            <label className="grid gap-1 text-sm font-medium">
              Nome
              <Input
                placeholder="Nome do usuário"
                value={name}
                onChange={event => setName(event.target.value)}
              />
            </label>
            <label className="grid gap-1 text-sm font-medium">
              Telefone
              <Input
                placeholder="(11) 99999-9999"
                value={phone}
                onChange={event => setPhone(event.target.value)}
              />
            </label>
            <label className="grid gap-1 text-sm font-medium">
              Perfil de acesso
              <select
                className="h-9 rounded border border-input bg-background px-3 text-sm text-foreground shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-primary/20 dark:bg-input/30"
                value={role}
                onChange={event => setRole(event.target.value as StoreUserRole)}
              >
                {storeUserRoleOptions.map(option => (
                  <option key={option.value} value={option.value}>
                    {option.label} - {option.shortLabel}
                  </option>
                ))}
              </select>
              <span className="text-xs text-muted-foreground">
                {getStoreUserRoleOption(role).description}
              </span>
            </label>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
          {!inviteResult && (
            <Button
              isLoading={busy}
              disabled={!email.trim()}
              onClick={handleSubmit}
            >
              Criar convite
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function EditUserDialog({
  user,
  busy,
  onOpenChange,
  onSubmit,
}: {
  user: StoreUserListItem | null
  busy: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (values: {
    name?: string
    phone?: string
    role: StoreUserRole
    isPrimaryResponsible: boolean
  }) => Promise<void>
}) {
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [role, setRole] = useState<StoreUserRole>('manager')
  const [isPrimaryResponsible, setIsPrimaryResponsible] = useState(false)

  useEffect(() => {
    if (!user) return
    setName(user.name ?? '')
    setPhone(user.phone ?? '')
    setRole(user.role)
    setIsPrimaryResponsible(user.isPrimaryResponsible)
  }, [user])

  useEffect(() => {
    if (role !== 'owner') setIsPrimaryResponsible(false)
  }, [role])

  return (
    <Dialog open={!!user} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar usuário</DialogTitle>
          <DialogDescription>
            Atualize os dados do acesso vinculado a esta loja.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <label className="grid gap-1 text-sm font-medium">
            Nome
            <Input
              value={name}
              onChange={event => setName(event.target.value)}
            />
          </label>
          <label className="grid gap-1 text-sm font-medium">
            Telefone
            <Input
              value={phone}
              onChange={event => setPhone(event.target.value)}
            />
          </label>
          <label className="grid gap-1 text-sm font-medium">
            Perfil de acesso
            <select
              className="h-9 rounded border border-input bg-background px-3 text-sm text-foreground shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-primary/20 dark:bg-input/30"
              value={role}
              onChange={event => setRole(event.target.value as StoreUserRole)}
            >
              {storeUserRoleOptions.map(option => (
                <option key={option.value} value={option.value}>
                  {option.label} - {option.shortLabel}
                </option>
              ))}
            </select>
            <span className="text-xs text-muted-foreground">
              {getStoreUserRoleOption(role).description}
            </span>
          </label>
          <div
            className={cn(
              'flex items-center justify-between gap-3 rounded-lg border p-3',
              user?.isPrimaryResponsible && 'bg-primary/5'
            )}
          >
            <div>
              <div className="text-sm font-medium text-foreground">
                Responsável principal
              </div>
              <p className="text-xs text-muted-foreground">
                Apenas o perfil Proprietário pode ser responsável principal.
              </p>
            </div>
            <Switch
              checked={isPrimaryResponsible}
              onCheckedChange={setIsPrimaryResponsible}
              disabled={user?.isPrimaryResponsible || role !== 'owner'}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            isLoading={busy}
            onClick={() =>
              onSubmit({ name, phone, role, isPrimaryResponsible })
            }
          >
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function BlockAccessDialog({
  user,
  busy,
  onOpenChange,
  onConfirm,
}: {
  user: StoreUserListItem | null
  busy: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: (values: {
    reason: string
    notificationChannel: 'none' | 'email' | 'whatsapp' | 'manual'
    notificationNote?: string
  }) => Promise<void>
}) {
  const [reason, setReason] = useState('')
  const [notificationChannel, setNotificationChannel] = useState<
    'none' | 'email' | 'whatsapp' | 'manual'
  >('none')
  const [notificationNote, setNotificationNote] = useState('')

  const reset = () => {
    setReason('')
    setNotificationChannel('none')
    setNotificationNote('')
  }

  const handleConfirm = async () => {
    await onConfirm({ reason, notificationChannel, notificationNote })
    reset()
  }

  return (
    <AlertDialog
      open={!!user}
      onOpenChange={open => {
        onOpenChange(open)
        if (!open) reset()
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Bloquear acesso de usuário</AlertDialogTitle>
          <AlertDialogDescription>
            {user
              ? `O vinculo de ${user.email} com esta loja sera mantido, mas o acesso sera negado imediatamente e sessoes ativas serao encerradas.`
              : ''}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-3">
          <Textarea
            className="min-h-24"
            placeholder="Ex.: usuario afastado temporariamente da operacao"
            value={reason}
            onChange={event => setReason(event.target.value)}
          />
          <label className="grid gap-1 text-sm font-medium text-foreground">
            Registrar canal de notificação
            <select
              className="h-9 rounded border border-input bg-background px-3 text-sm text-foreground shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-primary/20 dark:bg-input/30"
              value={notificationChannel}
              onChange={event =>
                setNotificationChannel(
                  event.target.value as 'none' | 'email' | 'whatsapp' | 'manual'
                )
              }
            >
              <option value="none">Sem notificação agora</option>
              <option value="email">Registrar e-mail como canal</option>
              <option value="whatsapp">Registrar WhatsApp como canal</option>
              <option value="manual">Contato manual registrado</option>
            </select>
          </label>
          <Input
            placeholder="Observação interna sobre a notificação"
            value={notificationNote}
            onChange={event => setNotificationNote(event.target.value)}
          />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <Button
            variant="destructive"
            isLoading={busy}
            disabled={reason.trim().length < 8}
            onClick={handleConfirm}
          >
            Bloquear acesso
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

function RevokeAccessDialog({
  title,
  description,
  open,
  busy,
  confirmLabel,
  confirmVariant = 'destructive',
  onOpenChange,
  onConfirm,
}: {
  title: string
  description: string
  open: boolean
  busy: boolean
  confirmLabel: string
  confirmVariant?: 'default' | 'destructive'
  onOpenChange: (open: boolean) => void
  onConfirm: (reason: string) => Promise<void>
}) {
  const [reason, setReason] = useState('')

  const handleConfirm = async () => {
    await onConfirm(reason)
    setReason('')
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <Textarea
          className="min-h-24"
          placeholder="Ex.: usuário saiu da operação da loja"
          value={reason}
          onChange={event => setReason(event.target.value)}
        />
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => setReason('')}>
            Cancelar
          </AlertDialogCancel>
          <Button
            variant={confirmVariant}
            isLoading={busy}
            disabled={reason.trim().length < 8}
            onClick={handleConfirm}
          >
            {confirmLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
