'use client'

import { selectedStoreIdAtom } from '@/features/store/state'
import { useWhatsappHumanHandoffQueue } from '@/features/whatsapp-bot/hooks/use-whatsapp-human-handoff-queue'
import type { WhatsappHumanHandoffConversation } from '@/features/whatsapp-bot/db'
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
import { cn } from '@/shared/lib/utils'
import { LoadingSpinner } from '@/shared/spinner'
import { Body } from '@/shared/typography/body'
import { Headline } from '@/shared/typography/headline'
import { useAtomValue } from 'jotai'
import {
  Bot,
  Clock3,
  Inbox,
  MessageSquareText,
  RefreshCw,
  RotateCcw,
  UserRound,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

const formatDateTime = (value?: Date | string | null) => {
  if (!value) return 'Sem registro'

  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value))
}

const formatWaitingTime = (value?: Date | string | null) => {
  if (!value) return 'Sem espera'

  const diffMs = Date.now() - new Date(value).getTime()
  const minutes = Math.max(0, Math.floor(diffMs / 60_000))
  if (minutes < 1) return 'Agora'
  if (minutes < 60) return `${minutes} min`

  const hours = Math.floor(minutes / 60)
  const remainingMinutes = minutes % 60
  return remainingMinutes ? `${hours}h ${remainingMinutes}min` : `${hours}h`
}

const getSenderLabel = (
  senderType: WhatsappHumanHandoffConversation['messages'][number]['senderType']
) => {
  switch (senderType) {
    case 'customer':
      return 'Cliente'
    case 'bot':
      return 'Robo'
    case 'human':
      return 'Humano'
    default:
      return 'Sistema'
  }
}

const getMessageBody = (
  message: WhatsappHumanHandoffConversation['messages'][number]
) => {
  if (message.body?.trim()) return message.body

  switch (message.messageType) {
    case 'audio':
      return 'Audio recebido.'
    case 'image':
      return 'Imagem recebida.'
    case 'document':
      return 'Documento recebido.'
    default:
      return 'Mensagem sem texto.'
  }
}

const getLastCustomerMessage = (
  conversation: WhatsappHumanHandoffConversation
) =>
  conversation.messages
    .slice()
    .reverse()
    .find(message => message.senderType === 'customer')

function ConversationListItem({
  conversation,
  isSelected,
  onSelect,
}: {
  conversation: WhatsappHumanHandoffConversation
  isSelected: boolean
  onSelect: () => void
}) {
  const lastCustomerMessage = getLastCustomerMessage(conversation)

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'w-full rounded-md border p-3 text-left transition hover:border-primary/50 hover:bg-accent',
        isSelected && 'border-primary bg-primary/5'
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-foreground">
            {conversation.contact.displayName ||
              conversation.contact.phoneNumber}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {conversation.contact.phoneNumber}
          </p>
        </div>
        <Badge variant="outline" className="shrink-0">
          {conversation.handoff.reasonLabel}
        </Badge>
      </div>
      <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">
        {lastCustomerMessage
          ? getMessageBody(lastCustomerMessage)
          : 'Sem mensagem recente.'}
      </p>
      <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
        <Clock3 className="h-3.5 w-3.5" />
        <span>Aguardando {formatWaitingTime(conversation.humanPausedAt)}</span>
      </div>
    </button>
  )
}

export function WhatsappHumanHandoffCard() {
  const selectedStoreId = useAtomValue(selectedStoreIdAtom)
  const [selectedConversationId, setSelectedConversationId] = useState<
    string | null
  >(null)
  const {
    conversations,
    error,
    isLoading,
    refetch,
    returnToBot,
    isReturningToBot,
  } = useWhatsappHumanHandoffQueue(selectedStoreId)

  const selectedConversation = useMemo(
    () =>
      conversations.find(
        conversation => conversation.id === selectedConversationId
      ) ??
      conversations[0] ??
      null,
    [conversations, selectedConversationId]
  )

  useEffect(() => {
    if (!selectedConversationId && conversations[0]) {
      setSelectedConversationId(conversations[0].id)
    }
  }, [conversations, selectedConversationId])

  const pendingCount = conversations.filter(
    conversation => conversation.status === 'pending_human'
  ).length
  const humanCount = conversations.filter(
    conversation => conversation.mode === 'human'
  ).length
  const longestWaiting = conversations
    .map(conversation => conversation.humanPausedAt)
    .filter(Boolean)
    .sort((a, b) => new Date(a!).getTime() - new Date(b!).getTime())[0]

  return (
    <div className="rounded-lg border bg-card p-4 text-card-foreground">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border bg-background">
              <Inbox className="h-5 w-5 text-primary" />
            </div>
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <Headline variant={500}>Atendimento humano</Headline>
                <Badge variant="outline">{pendingCount} pendente(s)</Badge>
              </div>
              <Body
                variant={200}
                fontWeight="regular"
                className="max-w-2xl text-muted-foreground"
              >
                Conversas encaminhadas pelo robo ficam pausadas aqui ate a
                equipe devolver o atendimento ao automatico.
              </Body>
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={() => refetch()}
            disabled={isLoading}
          >
            <RefreshCw className={cn('h-4 w-4', isLoading && 'animate-spin')} />
            Atualizar
          </Button>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-md border bg-background/60 p-3">
            <Body variant={100} className="text-muted-foreground">
              Pendentes
            </Body>
            <p className="text-lg font-semibold">{pendingCount}</p>
          </div>
          <div className="rounded-md border bg-background/60 p-3">
            <Body variant={100} className="text-muted-foreground">
              Em modo humano
            </Body>
            <p className="text-lg font-semibold">{humanCount}</p>
          </div>
          <div className="rounded-md border bg-background/60 p-3">
            <Body variant={100} className="text-muted-foreground">
              Maior espera
            </Body>
            <p className="text-lg font-semibold">
              {formatWaitingTime(longestWaiting)}
            </p>
          </div>
        </div>

        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/70 dark:bg-red-950/30 dark:text-red-200">
            Nao foi possivel carregar os atendimentos humanos.
          </div>
        )}

        {isLoading ? (
          <div className="flex min-h-48 items-center justify-center rounded-md border bg-background/60">
            <LoadingSpinner size={24} />
          </div>
        ) : conversations.length === 0 ? (
          <div className="flex min-h-48 flex-col items-center justify-center gap-2 rounded-md border bg-background/60 p-6 text-center">
            <Inbox className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm font-medium">
              Nenhuma conversa aguardando humano
            </p>
            <p className="max-w-md text-sm text-muted-foreground">
              Quando o robo detectar pedido de atendente, reclamacao,
              cancelamento, pagamento sensivel ou baixa confianca, a conversa
              aparecera aqui.
            </p>
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-[minmax(260px,360px)_1fr]">
            <div className="space-y-2">
              {conversations.map(conversation => (
                <ConversationListItem
                  key={conversation.id}
                  conversation={conversation}
                  isSelected={conversation.id === selectedConversation?.id}
                  onSelect={() => setSelectedConversationId(conversation.id)}
                />
              ))}
            </div>

            {selectedConversation && (
              <div className="rounded-md border bg-background/60">
                <div className="border-b p-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Headline variant={400}>
                          {selectedConversation.contact.displayName ||
                            selectedConversation.contact.phoneNumber}
                        </Headline>
                        <Badge variant="outline">
                          {selectedConversation.handoff.reasonLabel}
                        </Badge>
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {selectedConversation.contact.phoneNumber}
                      </p>
                    </div>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          type="button"
                          disabled={isReturningToBot}
                          className="w-full md:w-auto"
                        >
                          <RotateCcw className="h-4 w-4" />
                          Devolver ao robo
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>
                            Devolver conversa ao robo?
                          </AlertDialogTitle>
                          <AlertDialogDescription>
                            As proximas mensagens deste cliente voltarao ao
                            atendimento automatico. O historico humano continua
                            preservado.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => {
                              void returnToBot(selectedConversation.id)
                            }}
                          >
                            Devolver ao robo
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>

                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    <div className="rounded-md border bg-card p-3">
                      <p className="text-xs font-medium text-muted-foreground">
                        Contexto
                      </p>
                      <p className="mt-1 text-sm">
                        {selectedConversation.contextSummary ||
                          'Sem resumo registrado.'}
                      </p>
                    </div>
                    <div className="rounded-md border bg-card p-3">
                      <p className="text-xs font-medium text-muted-foreground">
                        Responsavel notificado
                      </p>
                      <p className="mt-1 text-sm">
                        {selectedConversation.handoff.responsible?.name ||
                          selectedConversation.handoff.responsible?.email ||
                          'Fila interna da loja'}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {formatDateTime(
                          selectedConversation.handoff.notifiedAt
                        )}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="max-h-[520px] space-y-3 overflow-y-auto p-4">
                  {selectedConversation.messages.map(message => {
                    const isCustomer = message.senderType === 'customer'
                    const isBot = message.senderType === 'bot'
                    const Icon = isCustomer
                      ? UserRound
                      : isBot
                        ? Bot
                        : MessageSquareText

                    return (
                      <div
                        key={message.id}
                        className={cn(
                          'flex gap-3',
                          isCustomer ? 'justify-start' : 'justify-end'
                        )}
                      >
                        <div
                          className={cn(
                            'max-w-[82%] rounded-md border p-3',
                            isCustomer
                              ? 'bg-card'
                              : isBot
                                ? 'bg-primary/10'
                                : 'bg-muted'
                          )}
                        >
                          <div className="mb-1 flex items-center gap-2 text-xs font-medium text-muted-foreground">
                            <Icon className="h-3.5 w-3.5" />
                            {getSenderLabel(message.senderType)}
                            <span>·</span>
                            {formatDateTime(message.occurredAt)}
                          </div>
                          <p className="whitespace-pre-wrap text-sm">
                            {getMessageBody(message)}
                          </p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
