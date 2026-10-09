# KAN-136 - Resultados efetivamente executados

## Conclusao e corte

**PARTIAL / NAO DONE.** Corte de evidencia: 2026-10-09 05:09:29 UTC.
Branch de trabalho: `codex/kan-136-whatsapp-functional-qa`. Browser registrado em
`clicaepedeofc.vercel.app`; callback observado em deployment preview imutavel.
O commit efetivamente implantado em cada destino nao foi comprovado neste recorte.

Este documento registra execucao, nao um novo plano. A matriz possui **28 issues,
189 criterios e 251 casos planejados** (189 AC + 52 UI + 10 suplementares).
O subset executado nao corresponde a todos os 189 criterios nem aos 251 casos.
O [resultado por criterio](</D:/ProjetoIA/codex/Clica e Pede Restaurante/clica_pedidos_app/clica_pedidos_app/docs/qa/kan136-criteria-results.json>) mapeia individualmente os 189 AC originais,
com UUID/ordinal/texto, evidencia e requisito restante. Apenas KAN136 AC02/03/04
sao PASS individuais; os demais permanecem PARTIAL/BLOCKED/NOT_RUN. Nenhuma issue
inteira e aprovada. Os 18 UUID ausentes no catalogo continuam null.
Contagens de unitarios, reads, fixtures e tentativas repetidas nao sao somadas
como casos distintos da matriz. O catalogo e a matriz congelados nao foram alterados.

Sem LLM e sem novo QR, reconnect ou desconexao. A sessao existente store9 foi
reutilizada. A reconciliacao read-only confirmou inbound real de identidade
distinta recebido/persistido e reply deterministico de handoff com provider ACK.
ApplicationFlowStatus PASS_REAL_USER_INBOUND_DB_AND_REPLY_ACK; overall
PARTIAL_PROVIDER_HISTORY_UNVERIFIED: historico provider suplementar com zero
records fica BLOCKED, nao delivery failure nem schema invalido inferido.
O contato era preexistente: nao ha prova de primeiro cadastro. O usuario confirmou
explicitamente recebimento do reply automatico deterministico E19; isso e prova
humana, nao API delivery/read receipt (NOT_VERIFIED). Identidade, numero, corpo,
instrucao privada e segredos nao sao publicados.

O baseline `draft`/`testModeEnabled=true` era intencional e preservado no audit.
Seu FAIL de elegibilidade nao e bug do app; e uma precondicao de reply nao atendida.
Main fez ativacao temporaria active/testfalse somente store9 em janelas limitadas
e a reconciliacao read-only confirmou restauracao do baseline. Worker
produtivo e banco de negocio compartilhado nao constituem ambiente descartavel.

## Fontes revisadas

Artefatos externos foram lidos sem executar DB, browser, webhook, envio ou SSH
durante a autoria deste documento. Arquivos privados de auth/DPAPI, traces e videos
nao foram abertos nem incorporados. Referencias a eles nao autorizam publicacao.

| Ref | Artefato / origem | Segmento efetivamente comprovado |
| --- | --- | --- |
| E01 | [Catalogo](</D:/ProjetoIA/codex/Clica e Pede Restaurante/clica_pedidos_app/clica_pedidos_app/scripts/qa/kan136-catalog.json>) e [matriz](</D:/ProjetoIA/codex/Clica e Pede Restaurante/clica_pedidos_app/clica_pedidos_app/docs/qa/kan136-regression-matrix.md>) | Escopo/checklists originais; nao sao resultado de execucao. |
| E02 | [Backend audit](</D:/ProjetoIA/codex/clicaepede/KAN-136/backend-evidence.json>) | 8 PASS / 1 FAIL / 11 BLOCKED; reads reais, nao transporte novo. |
| E03 | [Integridade DB](</D:/ProjetoIA/codex/clicaepede/KAN-136/db-integrity-evidence.json>) | 6 PASS em transacoes revertidas; nada dessas fixtures foi comitado. |
| E04 | [Outgoing fixo](</D:/ProjetoIA/codex/clicaepede/KAN-136/outbound-evidence.json>) | Fila real, evento sent, provider ACK; receipt NOT_VERIFIED. |
| E05 | [Contrato + handoff UI](</D:/ProjetoIA/codex/clicaepede/KAN-136/browser-2026-10-09T04-17-12-687Z/results.json>) | 10 PASS no conjunto contrato/cleanup e 1 FAIL browser. |
| E06 | [Personalidade](</D:/ProjetoIA/codex/clicaepede/KAN-136/browser-2026-10-09T04-12-44-903Z/results.json>) | Save/reload/invalid/restore e simulacao; overall FAIL React418. |
| E07 | [Scan 16 variantes](</D:/ProjetoIA/codex/clicaepede/KAN-136/browser-2026-10-09T04-19-14-918Z/results.json>) | 4 tabs x desktop/mobile x light/dark; 16 FAIL overall, medidas preservadas. |
| E08 | [Controle sem tema](</D:/ProjetoIA/codex/clicaepede/KAN-136/browser-2026-10-09T04-08-30-420Z/results.json>) | React418 tambem em tema default; nao atribuir apenas ao toggle de tema. |
| E09 | [Cancelar desconexao](</D:/ProjetoIA/codex/clicaepede/KAN-136/browser-2026-10-09T04-29-24-727Z/results.json>) | Confirmacao/cancelamento preservaram connected nas 4 variantes; 4 FAIL por hidratacao. |
| E10 | [Pedido - ultima execucao concluida](</D:/ProjetoIA/codex/clicaepede/KAN-136/browser-2026-10-09T04-38-14-518Z/results.json>) | 5 transicoes UI, 5 eventos sent/attempts1; overall FAIL, cleanup PASS por anonimizacao. |
| E11 | [Pedido - tentativa anterior](</D:/ProjetoIA/codex/clicaepede/KAN-136/browser-2026-10-09T04-31-06-803Z/results.json>) e [recuperacao](</D:/ProjetoIA/codex/clicaepede/KAN-136/browser-2026-10-09T04-38-04-380Z/results.json>) | Erros de locator/cleanup append-only do harness; recuperacao de 1 pedido com audit retido. |
| E12 | [Infra evidence](</D:/ProjetoIA/codex/clicaepede/KAN-136/infra-evidence.json>) e [validacao infra](</D:/ProjetoIA/codex/Clica e Pede Restaurante/clica_pedidos_app/clica_pedidos_app/docs/qa/kan136-infra-validation.md>) | Auditoria delegada: 87 criterios, 41 observados / 31 parciais / 3 divergentes / 9 historicos / 3 nao revalidados. |
| E13 | [Validacao backend e comando unitario](</D:/ProjetoIA/codex/Clica e Pede Restaurante/clica_pedidos_app/clica_pedidos_app/docs/qa/kan136-backend-validation.md>) | 168 PASS / 0 FAIL, 1208 assertions, 22 arquivos, sem coverage; self-test e TypeScript PASS. |
| E14 | [Janela de contato atual](</D:/ProjetoIA/codex/clicaepede/KAN-136/contact-evidence.json>) e [reconciliacao read-only](</D:/ProjetoIA/codex/clicaepede/KAN-136/contact-reconciled-evidence.json>) | PASS_REAL_USER_INBOUND_DB_AND_REPLY_ACK no core; overall PARTIAL_PROVIDER_HISTORY_UNVERIFIED. Historico0 BLOCKED separado. Sem mock/replay ou receipt confirmado. |
| E17 | [Contrato mais recente](</D:/ProjetoIA/codex/clicaepede/KAN-136/browser-2026-10-09T04-40-36-587Z/results.json>) | 10 PASS incluindo cleanup novamente verificado / 1 FAIL hydration; HTTP sintetico. |
| E18 | [Config TypeScript QA](</D:/ProjetoIA/codex/Clica e Pede Restaurante/clica_pedidos_app/clica_pedidos_app/scripts/qa/tsconfig.kan136.json>) | tsc focado executado, exit0 em 04:49:46 UTC; nao e tsc global. |
| E15 | [Personalidade - sete campos](</D:/ProjetoIA/codex/clicaepede/KAN-136/browser-2026-10-09T05-04-02-858Z/results.json>) | Assertions reais save/reload/limites/unsafe/restore confirmadas; overall FAIL por 2 React418. |
| E16 | [Handoff real UI](</D:/ProjetoIA/codex/clicaepede/KAN-136/browser-2026-10-09T05-07-52-928Z/results.json>) | Inbound real na fila/history, cancel preserva human, retorno UI/timestamp DB e modo original restaurado segundo main; business PASS, overall FAIL1 React418. |
| E19 | [Confirmacao humana do destinatario](</D:/ProjetoIA/codex/clicaepede/KAN-136/manual-recipient-confirmation.json>) | Usuario confirma replyad1e1561 recebido, correlacionado a inbound0d119bb6; nao API read receipt. |

E12 registra janela de leitura 03:58:27-04:04:40 UTC e escopo parcial. Esta autoria
nao repetiu sua auditoria nem transforma registros historicos em drills novos.

## Execucao observada

### Backend, DB e contrato

- E02 confirmou catalogo, snapshot read-only, sessao connected, provider open,
  webhook configurado e ausencia de grupos duplicados nos registros consultados.
  Webhook permanece preview; destino esperado nao fornecido, rollout do bootstrap
  nao disponivel. Isso nao verifica sozinho o rollout implantado em producao.
- KAN125 historico: evento `f829412f-1579-4534-a6e9-3361c7783c56` sent com 1 tentativa
  succeeded. Historico provider retornou zero matches em envelope reconhecido:
  BLOCKED para correlacao, nao delivery failure nem schema invalido inferido.
  KAN134 historico nao foi selecionado por UUID e nao conta como novo inbound.
- E03: mesmo telefone em lojas diferentes gerou IDs distintos; duplicidade na
  mesma loja retornou 23505; conversa, mensagem e sessao cross-tenant retornaram
  23503; rollback deixou zero fixtures proprias. Sao **6 checks DB PASS**, nao
  seis jornadas UI nem teste completo de permissoes/RLS de todos os atores.
- E05: auth, JSON malformado, evento nao suportado, instance ausente, fromMe,
  grupo, ingestao sintetica em fixture humana, dedup e optout persistido passaram.
  **A contagem precisa e 9 checks HTTP sinteticos + 1 cleanup PASS = 10 PASS**;
  nao 10 novas mensagens reais. A fixture foi criada diretamente no DB.
- Handoff UI em E05: fixture apareceu, cancelar manteve human, devolver persistiu
  automatic e timestamp. Isso passou nas assertions de negocio; overall FAIL
  pelo React418. Nao testa deteccao automatica de handoff nem confirmacao recebida
  pelo cliente. `not_sent` pode resultar da config inativa antes do gate humano.

### Outgoing real e personalidade

E04: evento fixo `286f6f59-3feb-499a-9f90-38f755927864`, enviado pela fila do app,
`sent`, attempts=1, tentativa succeeded com providerAckPresent=true.
Resultado **PASS_PROVIDER_ACK_ONLY**. Envio para a propria identidade nao prova
inbound de cliente. Sem receipt/read do destinatario, nunca marcar delivered/read.
Cleanup redigiu 1 evento proprio, zero pendentes desse evento e audit retido;
nao e prova de limpeza global ou de exclusao de todas as fixtures.

E06: salvar nome no UI refletiu no DB, reload preservou o valor, nome vazio foi
rejeitado sem substituir o valor salvo e restauracao foi verificada via UI/DB.
O campo exercitado foi o nome; nao afirmar comparacao de toda config/metadata.
Teste de personalidade foi simulacao interna, sem transporte. Assertions de
negocio passaram; overall FAIL por 2 erros React418. Nao corrigir o resultado
para PASS apenas porque a persistencia funcionou.

E15 amplia a cobertura anterior: sete campos editaveis persistidos, quatro textos
preservados apos reload e enums conferidos no DB; quatro limites maximos de texto
enforced; instrucao insegura rejeitada sem mutacao no DB. Todos os campos testados
restaurados pelo UI com readback. Draft/test mode preservados, sem toggle ativo
do assistente. Esses checks de negocio sao efetivos, nao expectativas futuras.
Overall **FAIL por 2 React418** em 1440/dark; nao cobre isolamento multiloja,
resposta real com a nova personalidade ou todas as variantes/boundaries.

### Inbound real e reconciliacao read-only

O convite anterior `a3f8435e-7b2b-4362-955f-d182902f4a58` ficou sent/attempts1,
sem resposta na janela de cinco minutos: BLOCKED, configRestored=true e historico
preexistente preservado. Main informou que o processo antigo ficou preso por
import do DB do app e foi terminado somente apos confirmar cleanup; harness,
nao bug do produto. O runner agora encerra explicitamente apos main/finally.
Esse snapshot anterior foi substituido pelo probe seguinte; nao somar como inbound.

No probe atual, convite `2597dc64-0943-4391-ae20-a83e7de67efd` sent/attempts1.
A reconciliacao read-only E14 confirmou o core do fluxo:

- Inbound `0d119bb6-cc52-4f83-9ce7-05dd63a93fc4`, contact1, conversation
  `8193c30c-d42c-4704-96f9-335e27b2ee98`, loja9, authorizedFullContactMatched=true
  e uniqueMarkerMatched=true. Mensagem received, contato preexistente.
- Reply `ad1e1561-45c4-4f33-85ab-0761166b5369` sent, fallbackReason
  explicit_human_request e intent human_support; provider_ack_present=true.
  Internalhandoff informado por main:
  `6c4210de-9c88-45ad-b727-ceda7e2609de`; conversa human/pending_human.
- Texto recebido tinha caracteres adicionais; selector de igualdade exata falhou.
  O marker unico por substring permite reconciliacao read-only: nao e bug do app,
  nao autoriza replay/reenvio nem exposicao do corpo/marker privado.
- Janela encerrada, configRestored=true verificado read-only; contato existente e
  historico preservados. Nao afirmar criacao de novo contato ou limpeza total PII.

E14 applicationFlowStatus=PASS_REAL_USER_INBOUND_DB_AND_REPLY_ACK:
input real/DB, contato autorizado completo/marker unico e referencia assistant
ao inbound correlacionam a resposta. Sem HTTP mock, novo envio ou replay.
AC02 e PASS para mensagem real recebida/persistida; AC03 e PASS para associacao
correta do contato/conversa existente a loja9; nao primeiro cadastro. AC04 e PASS:
reply automatico deterministico enviado/ACK e usuario confirmou recebimento E19,
deterministicHandoffReplyReceived=true. O JSON promove apenas esses tres criterios,
sem aprovar issues. Historico provider retornou0 records: auditoria suplementar
BLOCKED, overall PARTIAL_PROVIDER_HISTORY_UNVERIFIED. Nao afirmar prova independente
provider-history fromMe/remetente nem delivery failure. AutomatedDeliveryReceipt
NOT_VERIFIED; confirmacao humana recebida nao e API delivery/read receipt.

E16 executou UI sobre a conversa real: inbound/marker visiveis na fila humana e
history, cancelar preservou pausa human, devolver alterou para automatic com
timestamp conferido no DB. Main confirma restauracao do modo original do contato
real. Business assertions passaram; overall **FAIL por 1 React418**. Sem fixture
sintetica nova, replay, reenvio ou delecao do contato/historico reais.

### Unitarios e TypeScript

E13: **168 PASS / 0 FAIL, 1208 assertions, 22 arquivos**, sem coverage e sem
transporte real. E18 executado nesta autoria:
`node node_modules/typescript/bin/tsc -p scripts/qa/tsconfig.kan136.json --noEmit`,
exit0. Config focada exclui testes e funcoes Supabase; nao representa build global.
Main reportou **460 erros baseline no tsc completo**, associados ao mini shim
bun:test; problema do novo global Bun foi corrigido e filtro mais recente nao
indicou erros scripts/qa. Nao certificar tsc global como PASS.

### Pedido - resultado mais recente, concluido

E10 substitui a tentativa incompleta como melhor evidencia das cinco transicoes,
sem apagar E11. Fixture de pedido DELIVERY/DIGITAL_MENU inserida diretamente no
DB; nao cobre checkout publico, validacao de carrinho, pagamento ou tracking.
As acoes foram executadas de fato no UI; status foi conferido no DB e exatamente
um evento por status foi observado para o pedido proprio.

| Acao UI | Status | Assertion | Evento DB | Resultado observado do envio |
| --- | --- | --- | --- | --- |
| Aceitar | ACCEPTED | PASS_ENQUEUE_ONLY | a40dbe3d-d3b6-4bd6-920f-aac950bed8b8 | sent, attempts=1 |
| Iniciar preparo | IN_PREPARATION | PASS_ENQUEUE_ONLY | db46b4e0-b624-4dd0-aa87-3b150ae73342 | sent, attempts=1 |
| Marcar pronto | READY | PASS_ENQUEUE_ONLY | 576ec25a-69bb-4dc5-a94c-0f7e2195a9ff | sent, attempts=1 |
| Saiu para entrega | OUT_FOR_DELIVERY | PASS_ENQUEUE_ONLY | 371bcc72-0592-4c35-b3a0-57194964bc26 | sent, attempts=1 |
| Finalizar | COMPLETED | PASS_ENQUEUE_ONLY | b279a207-b6b1-48c2-a6d7-890edf0d7cd4 | sent, attempts=1 |

Cinco assertions de negocio passaram e cinco envios tiveram ACK representado
por sent/attempts1. `recipientReceipt=NOT_VERIFIED`. Overall **FAIL por 6 erros
runtime React418 (KAN-141)**. Trace/video/screenshot paths constam de E10;
nao foram abertos ou publicados nesta autoria. Retirada, rejeicao, cancelamento,
eventos fora de ordem, retries sob falha e leitura do destinatario nao executados
neste fluxo. Nao marcar aceite integral KAN-92/KAN-136.

### Bugs versus falhas do harness

| Registro | Observacao comprovada | Impacto / limite |
| --- | --- | --- |
| KAN-141 | React hydration error 418 em scan, controle default, personalidade, handoff, cancelar desconexao e pedido; E05-E10. | Fluxos podem persistir corretamente e ainda falhar o gate runtime. Root cause/fix nao comprovados aqui. |
| KAN-142 | Tabs cortadas em 390x844 light/dark: lista WhatsApp 332px com conteudo 512-513px, overflow visible; Atendimentos/Diagnostico fora do viewport; lista superior 473px tambem corta Usuarios. E07. | `document.scrollWidth=390` nao prova acessibilidade das tabs. Correcao e reteste mobile pendentes. |
| Harness, nao bug do app | E11 usou esperas de dialog incorretas para transicoes sem esse dialog; cleanup tentou alterar/deletar audit append-only. | Nao atribuir os timeouts/erro append-only automaticamente ao app; E10 executou as cinco acoes corretamente. |
| Harness, nao bug do app | Tentativa 04:25:43 terminou BLOCKED por EPERM em storage state privado. | Nao e regressao funcional WhatsApp, nem execucao de caso aprovada. |

IDs KAN-141/KAN-142 foram informados por main/usuario. Esta autoria nao escreveu
no Jira nem verificou autonomamente o estado/fechamento desses tickets.
Main informa imagens inline nos comentarios10745/10746, ampliacao KAN141 para
/orders no10747 e screenshot de pedidos KAN136 no10748. Isso nao comprova que o
relatorio publico final ja foi anexado; AC10/AC12 continuam PARTIAL ate publicacao.

## Cleanup e contaminacao residual

E05 confirma remocao do contato proprio da fixture sintetica e sessao preservada.
E03 confirma rollback das fixtures DB. E04 confirma redacao do evento proprio.
E11 registra recuperacao posterior de um pedido; E10 registra cleanup PASS com
`auditRetained=true`, `amountZeroed=true`, `recipientRedacted=true`.

**Pedido proprio permanece retido/anonymizado e com total zero**, porque audit
imutavel/append-only e FK restritiva impedem exclusao limpa. O total zero evita
valor financeiro no campo exercitado, mas **nao remove o pedido de contagens,
metricas, relatorios ou historico**. Nao afirmar clean deletion, order-count
isolation, ausencia total de contaminacao ou cleanup completo de PII.
Numero/sessao reais foram preservados conforme checkpoint de main; nao excluir
para encerrar o QA. Retencao de evidencia privada/auth exige revisao separada.
Contato/historico reais existentes ficam preservados. Qualquer novo contato que
surja no fluxo real exige registrar PII remanescente e retencao; nao se deve
deleta-lo automaticamente. Redacao temporaria reduz exposicao, mas pode prejudicar
correlacao/continuidade QA; manter numero ativo privado conserva a sessao e deixa
escopo de PII que nao pode ser declarado removido. Nao alterar config/session
ativa para satisfazer checklist de limpeza sem autorizacao especifica.

## Cobertura individual das 28 issues

PARTIAL = algum segmento executado/documentado, sem aceite integral.
BLOCKED = aceite central nao demonstravel no escopo atual, mesmo com testes locais.
Nenhuma linha e Done; as pendencias sao requisitos que ainda precisam de prova,
nao instrucoes executadas por este documento.

| Issue | AC | Estado | Cobertura real deste recorte | Requisitos ainda sem aceite |
| --- | --- | --- | --- | --- |
| KAN-81 - Dominio DB | 5 | PARTIAL | Catalogo live, indices contados e 6 checks DB rollback; E02/E03. | Aplicacao/reversao segura de migracoes, definicoes/plans de todos os indices e historicos/atores multiloja completos. |
| KAN-82 - Conexao/sessao QR | 5 | PARTIAL | Sessao existente connected/provider open; E02; cancel preservou sessao E09. | Novo cadastro/QR expirado/invalido, reconexao e isolamento de envio/recebimento entre lojas; usar fixture separada autorizada, nao store9 ativa. |
| KAN-83 - Painel/controle | 5 | PARTIAL | 4 tabs/4 variantes, confirmacao-cancel de desconexao, handoff resume; E05/E07/E09. | KAN141/142 corrigidos; polling sob mudanca real, usuario sem permissao, erros de provider e pausa da sessao com baseline completo. |
| KAN-84 - Personalidade | 5 | PARTIAL | E15 sete campos persistidos, quatro textos reload/enums DB, quatro maxlength, unsafe rejeitado sem mutacao e UI/readback restore; overall FAIL2 React418. E06 simulacao/nome invalido. | Isolamento multiloja, identidade e mudanca aplicada a novas respostas reais, demais boundaries/variantes; reteste sem React418. |
| KAN-85 - Ingestao/contatos | 5 | PARTIAL | Inbound real associado ao contato existente E14; sinteticos tenant9/dedup/optout E05; isolamento DB E03. | Primeiro contato criado pelo webhook nao provado, atualizacao/saudacao real e consulta de optout pelos atores. |
| KAN-86 - Orquestrador LLM | 5 | BLOCKED | Politicas/gates/contratos locais E13; handoff deterministico sem LLM E14/E19. | LLM contextual, troca de provider, historico e timeout reais fora do escopo sem LLM; handoff nao valida esses caminhos. |
| KAN-87 - Tools da loja | 5 | PARTIAL | Testes locais de tools/tenant/ausencia de dados E13. | Consultas integradas a dados atuais autorizados de cardapio/preco/disponibilidade/horario/pagamento; sem promover fixtures a validacao live. |
| KAN-88 - Guardrails/fallback | 5 | PARTIAL | Validacao de instrucoes/guardrails locais E13. | Adversarial integrado, ausencia de vazamento, resposta com fonte/limites e falhas consecutivas; comportamento LLM permanece BLOCKED. |
| KAN-89 - CTA/atribuicao | 5 | PARTIAL | Politicas CTA/URL/nao repeticao locais E13. | CTA enviado em conversa real elegivel, tom, reenviar contextual e conversao clique/pedido com atribuicao consultavel. |
| KAN-90 - Handoff | 5 | PARTIAL | Real explicit_human_request/human_support E14, recebimento humano E19, fila/history reais e cancel/retorno/timestamp E16; overall FAIL React418. | Silencio em mensagens posteriores, contexto/casos completos, concorrencia, API receipt e reteste sem KAN141/142. |
| KAN-91 - Fila/retry | 5 | PARTIAL | Evento fixo e 5 status sent/attempts1 E04/E10; dedup sintetica E05; unitarios E13. | Mesmo evento reenfileirado/concorrrencia real, falha temporaria/backoff e permanente, isolamento de sessao, reconciliacao de outcome desconhecido; recibo separado. |
| KAN-92 - Status pedido | 5 | PARTIAL | Cinco transicoes DELIVERY no UI + DB/eventos sent E10; templates locais E13. | Receipt/texto no cliente, retirada sem entrega, rejeicao/cancelamento/out-of-order, criacao/RECEIVED e variantes; KAN141 aberto. |
| KAN-93 - Cashback/fidelidade | 5 | PARTIAL | Assertions locais de beneficio na jornada E13; nao houve concessao live comprovada. | Valores/saldos/pontos/validade reais, ausencia de beneficio ficticio e dedup de concessao em jornada integrada autorizada. |
| KAN-94 - Diagnostico | 5 | PARTIAL | UI scan, eventos/tentativas correlacionados e report sanitizado E02/E04/E07/E10. | Falhas e metricas por cada canal, usuario de outra loja, audit completo de redacao/retencao e UI sem KAN141/142. |
| KAN-95 - Seguranca/LGPD | 5 | PARTIAL | Auth webhook, optout persistido e FKs DB; artefatos sanitizados e cleanup restrito E02-E05/E10. | Auth de usuarios cross-tenant, optout no dispatch promocional, retencao/audit completos e review dos privados; pedido retido nao e exclusao. |
| KAN-96 - E2E/testes | 5 | PARTIAL | 168 testes, HTTP sintetico, 6 DB, UI/outgoing/status ACK e input real/reply handoff ACK E14. | Novo cadastro/conexao/CTA, beneficios live e falhas integradas; sem LLM e cobertura integral nao ha E2E Done. |
| KAN-97 - Rollout/reversao | 5 | PARTIAL | Sessao preservada; scheduler/pilot9 descritos por main e infra E12; baseline inativo observado E02. | Config implantada pilot9 versus preview comprovada, desativacao/rollback autorizado sem perda, donos/indicadores e gates de expansao exercitados. |
| KAN-98 - Runbook/arquitetura | 5 | PARTIAL | Docs/matriz/catalogo/auditoria revisados E01/E12/E13 e este resultado. | Sincronizar docs aos deployments atuais e cleanup imutavel; treinamento operacional independente, auditoria de exemplos/PII e drills do runbook. |
| KAN-127 - Baseline VPS | 8 | PARTIAL | Inventario/topologia/externos/portas/capacidade amostrada E12. | Separacao de dados prod/staging, discrepancias de baseline, homologacao de capacidade/RPO/RTO e donos; shared DB permanece. |
| KAN-128 - MCP Hostinger | 11 | PARTIAL | Discovery e leituras autenticadas VPS/DNS/billing/metricas por agente infra E12. | Menor privilegio/segredos historicos, escrita reversivel e expiracao/revogacao/recuperacao atuais nao repetidos. |
| KAN-129 - VPS/EasyPanel | 9 | PARTIAL | VPS running, recursos, hostname/timezone, proxy e servicos E12. | Patches/supply-chain, protecao completa do painel e reboot/rebuild autorizados com before/after; nenhum novo reboot aqui. |
| KAN-130 - Hardening/segredos | 10 | PARTIAL | SSH efetivo/firewall/secrets/PG-Redis privados e probes direcionados via infra E12. | Varredura TCP/UDP completa, menor privilegio, separacao/rotacao de secrets e prova integral de armazenamento/historico. |
| KAN-131 - DNS/TLS | 9 | PARTIAL | DNS QA, TLS valido, redirect e TTL observados E12. | Renovacao TLS atual, reserva/isolamento completo, painel/Host-SNI, rollback e continuidade sob mudancas; nao promover laboratorio historico. |
| KAN-132 - Evolution/PG/Redis | 10 | PARTIAL | Versoes pinned, overlay/volumes, healthy3/3, limites, autenticacao e open E02/E12. | Durabilidade crash/restart/sessoes, forca/exclusividade de secrets e atualizacao autorizada; store9 nao foi reiniciada. |
| KAN-133 - Backup/observabilidade | 9 | PARTIAL | Timers/backups/offsite/monitor e receipt restore historico E12. | Restore/drill atual completo, retencao/descarte sob carga, falhas/alertas e RPO/RTO de rebuild; nao confundir receipt antigo com restore executado agora. |
| KAN-134 - Integracao Evolution | 11 | PARTIAL | Instancia existente/flags/auth/sinteticos, outgoing ACK e core input real/DB/reply ACK E14. | Historico provider0 BLOCKED separado, receipt, isolamento/versao alvo callback, replay real, restart/perda rede e revisao global PII; sem QR novo. |
| KAN-135 - Workers/crons | 10 | PARTIAL | Timer produtivo observado, outgoing/status processados e testes infra offline E04/E10/E12. | Contencao distribuida/falhas/retry live, reboot com pendencias, manual versus scheduled provados, retencao/alertas; billing/cutover nao executados. |
| KAN-136 - QA sem LLM | 12 | PARTIAL | Core input real/DB/reply ACK E14, 5 status UI E10, 7 campos E15 e bugs separados. | Historico/receipt suplementares, aceites restantes, KAN141/142, cleanup residual e publicacao Jira ainda pendentes. |

## Mapeamento dos 12 aceites KAN-136

Os ordinais correspondem ao checklist original E01. Resultado de subsegmento nao
aprova automaticamente o criterio completo. E14 e E19 comprovam input real/DB/
reply deterministico recebido pelo usuario: apenas AC02/03/04 sao PASS. A cobertura
geral permanece parcial, API read receipt nao confirmado e AC10/12 aguardam main.

| Aceite | Estado atual | Confirmado | Falta para aceite integral |
| --- | --- | --- | --- |
| AC01 Ambiente/dados sem contaminar producao | PARTIAL | Fixtures marcadas, rollout/sessao preservados; cleanup restrito e rollback E03-E05/E10. | Banco live compartilhado e pedido retido alteram contagens; isolamento completo nao demonstrado. |
| AC02 Mensagem real recebida persistida | PASS | E14 confirma input real received/persistido0d119bb6, contato completo autorizado e marker unico; real history E16. | Criterio atual provado; historico provider suplementar0 BLOCKED e outros fluxos nao sao aceites implicitos. |
| AC03 Contato/conversa na loja correta | PASS | E14 associa contact1/conversation8193c30c a store9; contato preexistente, history real E16. | Associacao atual provada; nao primeiro cadastro nem aceite global multiloja. |
| AC04 Reply deterministico enviado ao QA | PASS | E14 replyad1e1561 correlated/sent/provider ACK, explicit_human_request/human_support sem LLM; E19 usuario confirma recebimento. | Prova humana, nao API delivery/read receipt; historico provider suplementar0 BLOCKED separado. |
| AC05 Status geram notificacoes esperadas | PARTIAL | Cinco transicoes UI PASS_ENQUEUE_ONLY, cinco eventos sent/attempts1 E10. | Receipt/conteudo, demais status/modalidades/ordem, KAN141 e variantes aplicaveis. |
| AC06 Retry/idempotencia/dedup | PARTIAL | Replay HTTP unico, zero grupos duplicados na amostra, unitarios; E02/E05/E13. | Falha temporaria live controlada, backoff/limite, concorrencia e outcome desconhecido; attempts1 nao exercita retry. |
| AC07 Optout/pausa/handoff | PARTIAL | Optout sintetico E05; handoff real E14/E19; fila/history, cancelar/retornar UI com timestamp E16 e modo original restaurado. | Optout real no dispatch, silencio posterior/concorrencia e KAN141 ainda pendentes. |
| AC08 Diagnostico/logs rastreiam cada mensagem | PARTIAL | Eventos/tentativas e IDs restritos rastreaveis; UI visitada E02/E04/E07/E10. | Todas as mensagens/canais/falhas, permissoes, redacao integral e diagnostico mobile/runtime corrigidos. |
| AC09 DB/reflexos/sem duplicidade | PARTIAL | Rollback/FKs/uniques e cinco reflexos UI/status/eventos foram conferidos E02/E03/E10. | Jornadas nao executadas e invariantes globais; pedido retido impede alegacao de order-count isolation. |
| AC10 Artefatos referenciados no Jira | PARTIAL | Main reporta screenshot10748 e bugs10745/10746 inline; manifests referenciam media. | Relatorio publico ainda precisa ser anexado/referenciado e media sanitizada; main publica. |
| AC11 PII temporaria removida | PARTIAL | Fixture sintetica removida, evento redigido, pedido anonimizado/zero e audit retido. | Review de todos os temporarios/privados, criterios de retencao e residuos imutaveis; numero autorizado permanece para continuar QA. |
| AC12 Resultado final e bugs separados | PARTIAL | Recorte/failures e bugs KAN141/142 registrados; KAN141 expandido/orders segundo comentario10747. | Publicar resultado final/bugs apos reconciliacao e artefatos; main marca concluido quando publicado, sem Done global. |

## Precondicoes locais de handoff e limites da prova

Codigo local: `rollout-policy.ts:90-107`, `orchestrator-policy.ts:147-180`,
`human-handoff-policy.ts:84-89`, `db.ts:2489-2629` e webhook `route.ts:125-133`.
Necessarios: rollout permite store9; sessao connected; config active e
test_mode_enabled=false; conversa automatic/open; inbound texto fromMe=false com
ID novo e texto exato `atendente`. O ramo gera fallbackMessage + confirmacao fixa,
persiste pending_human/human e envia antes de criar o provider LLM.
Nao usar frase com menu/pedido para esse probe: classificacao anterior pode
dominar human_support. Mesmo codigo local nao prova versao do preview callback.

Esta secao descreve codigo local; o probe atual tem core real/DB/reply ACK
confirmado na reconciliacao read-only E14, historico provider suplementar BLOCKED. Nao assumir
versao implantada, recibo humano ou comportamento de todos os fluxos a partir
desse unico caso. Os 27 outros tickets seguem cobertura parcial por issue;
requisitos individuais nao executados estao no JSON. Conclusao PARTIAL / NAO DONE.
