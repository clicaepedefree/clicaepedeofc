# KAN-82 - Conexao WhatsApp por QR Code

## Escopo

A KAN-82 implementa a camada server-side para conectar uma loja a uma sessao
WhatsApp compativel com Evolution API:

- criacao de instancia por loja e numero;
- geracao/renovacao de QR Code sem criar sessao duplicada;
- persistencia dos estados da sessao;
- webhook para atualizacao de QR Code e status de conexao;
- reconexao controlada para quedas temporarias;
- pausa e desconexao sem apagar configuracoes do robo.

## Variaveis de ambiente

- `WHATSAPP_EVOLUTION_API_BASE_URL`: URL base da Evolution API.
- `WHATSAPP_EVOLUTION_API_KEY`: chave global server-side para criar instancias.
- `WHATSAPP_EVOLUTION_WEBHOOK_SECRET`: segredo usado pelo webhook da Evolution.

O token retornado por instancia pela Evolution fica criptografado no metadata da
sessao. Ele nao deve ser exposto ao cliente, ao Jira, aos logs ou ao codigo fonte.

## Endpoints e acoes

- Server actions em `src/features/whatsapp-bot/api.ts` exigem
  `integrations.manage` na loja.
- Webhook externo:
  `POST /api/webhooks/whatsapp/evolution`.
- Instancias Evolution usam o formato:
  `clica-store-{storeId}-wa-{numberId}`.

## Estados

- `pending_qr`: aguardando leitura ou nova leitura.
- `connecting`: queda temporaria com reconexao controlada em andamento.
- `connected`: Evolution reportou `open`.
- `disconnected`: sessao sem conexao ativa.
- `paused`: robo pausado pela loja sem apagar configuracao.
- `error`: estado desconhecido ou falha tecnica.

## Limites de seguranca

- Toda operacao autenticada recebe `storeId` e valida permissao da loja.
- Atualizacoes vindas de webhook resolvem a sessao pelo `provider_session_id` e
  reaplicam sempre o `store_id` do registro encontrado.
- Reconexao automatica tem cooldown e limite de tentativas salvos no metadata.
- QR Code e tokens sao tratados como dados sensiveis.

## Fora do escopo

- Painel visual da conexao e exibicao do QR Code: KAN-83.
- Processamento de mensagens recebidas: KAN-85.
- Orquestracao com LLM: KAN-86.
- Ferramentas da IA para dados reais da loja: KAN-87.

