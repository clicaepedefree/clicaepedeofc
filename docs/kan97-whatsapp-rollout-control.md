# KAN-97 - Rollout controlado e reversao do robo WhatsApp

## Objetivo

Liberar o robo de atendimento WhatsApp primeiro para lojas piloto, com ativacao
por loja, monitoramento minimo e caminho claro de interrupcao. O rollout deve
reduzir risco operacional sem perder rastreabilidade de contatos, mensagens,
eventos transacionais e auditoria.

## Feature flag por loja

O runtime do robo usa duas variaveis server-side:

| Variavel | Valores | Uso |
| --- | --- | --- |
| `WHATSAPP_BOT_ROLLOUT_MODE` | `off`, `pilot`, `all` | Controla se o robo responde clientes automaticamente. Valor invalido ou ausente preserva comportamento atual: `all`. |
| `WHATSAPP_BOT_PILOT_STORE_IDS` | Lista de IDs separados por virgula | Lojas autorizadas quando o modo e `pilot`. Ex.: `9,12,31`. |

Regras de resposta automatica:

- `off`: nenhuma loja recebe novas respostas automaticas.
- `pilot`: apenas lojas presentes em `WHATSAPP_BOT_PILOT_STORE_IDS` recebem
  respostas automaticas.
- `all`: qualquer loja tecnicamente apta pode receber respostas automaticas.

Mesmo com rollout liberado, o robo so responde quando:

- a sessao WhatsApp da loja esta `connected`;
- a configuracao do assistente esta `active`;
- `test_mode_enabled` esta desligado;
- a conversa nao esta pausada para humano;
- a mensagem recebida e texto inbound.

Mensagens recebidas continuam sendo persistidas quando a loja esta fora do
piloto, em modo `off`, pausada ou desconectada. Isso preserva historico,
diagnostico e LGPD sem enviar novas respostas indevidas.

A mesma flag tambem protege mensagens transacionais do WhatsApp. Novos eventos
nao sao enfileirados para lojas fora do rollout; eventos ja pendentes ficam
adiados com erro operacional no proprio evento, sem consumir tentativa real de
entrega, e permanecem visiveis em diagnostico para nova tentativa quando a loja
voltar ao rollout.

## Grupo piloto

### Criterios de entrada

Uma loja entra no piloto quando todos os itens abaixo estiverem verdadeiros:

- responsavel da loja alinhado com suporte/operacao;
- numero WhatsApp conectado e validado por QR Code;
- cardapio digital publicado e aceitando pedidos;
- produtos, horarios, modalidades e formas de pagamento configurados;
- fallback humano definido na configuracao do assistente;
- fila de atendimento humano monitorada pela equipe;
- loja aceita monitoramento de erros e possivel interrupcao imediata.

### Piloto inicial recomendado

- `Ccocobongo` (`store_id=9`) para QA funcional e smoke de integracao.
- Ate 3 lojas reais com alto acompanhamento operacional.
- Nunca liberar toda a base antes de 48 horas sem incidentes P0/P1.

## Checklist de conexao e ativacao

Antes de ativar uma loja piloto:

- [ ] Confirmar `store_id` correto.
- [ ] Definir `WHATSAPP_BOT_ROLLOUT_MODE=pilot`.
- [ ] Incluir a loja em `WHATSAPP_BOT_PILOT_STORE_IDS`.
- [ ] Confirmar modulo `whatsapp_bot` habilitado para a loja.
- [ ] Conectar numero via QR Code.
- [ ] Confirmar sessao `connected` no painel de integracoes.
- [ ] Salvar configuracao do assistente com modo teste desligado.
- [ ] Enviar mensagem de teste de cliente externo.
- [ ] Confirmar resposta automatica enviada.
- [ ] Confirmar contato, conversa e mensagem gravados com `store_id` correto.
- [ ] Confirmar que uma loja fora do piloto registra inbound, mas nao responde.
- [ ] Confirmar que `/api/cron/whatsapp/transactional` esta agendado e
      autenticado por `CRON_SECRET`.

## Monitoramento minimo

Durante o piloto, acompanhar pelo menos:

- taxa de mensagens inbound processadas;
- taxa de respostas automaticas enviadas;
- mensagens com `status=failed`;
- conversas em `pending_human`;
- eventos transacionais em `failed` ou `discarded`;
- sessoes em `connecting`, `pending_qr`, `paused` ou `error`;
- relatos de resposta com preco, horario, produto ou pedido incorreto.

Indicadores minimos de sucesso para expandir:

- 48 horas sem vazamento entre lojas;
- zero resposta enviada para loja fora do piloto;
- zero resposta automatica enviada com sessao pausada/desconectada;
- menos de 5% das mensagens com falha tecnica recorrente;
- equipe de suporte conseguindo assumir conversas `pending_human`;
- pedido vindo do CTA do robo rastreado corretamente no cardapio digital.

## Limites de uso

Limites operacionais durante piloto:

- ate 3 lojas reais simultaneas no primeiro ciclo;
- ate 1 numero WhatsApp conectado por loja;
- ate 80 itens resumidos no contexto do cardapio;
- ate 20 mensagens recentes por conversa para contexto interno;
- timeout de 12 segundos para chamada de LLM;
- processamento da fila transacional a cada 5 minutos;
- fallback seguro quando provedor LLM ou WhatsApp falhar.

Se qualquer limite for insuficiente, abrir nova tarefa antes de expandir.

## Gatilhos de interrupcao

Interromper o rollout imediatamente se ocorrer:

- mensagem de uma loja responder com dados de outra loja;
- resposta automatica enviada para loja fora do piloto;
- resposta automatica enviada com sessao `paused`, `disconnected` ou
  `pending_qr`;
- exposicao de token, QR Code, prompt interno ou dado sensivel;
- aumento de falhas de envio que possa confundir cliente final;
- fila humana acumulando sem responsavel;
- resposta operacional incorreta com risco financeiro para a loja.

## Rollback

### Rollback rapido sem deploy

1. Alterar `WHATSAPP_BOT_ROLLOUT_MODE=off`.
2. Redeployar/reativar variaveis no ambiente.
3. Confirmar que novos inbound continuam sendo gravados.
4. Confirmar que nenhuma nova mensagem outbound do bot e criada.
5. Monitorar conversas existentes e assumir manualmente quando necessario.

### Voltar para piloto restrito

1. Alterar `WHATSAPP_BOT_ROLLOUT_MODE=pilot`.
2. Manter apenas lojas seguras em `WHATSAPP_BOT_PILOT_STORE_IDS`.
3. Validar loja piloto e loja fora do piloto com mensagem real de teste.

### Rollback de aplicacao

1. Reverter ou promover deploy anterior na Vercel.
2. Manter `WHATSAPP_BOT_ROLLOUT_MODE=off` ate validar o deploy.
3. Reexecutar smoke de webhook, sessao, fila e painel.

### Rollback de dados

Nao apagar historico de mensagens, contatos ou auditoria como resposta padrao.
Preferir:

- pausar sessoes afetadas;
- marcar conversas para atendimento humano;
- deixar eventos transacionais em estado terminal quando forem duplicados ou
  invalidos;
- abrir bug com evidencias antes de qualquer limpeza manual.

## Validacao da KAN-97

A tarefa fica pronta quando:

- a policy de rollout bloqueia `off`, loja fora do piloto e sessao nao
  conectada;
- configuracao em draft/teste nao responde cliente;
- inbound continua rastreavel mesmo quando a resposta e bloqueada;
- o plano de piloto, interrupcao e rollback esta versionado;
- os testes automatizados cobrem o caminho de ativacao e bloqueio.
