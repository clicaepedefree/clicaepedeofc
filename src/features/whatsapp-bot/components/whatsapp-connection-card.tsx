'use client'

import {
  getWhatsappConnectionActions,
  getWhatsappConnectionGuidance,
  getWhatsappConnectionStatusLabel,
  sanitizeWhatsappConnectionError,
  shouldShowWhatsappQrCode,
} from '@/features/whatsapp-bot/connection-panel-policy'
import { useWhatsappConnection } from '@/features/whatsapp-bot/hooks/use-whatsapp-connection'
import { selectedStoreIdAtom } from '@/features/store/state'
import {
  AlertDialog,
  AlertDialogAction,
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
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/shared/dialog'
import { Input } from '@/shared/input'
import { Label } from '@/shared/label'
import { cn } from '@/shared/lib/utils'
import { LoadingSpinner } from '@/shared/spinner'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/tooltip'
import { Body } from '@/shared/typography/body'
import { Headline } from '@/shared/typography/headline'
import { useAtomValue } from 'jotai'
import {
  AlertTriangle,
  Bot,
  Clock3,
  MessageCircle,
  Pause,
  Play,
  QrCode,
  RefreshCw,
  ShieldCheck,
  Unplug,
} from 'lucide-react'
import Image from 'next/image'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'

const formatDateTime = (value?: Date | string | null) => {
  if (!value) return 'Sem atualizacao'

  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value))
}

const normalizeQrCodeSrc = (value: string) =>
  value.startsWith('data:image') ? value : `data:image/png;base64,${value}`

const getStatusBadgeClassName = (status?: string | null) => {
  switch (status) {
    case 'connected':
      return 'border-transparent bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200'
    case 'paused':
      return 'border-transparent bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200'
    case 'pending_qr':
    case 'connecting':
      return 'border-transparent bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-200'
    case 'error':
      return ''
    default:
      return 'border-transparent bg-secondary text-secondary-foreground'
  }
}

function PermissionTooltip({
  children,
  disabled,
}: {
  children: React.ReactNode
  disabled: boolean
}) {
  if (!disabled) return children

  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent>
        Peca a um proprietario ou gerente para alterar o robo WhatsApp.
      </TooltipContent>
    </Tooltip>
  )
}

export function WhatsappConnectionCard() {
  const selectedStoreId = useAtomValue(selectedStoreIdAtom)
  const [phoneNumber, setPhoneNumber] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [qrDialogOpen, setQrDialogOpen] = useState(false)
  const {
    connection,
    error,
    isLoading,
    isMutating,
    startConnection,
    renewQrCode,
    pauseConnection,
    disconnectConnection,
  } = useWhatsappConnection(selectedStoreId)

  const actions = useMemo(
    () => getWhatsappConnectionActions(connection?.status),
    [connection?.status]
  )
  const showQrCode = shouldShowWhatsappQrCode({
    status: connection?.status,
    qrCodeBase64: connection?.qrCodeBase64,
    qrCodeExpiresAt: connection?.qrCodeExpiresAt,
  })
  const guidance = getWhatsappConnectionGuidance({
    status: connection?.status,
    qrCodeBase64: connection?.qrCodeBase64,
    qrCodeExpiresAt: connection?.qrCodeExpiresAt,
    lastErrorMessage: connection?.lastErrorMessage,
  })
  const permissionError = sanitizeWhatsappConnectionError(
    error instanceof Error ? error.message : null
  )
  const cannotManage =
    !!permissionError && /permissao|permissão/i.test(permissionError)
  const numberLabel =
    connection?.phoneNumber ??
    (connection ? 'Numero nao informado' : 'Nenhum numero conectado')

  const handleStartConnection = async () => {
    const cleanedPhone = phoneNumber.trim()

    if (!cleanedPhone) {
      toast.error('Informe o numero do WhatsApp para conectar.')
      return
    }

    try {
      await startConnection({
        phoneNumber: cleanedPhone,
        displayName: displayName.trim() || null,
      })
      setQrDialogOpen(true)
      toast.success('QR Code solicitado para conexao.')
    } catch (error) {
      toast.error(
        sanitizeWhatsappConnectionError(
          error instanceof Error ? error.message : null
        ) ?? 'Nao foi possivel iniciar a conexao.'
      )
    }
  }

  const handleRenewQrCode = async () => {
    if (!connection) return

    try {
      await renewQrCode(connection.id)
      setQrDialogOpen(true)
      toast.success('Novo QR Code gerado.')
    } catch (error) {
      toast.error(
        sanitizeWhatsappConnectionError(
          error instanceof Error ? error.message : null
        ) ?? 'Nao foi possivel gerar um novo QR Code.'
      )
    }
  }

  const handlePause = async () => {
    if (!connection) return

    try {
      await pauseConnection(connection.id)
      toast.success('Respostas automaticas pausadas.')
    } catch (error) {
      toast.error(
        sanitizeWhatsappConnectionError(
          error instanceof Error ? error.message : null
        ) ?? 'Nao foi possivel pausar o robo.'
      )
    }
  }

  const handleDisconnect = async () => {
    if (!connection) return

    try {
      await disconnectConnection(connection.id)
      setQrDialogOpen(false)
      toast.success('WhatsApp desconectado.')
    } catch (error) {
      toast.error(
        sanitizeWhatsappConnectionError(
          error instanceof Error ? error.message : null
        ) ?? 'Nao foi possivel desconectar o WhatsApp.'
      )
    }
  }

  return (
    <>
      <div className="rounded-lg border bg-card p-4 text-card-foreground">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border bg-background">
                <Bot className="h-5 w-5 text-primary" />
              </div>
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Headline variant={500}>Robo WhatsApp</Headline>
                  <Badge
                    variant={
                      connection?.status === 'error' ? 'destructive' : 'outline'
                    }
                    className={getStatusBadgeClassName(connection?.status)}
                  >
                    {isLoading
                      ? 'Carregando'
                      : getWhatsappConnectionStatusLabel(connection?.status)}
                  </Badge>
                </div>
                <Body
                  variant={200}
                  fontWeight="regular"
                  className="max-w-2xl text-muted-foreground"
                >
                  {guidance}
                </Body>
              </div>
            </div>

            {isLoading && <LoadingSpinner size={20} className="mt-2" />}
          </div>

          {permissionError && (
            <div
              className={cn(
                'rounded-md border p-3 text-sm',
                cannotManage
                  ? 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/70 dark:bg-amber-950/30 dark:text-amber-200'
                  : 'border-red-200 bg-red-50 text-red-700 dark:border-red-900/70 dark:bg-red-950/30 dark:text-red-200'
              )}
              role="alert"
            >
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{permissionError}</span>
              </div>
            </div>
          )}

          <div className="grid gap-3 rounded-md border bg-background/60 p-3 md:grid-cols-3">
            <div className="space-y-1">
              <Body variant={100} className="text-muted-foreground">
                Numero conectado
              </Body>
              <p className="text-sm font-medium text-foreground">
                {numberLabel}
              </p>
            </div>
            <div className="space-y-1">
              <Body variant={100} className="text-muted-foreground">
                Nome exibido
              </Body>
              <p className="text-sm font-medium text-foreground">
                {connection?.displayName || 'Nao configurado'}
              </p>
            </div>
            <div className="space-y-1">
              <Body variant={100} className="text-muted-foreground">
                Ultima atualizacao
              </Body>
              <p className="inline-flex items-center gap-1 text-sm font-medium text-foreground">
                <Clock3 className="h-3.5 w-3.5 text-muted-foreground" />
                {formatDateTime(
                  connection?.lastHeartbeatAt ??
                    connection?.updatedAt ??
                    connection?.connectedAt ??
                    connection?.disconnectedAt
                )}
              </p>
            </div>
          </div>

          {connection?.lastErrorMessage && connection.status !== 'error' && (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900/70 dark:bg-amber-950/30 dark:text-amber-200">
              {sanitizeWhatsappConnectionError(connection.lastErrorMessage)}
            </div>
          )}

          {actions.includes('connect') && (
            <div className="grid gap-3 border-t pt-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] md:items-end">
              <Label>
                <span className="text-sm font-medium">Numero do WhatsApp</span>
                <Input
                  value={phoneNumber}
                  onChange={event => setPhoneNumber(event.target.value)}
                  placeholder="+5511999999999"
                  autoComplete="tel"
                  disabled={isMutating || cannotManage}
                />
              </Label>
              <Label>
                <span className="text-sm font-medium">Nome exibido</span>
                <Input
                  value={displayName}
                  onChange={event => setDisplayName(event.target.value)}
                  placeholder="Atendimento da loja"
                  disabled={isMutating || cannotManage}
                />
              </Label>
              <PermissionTooltip disabled={cannotManage}>
                <Button
                  onClick={handleStartConnection}
                  disabled={isMutating || cannotManage}
                  className="w-full md:w-auto"
                >
                  <MessageCircle className="h-4 w-4" />
                  Conectar
                </Button>
              </PermissionTooltip>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            {actions.includes('view_qr') && (
              <Button
                variant="outline"
                onClick={() => setQrDialogOpen(true)}
                disabled={!showQrCode}
              >
                <QrCode className="h-4 w-4" />
                Ver QR Code
              </Button>
            )}

            {actions.includes('renew_qr') && (
              <PermissionTooltip disabled={cannotManage}>
                <Button
                  variant="outline"
                  onClick={handleRenewQrCode}
                  disabled={isMutating || cannotManage || !connection}
                >
                  <RefreshCw
                    className={cn('h-4 w-4', isMutating && 'animate-spin')}
                  />
                  Renovar QR Code
                </Button>
              </PermissionTooltip>
            )}

            {actions.includes('pause') && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="outline"
                    disabled={isMutating || cannotManage || !connection}
                  >
                    <Pause className="h-4 w-4" />
                    Pausar respostas
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>
                      Pausar respostas automaticas?
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                      O robo deixara de responder automaticamente. O numero e as
                      configuracoes serao preservados para reativacao.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Voltar</AlertDialogCancel>
                    <AlertDialogAction onClick={handlePause}>
                      Pausar respostas
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}

            {actions.includes('resume') && (
              <PermissionTooltip disabled={cannotManage}>
                <Button
                  onClick={handleRenewQrCode}
                  disabled={isMutating || cannotManage || !connection}
                >
                  <Play className="h-4 w-4" />
                  Reativar
                </Button>
              </PermissionTooltip>
            )}

            {actions.includes('disconnect') && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="destructive"
                    disabled={isMutating || cannotManage || !connection}
                  >
                    <Unplug className="h-4 w-4" />
                    Desconectar
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Desconectar WhatsApp?</AlertDialogTitle>
                    <AlertDialogDescription>
                      O numero sera desconectado do robo. Para usar novamente,
                      sera necessario ler um novo QR Code.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction
                      className="bg-destructive text-white hover:bg-destructive/90"
                      onClick={handleDisconnect}
                    >
                      Desconectar
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>

          <div className="flex items-start gap-2 rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800 dark:border-blue-900/70 dark:bg-blue-950/30 dark:text-blue-200">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              Somente usuarios com permissao de integracoes conseguem alterar
              esta conexao.
            </span>
          </div>
        </div>
      </div>

      <Dialog open={qrDialogOpen} onOpenChange={setQrDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Conectar WhatsApp</DialogTitle>
            <DialogDescription>
              Leia o QR Code no WhatsApp do restaurante. O status sera
              atualizado automaticamente apos a conexao.
            </DialogDescription>
          </DialogHeader>

          {showQrCode && connection?.qrCodeBase64 ? (
            <div className="flex flex-col items-center gap-3">
              <div className="rounded-lg border bg-white p-3">
                <Image
                  src={normalizeQrCodeSrc(connection.qrCodeBase64)}
                  alt="QR Code de conexao do WhatsApp"
                  width={256}
                  height={256}
                  unoptimized
                  className="h-64 w-64"
                />
              </div>
              <Body variant={200} className="text-center text-muted-foreground">
                Expira em {formatDateTime(connection.qrCodeExpiresAt)}
              </Body>
            </div>
          ) : (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-900/70 dark:bg-amber-950/30 dark:text-amber-200">
              E necessario renovar o QR Code para continuar a conexao.
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
