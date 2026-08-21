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
  Mail,
  Pencil,
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
  { value: 'revoked', label: 'Desvinculados' },
  { value: 'deleted', label: 'Contas deletadas' },
]

const accessStatusLabels: Record<StoreUserListItem['accessStatus'], string> = {
  active: 'Ativo',
  revoked: 'Desvinculado',
  deleted: 'Conta deletada',
}

const accessStatusClassNames: Record<StoreUserListItem['accessStatus'], string> = {
  active: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  revoked: 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300',
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
  const [editingUser, setEditingUser] = useState<StoreUserListItem | null>(null)
  const [revokingUser, setRevokingUser] = useState<StoreUserListItem | null>(null)
  const [revokingInvite, setRevokingInvite] = useState<StorePendingInvite | null>(
    null
  )

  const {
    selectedStoreId,
    data,
    isLoading,
    inviteUser,
    updateUser,
    revokeUser,
    revokeInvite,
    isInvitingUser,
    isUpdatingUser,
    isRevokingUser,
    isRevokingInvite,
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
      <SettingsCategoryBlock title="Equipe e perfis" contentClassName="grid-cols-1">
        <EmptyState
          title="Selecione uma loja"
          description="Escolha uma loja no topo do painel para gerenciar os acessos vinculados a ela."
        />
      </SettingsCategoryBlock>
    )
  }

  return (
    <div className="space-y-4">
      <SettingsCategoryBlock title="Equipe e perfis" contentClassName="grid-cols-1">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-center">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <Users className="size-4 text-primary" aria-hidden="true" />
                Acessos vinculados
              </div>
              <p className="text-sm text-muted-foreground">
                Convide, edite e desvincule usuários conforme o perfil de acesso.
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
                              <ShieldCheck className="size-3" aria-hidden="true" />
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
                            onClick={() => setEditingUser(user)}
                          >
                            <Pencil className="size-4" aria-hidden="true" />
                            Editar
                          </Button>
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
        title="Desvincular usuário"
        description={
          revokingUser
            ? `Informe o motivo para remover o acesso de ${revokingUser.email}.`
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
  onRevoke,
}: {
  invites: StorePendingInvite[]
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
            <Button variant="ghost" size="icon" onClick={() => onRevoke(invite)}>
              <XCircle className="size-4" aria-hidden="true" />
              <span className="sr-only">Cancelar convite</span>
            </Button>
          </div>
        ))}
      </div>
    </div>
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
            <Button isLoading={busy} disabled={!email.trim()} onClick={handleSubmit}>
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
            <Input value={name} onChange={event => setName(event.target.value)} />
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
            onClick={() => onSubmit({ name, phone, role, isPrimaryResponsible })}
          >
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function RevokeAccessDialog({
  title,
  description,
  open,
  busy,
  confirmLabel,
  onOpenChange,
  onConfirm,
}: {
  title: string
  description: string
  open: boolean
  busy: boolean
  confirmLabel: string
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
            variant="destructive"
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
