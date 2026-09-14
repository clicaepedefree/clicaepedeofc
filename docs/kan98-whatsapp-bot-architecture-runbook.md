# KAN-98 - Arquitetura e operacao do robo WhatsApp

## Objetivo

Este documento consolida a versao entregue do robo de WhatsApp para facilitar
manutencao, suporte, implantacao e evolucao. Ele deve ser usado por produto,
suporte, operacao e desenvolvimento para entender o fluxo ponta a ponta, ativar
uma loja piloto, diagnosticar incidentes e decidir quando interromper o robo.

Documentos complementares:

- `docs/kan81-whatsapp-bot-domain.md`: fundacao de dados.
- `docs/kan82-whatsapp-session-connection.md`: conexao Evolution por QR Code.
- `docs/kan95-whatsapp-security-lgpd.md`: seguranca, LGPD, retencao e opt-out.
- `docs/kan97-whatsapp-rollout-control.md`: rollout, piloto e rollback.

## Escopo entregue

O MVP cobre:

- conexao de numero WhatsApp por loja via Evolution API;
- recebimento de webhooks da Evolution;
- persistencia multiempresa de contatos, conversas e mensagens;
- configuracao do assistente por loja;
- orquestracao LLM compativel com OpenAI Responses API;
- ferramentas internas para cardapio, horarios, modalidades, pagamentos e link;
- fallback seguro para audio, mensagem nao suportada, falha de provedor e baixa
  confianca;
- handoff para atendimento humano;
- fila transacional para mensagens de status, cashback, fidelidade, manual e
  fallback;
- diagnostico operacional no painel;
- rollout controlado por variaveis server-side.

Fora do MVP atual:

- gateway de pagamento do SaaS;
- campanhas promocionais completas;
- painel avancado de SLA por atendente;
- scheduler recorrente curto para fila transacional em Vercel Hobby. A rota
  existe, mas a decisao de agendamento ficou registrada na KAN-125.

## Arquitetura de alto nivel

Fluxo de conexao:

1. Operador da loja abre `Configuracoes > Integracoes > WhatsApp`.
2. Painel chama server actions em `src/features/whatsapp-bot/api.ts`.
3. Backend cria ou reaproveita instancia Evolution com nome
   `clica-store-{storeId}-wa-{numberId}`.
4. Evolution retorna QR Code e status.
5. Webhook `POST /api/webhooks/whatsapp/evolution` atualiza a sessao.
6. Quando a Evolution reporta `open`, a sessao fica `connected`.

Fluxo de mensagem inbound:

1. Cliente envia mensagem para o numero conectado.
2. Evolution chama `POST /api/webhooks/whatsapp/evolution`.
3. Webhook valida `WHATSAPP_EVOLUTION_WEBHOOK_SECRET`.
4. Payloads `fromMe` sao ignorados para evitar resposta em cima da propria
   mensagem enviada pela loja/robo.
5. `processWhatsappInboundMessage` normaliza telefone, contato, conversa e
   mensagem.
6. Opt-out promocional e detectado a partir da mensagem do cliente quando
   aplicavel.
7. `runWhatsappAssistantOrchestrator` avalia rollout, sessao, configuracao,
   tipo de mensagem, conversa e handoff.
8. Se permitido, carrega contexto real da loja, chama a LLM e envia resposta via
   Evolution.
9. Resposta, falhas e decisoes de fallback ficam registradas em mensagens,
   conversas e diagnosticos.

Fluxo transacional:

1. Algum evento do produto chama `enqueueWhatsappTransactionalMessage`.
2. A fila grava `whatsapp_bot_transactional_events` com chave idempotente por
   loja.
3. `GET /api/cron/whatsapp/transactional` processa eventos vencidos.
4. O envio usa a sessao conectada da loja e registra tentativas em
   `whatsapp_bot_delivery_attempts`.
5. Falhas temporarias sao reagendadas com backoff; falhas permanentes sao
   descartadas.

## Entidades e estados

Todas as tabelas usam `store_id` obrigatorio e chaves compostas com `store_id`
nas relacoes filhas para impedir cruzamento entre lojas.

| Tabela | Finalidade | Estados principais |
| --- | --- | --- |
| `whatsapp_bot_numbers` | Numero WhatsApp cadastrado por loja | `inactive`, `active`, `disconnected`, `error` |
| `whatsapp_bot_sessions` | Sessao tecnica Evolution | `disconnected`, `pending_qr`, `connecting`, `connected`, `paused`, `error` |
| `whatsapp_bot_assistant_configs` | Identidade e comportamento do assistente | `draft`, `active`, `paused`; `test_mode_enabled` controla teste |
| `whatsapp_bot_contacts` | Contatos por loja e opt-out promocional | possui `promotional_opt_out_at` |
| `whatsapp_bot_conversations` | Conversa entre contato e loja | modo `automatic` ou `human`; status `open`, `pending_human`, `closed`, `blocked` |
| `whatsapp_bot_messages` | Mensagens inbound, outbound e internas | `received`, `queued`, `sent`, `delivered`, `read`, `failed`, `skipped` |
| `whatsapp_bot_transactional_events` | Fila idempotente de notificacoes | `queued`, `processing`, `sent`, `failed`, `discarded` |
| `whatsapp_bot_delivery_attempts` | Tentativas de entrega da fila | `attempted`, `succeeded`, `failed`, `skipped` |

Eventos transacionais aceitos:

- `order_status`
- `cashback`
- `loyalty`
- `manual`
- `fallback`

## APIs, actions e rotas

### Painel da loja

Arquivo: `src/features/whatsapp-bot/api.ts`.

Todas as server actions validam `integrations.manage` para a loja antes de ler
ou alterar dados:

- `getWhatsappConnectionStatus`
- `startWhatsappConnection`
- `renewWhatsappConnectionQrCode`
- `pauseWhatsappConnection`
- `disconnectWhatsappConnection`
- `getWhatsappAssistantConfig`
- `saveWhatsappAssistantConfig`
- `testWhatsappAssistantConfig`
- `getWhatsappHumanHandoffQueue`
- `returnWhatsappConversationToBot`
- `getWhatsappOperationalDiagnostics`

### Webhook Evolution

Rota: `POST /api/webhooks/whatsapp/evolution`.

Autenticacao:

- header `Authorization: Bearer <WHATSAPP_EVOLUTION_WEBHOOK_SECRET>`; ou
- header `x-clica-webhook-secret: <WHATSAPP_EVOLUTION_WEBHOOK_SECRET>`.

Respostas importantes:

- `401 invalid_signature`: segredo ausente/incorreto.
- `400 malformed_payload`: corpo nao e JSON valido.
- `400 missing_instance`: payload sem instancia.
- `200 accepted`: inbound reconhecido sem criar mensagem nova, como
  duplicidade/idempotencia.
- `202 accepted`: evento aceito com criacao/processamento de mensagem ou
  atualizacao de sessao.
- `500 processing_error`: falha interna sanitizada nos logs.

Nunca comentar no Jira ou logar payload bruto com token, QR Code, telefone real
ou metadados sensiveis.

### Fila transacional

Rota: `GET /api/cron/whatsapp/transactional`.

Autenticacao:

- `Authorization: Bearer <CRON_SECRET>`.

Observacao operacional:

- a rota esta pronta;
- em Vercel Hobby nao ha cron subdiario;
- ate a KAN-125, o acionamento curto deve ser manual ou por scheduler externo
  autenticado.

## Variaveis de ambiente

| Variavel | Obrigatoria quando | Uso |
| --- | --- | --- |
| `WHATSAPP_EVOLUTION_API_BASE_URL` | conectar/enviar via Evolution | URL base da Evolution API |
| `WHATSAPP_EVOLUTION_API_KEY` | conectar/enviar via Evolution | chave global server-side |
| `WHATSAPP_EVOLUTION_WEBHOOK_SECRET` | receber webhooks Evolution | valida origem do webhook |
| `WHATSAPP_ASSISTANT_LLM_API_KEY` | responder com LLM sem usar chave geral | chave do provedor LLM do robo |
| `OPENAI_API_KEY` | fallback quando a chave especifica nao existe | chave compativel com OpenAI |
| `WHATSAPP_ASSISTANT_LLM_URL` | opcional | URL do provider, padrao OpenAI Responses API |
| `WHATSAPP_ASSISTANT_LLM_MODEL` | respostas automaticas com LLM | modelo usado pelo assistente |
| `WHATSAPP_BOT_ROLLOUT_MODE` | rollout controlado | `off`, `pilot` ou `all`; ausente/invalido preserva `all` |
| `WHATSAPP_BOT_PILOT_STORE_IDS` | modo `pilot` | lista de lojas liberadas, ex.: `9,12` |
| `CRON_SECRET` | rodar fila transacional | protege rotas cron |
| `NEXT_PUBLIC_APP_URL`, `APP_URL` ou `NEXT_PUBLIC_APP_DOMAIN` | gerar links publicos e webhook | base publica usada em URL do app, cardapio e webhook |
| `IFOOD_TOKEN_ENCRYPTION_KEY` | criptografia server-side atual | chave usada pela camada generica de criptografia tambem reaproveitada para metadata sensivel |

Segredos devem ficar apenas em variaveis server-side. Nao colocar valores reais
em docs, Jira, fixtures, comentarios ou screenshots.

O `vercel.json` agenda somente `/api/cron/billing` nesta versao. A fila
transacional de WhatsApp nao esta agendada ali por causa da limitacao do plano
Hobby para cron subdiario.

## Onde a operacao verifica cada coisa

O objetivo operacional e permitir diagnostico sem apoio de desenvolvimento para
casos comuns. A separacao de responsabilidade e:

| Necessidade | Onde verificar/agir | Perfil esperado |
| --- | --- | --- |
| Conectar numero, renovar QR, pausar ou desconectar | App: `Configuracoes > Integracoes > WhatsApp` | Dono/operador da loja com permissao `integrations.manage` |
| Ajustar nome, saudacao, tom, fallback e modo teste | App: card de configuracao do assistente | Dono/operador da loja com permissao `integrations.manage` |
| Ver conversas em atendimento humano | App: aba/fila de handoff do WhatsApp | Operacao da loja |
| Ver diagnostico de sessao, mensagens e fila | App: card de diagnostico operacional do WhatsApp | Operacao da loja ou suporte Clica e Pede |
| Confirmar rollout por loja | Vercel env vars ou runbook de rollout KAN-97 | Suporte tecnico/ops com acesso a Vercel |
| Confirmar LLM configurada | Vercel env vars, sem revelar valores | Suporte tecnico/ops com acesso a Vercel |
| Acionar fila transacional manualmente | Cliente HTTP seguro usando `CRON_SECRET`, sem colar segredo em Jira/chat | Suporte tecnico/ops com acesso ao segredo |
| Investigar dado inconsistente no banco | Supabase com consulta somente leitura quando possivel | Suporte tecnico/ops autorizado |
| Alterar schema, migration ou codigo | Repo/PR | Desenvolvimento |

Regra pratica: se o problema for loja especifica, comece pelo app. Se o problema
for variavel, segredo, scheduler ou falha ampla de provedor, suporte tecnico/ops
usa Vercel/Supabase com acesso controlado. Desenvolvimento entra quando houver
bug de codigo, migration ou necessidade de nova feature.

## LLM, ferramentas e guardrails

Provider:

- implementado em `src/features/whatsapp-bot/llm-provider.ts`;
- compativel com OpenAI Responses API;
- timeout padrao de 12 segundos;
- `max_output_tokens` de 450;
- temperatura 0.3;
- ate 4 chamadas de ferramenta por resposta.

Ferramentas internas disponiveis para a LLM:

- `search_menu_items`: busca produtos, descricoes, precos, disponibilidade,
  adicionais e variacoes da loja da conversa;
- `get_store_hours`: consulta horarios por modalidade;
- `get_store_payments_and_modalities`: consulta pagamentos e modalidades;
- `get_digital_menu_link`: retorna link correto do cardapio digital.

Guardrails:

- a loja da conversa define o escopo. O cliente nao pode trocar `store_id`,
  slug ou loja por mensagem;
- preco, disponibilidade, horarios, pagamentos e link devem vir das
  ferramentas internas ou do contexto carregado;
- nomes e mensagens de cliente entram como dados nao confiaveis;
- prompts, tokens, QR Codes e segredos nunca devem ser revelados;
- item indisponivel nao pode ser apresentado como disponivel;
- quando faltar informacao essencial, encaminhar para humano ou usar fallback.

Intencoes classificadas:

- `menu`
- `price`
- `business_hours`
- `payment`
- `order`
- `support`
- `human_support`
- `unknown`

## Regras de negocio

### Cardapio e produtos

O robo pode responder sobre produtos publicados, categorias, descricoes,
precos, estoque, adicionais e indisponibilidade. A resposta deve refletir a loja
da conversa e respeitar:

- categoria indisponivel;
- produto indisponivel;
- estoque zerado;
- produtos sem resultado para a consulta.

Quando o cliente quiser comprar, o robo deve incentivar o uso do cardapio
digital e, quando aplicavel, incluir link com atribuicao do WhatsApp. O CTA usa
atribuicao `utm_source=whatsapp_bot`, `utm_medium=assistant` e campanha de
cardapio digital para manter rastreabilidade do pedido.

### Horarios, modalidades e status operacional

O robo usa configuracoes do cardapio digital e horarios da loja. Ele deve
respeitar:

- cardapio publicado;
- `is_accepting_orders`;
- status operacional diferente de `CLOSED` e `PAUSED`;
- restricoes `DELIVERY_ONLY` e `TAKEOUT_ONLY`;
- agendamento quando habilitado.

Se horarios nao estiverem cadastrados, responder que a informacao nao esta
configurada e oferecer atendimento humano.

### Pagamentos

O robo pode informar formas de pagamento permitidas por modalidade, incluindo
instrucoes e orientacao de comprovante quando configuradas. Ele nao valida
pagamento real, nao confirma compensacao e nao substitui gateway.

Pedidos com comprovante, estorno, reembolso, cobranca, Pix ou falha de cartao
devem acionar handoff quando houver risco operacional.

### Pedidos

O robo pode orientar o cliente a abrir o cardapio digital e acompanhar pedido,
mas o ciclo profundo de pedido continua no app/cardapio digital. Notificacoes
transacionais de status usam a fila `order_status` quando enfileiradas.
Na versao atual, notificacoes de status sao voltadas a pedidos do cardapio
digital, nas modalidades `DELIVERY` e `TAKEOUT`, quando ha telefone do cliente.

### Cashback e fidelidade

Eventos `cashback` e `loyalty` existem na fila transacional para mensagens
operacionais futuras. Eles devem respeitar opt-out quando forem promocionais.
Mensagens diretamente ligadas a pedido podem ser transacionais. Para evitar
promessa indevida, beneficios devem ser comunicados apenas quando confirmados no
snapshot/resultado do pedido.

### Opt-out

`promotional_opt_out_at` bloqueia mensagens promocionais, mas nao bloqueia
mensagens transacionais do pedido. A deteccao de opt-out vem da ingestao de
contato e deve ser preservada por loja.

## Conexao, reconexao, pausa e desconexao

### Conectar uma loja

1. Confirmar que a loja tem modulo WhatsApp habilitado e permissao
   `integrations.manage`.
2. Confirmar variaveis Evolution e webhook configuradas.
3. Abrir `Configuracoes > Integracoes > WhatsApp`.
4. Informar numero e nome exibido.
5. Ler QR Code pelo WhatsApp.
6. Aguardar sessao ficar `connected`.
7. Salvar configuracao do assistente.
8. Desligar modo teste somente quando a loja estiver pronta para responder.
9. Enviar mensagem externa de teste.
10. Conferir contato, conversa, inbound e outbound no diagnostico.

### Renovar QR Code

Use renovacao quando:

- a sessao estiver `pending_qr` com QR expirado;
- a Evolution pedir nova leitura;
- o usuario nao conseguiu ler o QR anterior.

Nao criar outra instancia manualmente sem antes verificar se ja existe sessao
ativa ou pendente para a loja.

### Pausar robo

Pausa esperada:

- loja quer interromper automacao sem perder configuracao;
- atendimento humano assumiu temporariamente;
- rollout deve parar sem apagar dados.

Efeito esperado:

- novas respostas automaticas nao devem ser enviadas;
- mensagens recebidas continuam rastreaveis;
- dados de contato, conversa e auditoria permanecem.

### Desconectar robo

Use desconexao quando o numero nao deve mais operar na loja. A desconexao nao
deve apagar historico como primeira resposta operacional.

## Handoff humano

O robo encaminha para humano quando:

- cliente pede atendente, humano, gerente ou pessoa;
- cliente pede cancelamento;
- ha reclamacao, atraso, problema ou insatisfacao;
- ha atencao de pagamento, comprovante, estorno, reembolso ou cobranca;
- intencao e desconhecida com baixa confianca/fallback recorrente;
- provedor LLM falha em situacao que exige continuidade.

Estados esperados:

- conversa muda para modo `human`;
- status vira `pending_human`;
- mensagem interna registra motivo;
- painel de handoff lista conversa;
- operador pode retornar conversa ao robo com `returnWhatsappConversationToBot`.

## Diagnostico operacional

Painel:

- `WhatsappOperationalDiagnosticsCard`
- `WhatsappHumanHandoffCard`
- `WhatsappConnectionCard`
- `WhatsappAssistantConfigCard`

Indicadores esperados:

- sessao atual e status;
- ultimas mensagens;
- conversas abertas e em handoff;
- eventos transacionais em fila, enviados, falhos ou descartados;
- erros sanitizados;
- contadores de inbound, outbound, fallback, CTA e notificacoes.

Retencao e auditoria esperadas:

- QR Code expirado: limpeza apos 15 minutos quando nao conectado;
- conversas abertas: 90 dias;
- conversas fechadas ou bloqueadas: 30 dias;
- eventos transacionais e tentativas: 180 dias;
- contatos inativos sem pendencia: 365 dias;
- auditoria em `internal_operation_audit_logs` para conectar, renovar QR,
  pausar, desconectar, atualizar configuracao, devolver conversa ao robo e
  pruning.

Para diagnosticar uma loja, confirmar nesta ordem:

1. No app, sessao esta `connected`?
2. No app, configuracao do assistente esta `active`?
3. No app, `test_mode_enabled` esta desligado?
4. No app, diagnostico mostra conversa `open` e modo `automatic`?
5. No app, ultima mensagem inbound e `text`?
6. No app, ha erro sanitizado recente no diagnostico?
7. No app, fila/handoff indica atendimento humano pendente?
8. Em Vercel, `WHATSAPP_BOT_ROLLOUT_MODE` permite a loja?
9. Em Vercel, `WHATSAPP_BOT_PILOT_STORE_IDS` contem a loja se o modo for
   `pilot`?
10. Em Vercel, LLM esta configurada com API key e modelo, sem expor valores?
11. Em Evolution/diagnostico, o provedor esta retornando sucesso no envio?
12. Se for notificacao transacional, o evento esta vencido e abaixo de
    `max_attempts`?

## Runbook de incidentes

### Sessao caiu

Sintomas:

- sessao `disconnected`, `connecting`, `pending_qr` ou `error`;
- fila transacional com erro `session_disconnected`;
- cliente envia mensagem e nao recebe resposta.

Acoes:

1. Conferir painel de conexao.
2. Se `pending_qr`, renovar QR Code e pedir leitura pela loja.
3. Se `connecting`, aguardar reconexao dentro do cooldown.
4. Se `error`, verificar erro sanitizado no diagnostico.
5. Pausar robo se houver risco de resposta parcial.
6. Validar com mensagem externa depois de reconectar.

### Fila transacional parada

Sintomas:

- eventos `queued` ou `failed` com `next_attempt_at` no passado;
- status de pedido nao notifica cliente;
- rota cron nao executou.

Acoes:

1. Conferir se `CRON_SECRET` existe.
2. Acionar `GET /api/cron/whatsapp/transactional` com `Authorization: Bearer`
   usando ferramenta interna/cliente HTTP seguro. Nunca colar o valor do
   segredo em Jira, comentario de PR, chat ou screenshot.
3. Verificar resposta da rota com contadores `sent`, `failed` e `discarded`.
4. Se Vercel Hobby, lembrar que cron subdiario nao roda automaticamente.
5. Se falha for temporaria, aguardar backoff de 1, 5, 15 ou 60 minutos.
6. Se falha for permanente, revisar payload, telefone e sessao.
7. Abrir bug se evento valido ficar preso apos tentativas.

### Falha do provedor Evolution

Sintomas:

- erros `WHATSAPP_EVOLUTION`;
- HTTP 408, 409, 429 ou 5xx;
- tentativas registradas como `failed`.

Acoes:

1. Confirmar se o problema e pontual ou recorrente.
2. Revisar status da sessao.
3. Evitar reenviar manualmente mensagem nao idempotente.
4. Deixar fila aplicar retry.
5. Pausar rollout se muitas lojas forem afetadas.
6. Registrar bug com horario, loja, evento e erro sanitizado.

### Falha ou ausencia de LLM

Sintomas:

- erro `provider_not_configured`, `provider_timeout`,
  `provider_http_error`, `provider_empty_response` ou `provider_failed`;
- respostas caem para fallback;
- conversa entra em handoff por baixa confianca.

Acoes:

1. Confirmar `WHATSAPP_ASSISTANT_LLM_MODEL`.
2. Confirmar chave `WHATSAPP_ASSISTANT_LLM_API_KEY` ou `OPENAI_API_KEY`.
3. Confirmar se `WHATSAPP_ASSISTANT_LLM_URL` foi alterada.
4. Testar configuracao pelo painel.
5. Se a loja estiver em operacao real, pausar robo ou assumir handoff.

### Resposta incorreta com risco financeiro

Exemplos:

- preco divergente;
- produto indisponivel informado como disponivel;
- modalidade errada;
- pagamento ou comprovante interpretado como confirmado;
- dados de outra loja.

Acoes:

1. Alterar `WHATSAPP_BOT_ROLLOUT_MODE=off` se houver risco amplo.
2. Pausar a sessao da loja afetada.
3. Preservar mensagens e eventos para auditoria.
4. Abrir bug com evidencia sanitizada.
5. Corrigir regra, ferramenta ou dados de loja antes de reativar.

## Exemplos seguros

Mensagem inbound ficticia:

```json
{
  "instance": "clica-store-999-wa-123",
  "data": {
    "key": { "id": "MSG_EXEMPLO_001", "fromMe": false },
    "message": { "conversation": "Oi, quais lanches tem hoje?" },
    "pushName": "Cliente Exemplo",
    "messageTimestamp": 1760000000
  }
}
```

Evento transacional ficticio:

```json
{
  "eventType": "order_status",
  "eventId": "pedido-exemplo-123",
  "recipientPhone": "5511999999999",
  "payload": {
    "text": "Seu pedido foi recebido e esta em preparo."
  }
}
```

Nao usar em exemplos:

- telefones reais;
- nomes reais de cliente;
- CPF/CNPJ;
- QR Code;
- token de instancia;
- chaves `WHATSAPP_*`, `OPENAI_API_KEY` ou `CRON_SECRET`;
- payload bruto de incidente.

## Arquivos de referencia

- `src/features/whatsapp-bot/db.ts`: persistencia, orquestracao, fila,
  diagnostico, conexao e webhook interno.
- `src/features/whatsapp-bot/api.ts`: server actions protegidas por permissao.
- `src/app/api/webhooks/whatsapp/evolution/route.ts`: entrada da Evolution.
- `src/app/api/cron/whatsapp/transactional/route.ts`: processamento da fila.
- `src/features/whatsapp-bot/evolution-client.ts`: cliente Evolution.
- `src/features/whatsapp-bot/llm-provider.ts`: provider LLM.
- `src/features/whatsapp-bot/store-tools-policy.ts`: ferramentas de loja.
- `src/features/whatsapp-bot/digital-menu-cta-policy.ts`: CTA do cardapio.
- `src/features/order/status-notifications.ts`: notificacoes de status.
- `src/features/order/benefit-notifications.ts`: cashback/fidelidade.
- `src/services/db/schema/whatsapp-bot-*.ts`: schemas Drizzle.
- `supabase/migrations/20260901014743_kan81_whatsapp_bot_domain.sql`:
  estrutura inicial.
- `supabase/migrations/20260909024500_kan95_whatsapp_security_lgpd.sql`:
  seguranca, LGPD, auditoria e retencao.

## Checklist operacional de aceite

Antes de considerar uma loja pronta:

- [ ] Modulo WhatsApp habilitado para a loja.
- [ ] Numero conectado e sessao `connected`.
- [ ] Assistente salvo como `active`.
- [ ] Modo teste desligado apenas apos validacao.
- [ ] Rollout libera a loja.
- [ ] Mensagem externa de texto gera inbound, conversa e resposta.
- [ ] Audio, imagem ou documento nao quebram o fluxo e acionam fallback/handoff.
- [ ] Pedido/pagamento sensivel aciona handoff quando necessario.
- [ ] Diagnostico mostra mensagens, handoffs e fila sem dados sensiveis.
- [ ] Fila transacional tem plano de acionamento definido.

## Decisoes pendentes

- KAN-125: escolher scheduler recorrente para a fila transacional.
- Definir provedor/modelo final da LLM para producao.
- Definir SLA de atendimento humano e responsaveis por loja.
- Definir politica comercial para mensagens promocionais alem do opt-out.
- Definir painel avancado de metricas e alertas.
- Definir estrategia de transcricao de audio. No MVP, o robo nao depende de
  ouvir audio para continuar seguro.
