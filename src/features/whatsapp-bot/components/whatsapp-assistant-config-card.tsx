'use client'

import {
  assistantConfigLimits,
  buildDefaultWhatsappAssistantConfig,
  validateWhatsappAssistantConfigInput,
  type WhatsappAssistantConfigInput,
} from '@/features/whatsapp-bot/assistant-config-policy'
import { useWhatsappAssistantConfig } from '@/features/whatsapp-bot/hooks/use-whatsapp-assistant-config'
import { selectedStoreIdAtom } from '@/features/store/state'
import { Badge } from '@/shared/badge'
import { Button } from '@/shared/button'
import { Input } from '@/shared/input'
import { Label } from '@/shared/label'
import { cn } from '@/shared/lib/utils'
import { LoadingSpinner } from '@/shared/spinner'
import { Switch } from '@/shared/switch'
import { Textarea } from '@/shared/textarea'
import { Body } from '@/shared/typography/body'
import { Headline } from '@/shared/typography/headline'
import { useAtomValue } from 'jotai'
import { Bot, MessageSquareText, RotateCcw, Save, Send } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'

type Option<T extends string> = {
  value: T
  label: string
  description: string
}

const toneOptions: Option<WhatsappAssistantConfigInput['tone']>[] = [
  {
    value: 'friendly',
    label: 'Amigavel',
    description: 'Acolhedor e proximo.',
  },
  {
    value: 'professional',
    label: 'Profissional',
    description: 'Formal e seguro.',
  },
  { value: 'casual', label: 'Casual', description: 'Leve e natural.' },
  { value: 'direct', label: 'Direto', description: 'Curto e objetivo.' },
]

const responseLengthOptions: Option<
  WhatsappAssistantConfigInput['responseLength']
>[] = [
  { value: 'short', label: 'Curtas', description: 'Respostas enxutas.' },
  { value: 'medium', label: 'Medias', description: 'Equilibrio e contexto.' },
  {
    value: 'detailed',
    label: 'Detalhadas',
    description: 'Mais explicacao quando ajudar.',
  },
]

const emojiUsageOptions: Option<WhatsappAssistantConfigInput['emojiUsage']>[] =
  [
    { value: 'none', label: 'Sem emojis', description: 'Texto limpo.' },
    { value: 'light', label: 'Poucos', description: 'Uso moderado.' },
    {
      value: 'expressive',
      label: 'Expressivo',
      description: 'Mais calor na conversa.',
    },
  ]

const createInitialForm = (): WhatsappAssistantConfigInput =>
  buildDefaultWhatsappAssistantConfig('loja')

function CharacterCounter({
  value,
  limit,
}: {
  value: string | null | undefined
  limit: number
}) {
  return (
    <p className="text-right text-xs text-muted-foreground">
      {(value ?? '').length}/{limit}
    </p>
  )
}

function SegmentedOptions<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T
  options: Option<T>[]
  onChange: (value: T) => void
}) {
  return (
    <div className="grid gap-2 md:grid-cols-3 xl:grid-cols-4">
      {options.map(option => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={cn(
            'rounded-md border bg-background p-3 text-left transition-colors hover:border-primary/60',
            value === option.value &&
              'border-primary bg-primary/5 text-primary shadow-sm'
          )}
        >
          <span className="block text-sm font-semibold">{option.label}</span>
          <span className="mt-1 block text-xs text-muted-foreground">
            {option.description}
          </span>
        </button>
      ))}
    </div>
  )
}

export function WhatsappAssistantConfigCard() {
  const selectedStoreId = useAtomValue(selectedStoreIdAtom)
  const [form, setForm] =
    useState<WhatsappAssistantConfigInput>(createInitialForm)
  const [testMessage, setTestMessage] = useState(
    'Quem e voce e como pode me ajudar?'
  )
  const [inlineError, setInlineError] = useState<string | null>(null)
  const {
    config,
    error,
    isLoading,
    isSaving,
    saveConfig,
    testAssistant,
    testResult,
    isTesting,
  } = useWhatsappAssistantConfig(selectedStoreId)

  useEffect(() => {
    if (!config) return

    setForm({
      assistantName: config.assistantName,
      greetingMessage: config.greetingMessage,
      fallbackMessage: config.fallbackMessage,
      tone: config.tone,
      responseLength: config.responseLength,
      emojiUsage: config.emojiUsage,
      additionalInstructions: config.additionalInstructions,
      testModeEnabled: config.testModeEnabled,
    })
    setInlineError(null)
  }, [config])

  const hasChanges = useMemo(() => {
    if (!config) return false

    return (
      form.assistantName !== config.assistantName ||
      form.greetingMessage !== config.greetingMessage ||
      form.fallbackMessage !== config.fallbackMessage ||
      form.tone !== config.tone ||
      form.responseLength !== config.responseLength ||
      form.emojiUsage !== config.emojiUsage ||
      (form.additionalInstructions ?? null) !==
        (config.additionalInstructions ?? null) ||
      form.testModeEnabled !== config.testModeEnabled
    )
  }, [config, form])

  const setField = <K extends keyof WhatsappAssistantConfigInput>(
    field: K,
    value: WhatsappAssistantConfigInput[K]
  ) => {
    setInlineError(null)
    setForm(current => ({ ...current, [field]: value }))
  }

  const validateForm = () => {
    const parsed = validateWhatsappAssistantConfigInput(form)

    if (!parsed.success) {
      setInlineError(parsed.error)
      return false
    }

    return true
  }

  const handleSave = async () => {
    if (!validateForm()) return

    await saveConfig(form)
  }

  const handleTest = async () => {
    if (!validateForm()) return

    await saveConfig(form)
    await testAssistant(testMessage)
  }

  const handleRestoreDefault = () => {
    setForm(buildDefaultWhatsappAssistantConfig(config?.storeName ?? 'loja'))
    setInlineError(null)
    toast.info('Padrao restaurado no formulario. Salve para aplicar.')
  }

  const statusLabel = form.testModeEnabled
    ? 'Modo teste'
    : config?.status === 'active'
      ? 'Ativo'
      : 'Pronto para ativar'

  return (
    <div className="rounded-lg border bg-card p-4 text-card-foreground">
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border bg-background">
              <MessageSquareText className="h-5 w-5 text-primary" />
            </div>
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <Headline variant={500}>Personalidade do assistente</Headline>
                <Badge
                  variant="outline"
                  className={cn(
                    'border-transparent',
                    form.testModeEnabled
                      ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200'
                      : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200'
                  )}
                >
                  {statusLabel}
                </Badge>
                {hasChanges && <Badge variant="secondary">Alteracoes</Badge>}
              </div>
              <Body
                variant={200}
                fontWeight="regular"
                className="max-w-2xl text-muted-foreground"
              >
                As proximas mensagens usam a personalidade salva sem reconectar
                o WhatsApp.
              </Body>
            </div>
          </div>

          {isLoading && <LoadingSpinner size={20} className="mt-2" />}
        </div>

        {error && (
          <div
            className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/70 dark:bg-red-950/30 dark:text-red-200"
            role="alert"
          >
            {error instanceof Error
              ? error.message
              : 'Nao foi possivel carregar a configuracao.'}
          </div>
        )}

        {inlineError && (
          <div
            className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900/70 dark:bg-amber-950/30 dark:text-amber-200"
            role="alert"
          >
            {inlineError}
          </div>
        )}

        <div className="grid gap-4 md:grid-cols-2">
          <Label>
            <span className="text-sm font-medium">Nome do assistente</span>
            <Input
              value={form.assistantName}
              maxLength={assistantConfigLimits.assistantName}
              onChange={event => setField('assistantName', event.target.value)}
              placeholder="Assistente virtual"
              disabled={isLoading || isSaving}
            />
            <CharacterCounter
              value={form.assistantName}
              limit={assistantConfigLimits.assistantName}
            />
          </Label>

          <div className="flex items-center justify-between rounded-md border bg-background/60 p-3">
            <div className="space-y-1">
              <p className="text-sm font-medium">Modo de teste</p>
              <p className="text-xs text-muted-foreground">
                Mantem a configuracao em teste antes de responder clientes.
              </p>
            </div>
            <Switch
              checked={form.testModeEnabled}
              onCheckedChange={checked =>
                setField('testModeEnabled', Boolean(checked))
              }
              disabled={isLoading || isSaving}
            />
          </div>
        </div>

        <Label>
          <span className="text-sm font-medium">Mensagem de saudacao</span>
          <Textarea
            rows={3}
            value={form.greetingMessage}
            maxLength={assistantConfigLimits.greetingMessage}
            onChange={event => setField('greetingMessage', event.target.value)}
            placeholder="Oi! Eu sou o assistente virtual da loja..."
            disabled={isLoading || isSaving}
          />
          <CharacterCounter
            value={form.greetingMessage}
            limit={assistantConfigLimits.greetingMessage}
          />
        </Label>

        <div className="grid gap-4">
          <div className="space-y-2">
            <p className="text-sm font-medium">Tom de voz</p>
            <SegmentedOptions
              value={form.tone}
              options={toneOptions}
              onChange={value => setField('tone', value)}
            />
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium">Tamanho das respostas</p>
            <SegmentedOptions
              value={form.responseLength}
              options={responseLengthOptions}
              onChange={value => setField('responseLength', value)}
            />
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium">Uso de emojis</p>
            <SegmentedOptions
              value={form.emojiUsage}
              options={emojiUsageOptions}
              onChange={value => setField('emojiUsage', value)}
            />
          </div>
        </div>

        <Label>
          <span className="text-sm font-medium">Instrucoes adicionais</span>
          <Textarea
            rows={5}
            value={form.additionalInstructions ?? ''}
            maxLength={assistantConfigLimits.additionalInstructions}
            onChange={event =>
              setField('additionalInstructions', event.target.value || null)
            }
            placeholder="Ex.: evite prometer prazo fixo, ofereca o cardapio quando o cliente perguntar por promocoes..."
            disabled={isLoading || isSaving}
          />
          <CharacterCounter
            value={form.additionalInstructions}
            limit={assistantConfigLimits.additionalInstructions}
          />
        </Label>

        <Label>
          <span className="text-sm font-medium">
            Mensagem para atendimento humano
          </span>
          <Textarea
            rows={3}
            value={form.fallbackMessage}
            maxLength={assistantConfigLimits.fallbackMessage}
            onChange={event => setField('fallbackMessage', event.target.value)}
            placeholder="Nao tenho certeza sobre isso. Posso chamar uma pessoa da equipe..."
            disabled={isLoading || isSaving}
          />
          <CharacterCounter
            value={form.fallbackMessage}
            limit={assistantConfigLimits.fallbackMessage}
          />
        </Label>

        <div className="rounded-md border bg-background/60 p-3">
          <div className="mb-3 flex items-center gap-2">
            <Bot className="h-4 w-4 text-primary" />
            <p className="text-sm font-medium">Teste interno</p>
            <Badge variant="secondary">
              Nenhum cliente recebe esta mensagem
            </Badge>
          </div>
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
            <Label>
              <span className="text-sm font-medium">Mensagem de teste</span>
              <Textarea
                rows={2}
                value={testMessage}
                maxLength={assistantConfigLimits.testMessage}
                onChange={event => setTestMessage(event.target.value)}
                disabled={isTesting || isSaving}
              />
              <CharacterCounter
                value={testMessage}
                limit={assistantConfigLimits.testMessage}
              />
            </Label>
            <Button
              onClick={handleTest}
              disabled={isTesting || isSaving || isLoading}
              isLoading={isTesting || isSaving}
              className="w-full md:w-auto"
            >
              <Send className="h-4 w-4" />
              Salvar e testar
            </Button>
          </div>

          {testResult?.reply && (
            <div className="mt-3 space-y-2">
              <div className="ml-auto max-w-[85%] rounded-lg rounded-br-sm bg-primary px-3 py-2 text-sm text-primary-foreground">
                {testMessage}
              </div>
              <div className="max-w-[85%] whitespace-pre-line rounded-lg rounded-bl-sm border bg-card px-3 py-2 text-sm text-card-foreground">
                {testResult.reply}
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-col-reverse gap-2 border-t pt-4 md:flex-row md:justify-between">
          <Button
            variant="outline"
            onClick={handleRestoreDefault}
            disabled={isLoading || isSaving}
          >
            <RotateCcw className="h-4 w-4" />
            Restaurar padrao
          </Button>
          <Button
            onClick={handleSave}
            disabled={isLoading || isSaving || !hasChanges}
            isLoading={isSaving}
          >
            <Save className="h-4 w-4" />
            Salvar personalidade
          </Button>
        </div>
      </div>
    </div>
  )
}
