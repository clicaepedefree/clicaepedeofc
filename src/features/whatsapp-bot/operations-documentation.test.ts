import { readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('KAN-98 whatsapp bot operations documentation', () => {
  const doc = readFileSync(
    join(process.cwd(), 'docs/kan98-whatsapp-bot-architecture-runbook.md'),
    'utf8'
  )

  test('documents architecture, data model, APIs and operational runbooks', () => {
    const requiredSections = [
      '## Arquitetura de alto nivel',
      '## Entidades e estados',
      '## APIs, actions e rotas',
      '## Variaveis de ambiente',
      '## Onde a operacao verifica cada coisa',
      '## LLM, ferramentas e guardrails',
      '## Regras de negocio',
      '## Conexao, reconexao, pausa e desconexao',
      '## Handoff humano',
      '## Diagnostico operacional',
      '## Runbook de incidentes',
      '## Exemplos seguros',
      '## Decisoes pendentes',
    ]

    for (const section of requiredSections) {
      expect(doc).toContain(section)
    }
  })

  test('covers the delivered WhatsApp bot surfaces and failure modes', () => {
    const requiredTerms = [
      'whatsapp_bot_numbers',
      'whatsapp_bot_sessions',
      'whatsapp_bot_assistant_configs',
      'whatsapp_bot_contacts',
      'whatsapp_bot_conversations',
      'whatsapp_bot_messages',
      'whatsapp_bot_transactional_events',
      'whatsapp_bot_delivery_attempts',
      'POST /api/webhooks/whatsapp/evolution',
      'GET /api/cron/whatsapp/transactional',
      'WHATSAPP_EVOLUTION_WEBHOOK_SECRET',
      'WHATSAPP_ASSISTANT_LLM_MODEL',
      'WHATSAPP_BOT_ROLLOUT_MODE',
      'CRON_SECRET',
      'search_menu_items',
      'get_store_hours',
      'get_store_payments_and_modalities',
      'get_digital_menu_link',
      'Sessao caiu',
      'Fila transacional parada',
      'Falha do provedor Evolution',
      'Falha ou ausencia de LLM',
      'Resposta incorreta com risco financeiro',
      'promotional_opt_out_at',
      '200 accepted',
      'KAN-125',
    ]

    for (const term of requiredTerms) {
      expect(doc).toContain(term)
    }
  })

  test('uses only fictitious examples and does not expose obvious sensitive values', () => {
    expect(doc).toContain('Cliente Exemplo')
    expect(doc).toContain('5511999999999')
    expect(doc).not.toContain('+55 (13) 991840862')
    expect(doc).not.toContain('qaclicapede+clerk_test@gmail.com')
    expect(doc).not.toMatch(/0x4[A-Za-z0-9_-]{20,}/)
    expect(doc).not.toMatch(/\bsk-[A-Za-z0-9_-]{16,}/)
    expect(doc).not.toMatch(/Bearer\s+(?!<)[A-Za-z0-9._-]{10,}/)
    expect(doc).not.toMatch(
      /(WHATSAPP_EVOLUTION_API_KEY|WHATSAPP_EVOLUTION_WEBHOOK_SECRET|WHATSAPP_ASSISTANT_LLM_API_KEY|OPENAI_API_KEY|CRON_SECRET)\s*=\s*["']?[A-Za-z0-9._:/+=-]{8,}/
    )
    expect(doc).not.toMatch(/\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/)
    expect(doc).not.toMatch(/\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b/)
    expect(doc).not.toMatch(/data:image\/(?:png|jpeg);base64,/i)
  })
})
