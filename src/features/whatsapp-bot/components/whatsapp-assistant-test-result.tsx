import type { AssistantDraftTestResult } from '../hooks/use-whatsapp-assistant-config'

const statusLabels = {
  unavailable: 'Teste indisponivel',
  responded: 'Resposta do assistente',
  fallback: 'Resposta de contingencia',
  handoff: 'Atendimento humano indicado',
}

const statusDescriptions = {
  unavailable:
    'O assistente nao esta disponivel para gerar uma resposta neste teste.',
  responded: null,
  fallback:
    'O teste retornou uma resposta de contingencia, nao uma resposta gerada pelo assistente.',
  handoff: 'O teste indicou atendimento humano. Ninguem foi acionado.',
}

export function WhatsappAssistantTestResult({
  result,
}: {
  result: AssistantDraftTestResult
}) {
  const description =
    result.status === 'unavailable' &&
    result.reason === 'provider_not_configured'
      ? 'Nenhum provedor de IA foi configurado para o teste.'
      : result.status === 'unavailable' &&
          result.reason === 'budget_not_configured'
        ? 'O consumo de IA ainda nao foi liberado para o teste.'
        : statusDescriptions[result.status]

  return (
    <div
      role="status"
      aria-live="polite"
      className="min-w-0 space-y-3 border-t pt-3 text-sm [overflow-wrap:anywhere]"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-medium">{statusLabels[result.status]}</p>
        <span className="text-xs text-muted-foreground">
          {result.latencyMs} ms
        </span>
      </div>
      <dl className="space-y-2">
        <div>
          <dt className="text-xs text-muted-foreground">Mensagem testada</dt>
          <dd className="whitespace-pre-wrap">{result.message}</dd>
        </div>
        {result.status === 'responded' && result.reply && (
          <div>
            <dt className="text-xs text-muted-foreground">
              {result.assistantName}
            </dt>
            <dd className="whitespace-pre-wrap">{result.reply}</dd>
          </div>
        )}
        {result.status === 'fallback' && result.reply && (
          <div>
            <dt className="text-xs text-muted-foreground">
              Mensagem de contingencia
            </dt>
            <dd className="whitespace-pre-wrap">{result.reply}</dd>
          </div>
        )}
      </dl>
      {description && <p className="text-muted-foreground">{description}</p>}
    </div>
  )
}
