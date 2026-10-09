# KAN-136 - Revisao independente dos harnesses QA

Data: 2026-10-09. Revisao estatica, somente leitura dos scripts; unico arquivo
criado pelo revisor nesta etapa: este documento. Nenhum teste, consulta/mutacao
DB, envio, SSH, alteracao env ou Jira. Nao e homologacao nem relatorio de PASS.

## Escopo

`scripts/qa/whatsapp-functional-regression.cjs`, `kan136-webhook-contract.cjs`,
`kan136-db-integrity.ts`, `kan136-outbound-probe.ts`, `kan136-live-contact.ts`,
`kan136-contact-reconcile.ts` e `tsconfig.kan136.json`. Referencias de linha abaixo correspondem ao codigo
inspecionado nesta revisao; edicoes posteriores exigem nova verificacao.

## Achados corrigidos no codigo

| Tema                 | Verificacao estatica                                                                                                                                                                                                                        |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CLI/fail-closed      | Main/live recusam argumentos; probe aceita somente zero argumentos ou um `--reconcile`, dentro do guard antes de enqueue.                                                                                                                   |
| Relatorio TS         | Parse/precondicoes do probe ficam no try; DB integrity captura falha na verificacao de residuos e possui catch externo. Falha de escrita continua sem aceite e pode nao gerar arquivo novo.                                                 |
| Runtime TS           | Sleep usa `node:timers/promises`, sem dependencia de global Bun.                                                                                                                                                                            |
| Fila/cleanup         | `queued/failed` sao descartados antes da redacao; `processing` nao e alterado. Probe verifica returning/readback. Alias terminal corrigido para `discarded`.                                                                                |
| Auditoria de pedido  | Cleanup retém pedido QA identificado e auditoria append-only; nao apaga auditoria, nao desativa trigger e nao contorna FK RESTRICT. Pedido tem PII redigida e valor zerado explicitamente, nao e apagado.                                   |
| Identidade live      | Telefone completo exato, provider ID obrigatorio, contact ID existente conferido e resposta futura com marcador exclusivo do run.                                                                                                           |
| Contato/historico    | Existente exige conversas `automatic/open`; TODOS os DELETEs de contato, conversa e mensagem foram removidos do live. Novos e existentes sao retidos; cleanup automatico limita-se ao convite proprio. Nao força reset de conversa pausada. |
| Escopo de ativacao   | `QA_ALLOW_STORE_WIDE_ACTIVATION=true` e obrigatorio e o report declara whole QA store9. E autorizacao operacional explicita, nao restricao oculta por destinatario. Outros inbound da store9 podem ser processados durante a janela.        |
| Guards independentes | Falha no restore de configuracao nao pula descarte/redacao do convite proprio. Sessao/numero store9 preservados sem QR ou nova instancia.                                                                                                   |
| Limites de prova     | Webhook e sintetico rotulado; receipt permanece NOT_VERIFIED. Fixture de pedido inserida no DB nao prova checkout/tracking publico.                                                                                                         |

## Ultimas pendencias resolvidas

| Prioridade anterior          | Referencia atual                                    | Correcao confirmada por leitura                                                                                                                                                                                                                  |
| ---------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| P1 - resolvido               | `scripts/qa/kan136-live-contact.ts:202`             | Removida toda exclusao automatica de contato/historico. Sem alegar ownership para apagar mensagens/conversas de identidade real; somente evento do convite por store9 + qaRun recebe descarte/redacao. Proposta anterior implementada.           |
| P2 - resolvido               | `scripts/qa/kan136-live-contact.ts:215`             | Cleanup nao afirma restauracao: orienta consultar configRestored separadamente. Restore e convite possuem guards independentes. Falha desses guards promove status agregado a BLOCKED, preservando businessStatus separado.                      |
| P2 - resolvido               | `scripts/qa/kan136-live-contact.ts:212`             | Readback exige cardinalidade 1 quando invitationCreated, estado sent/discarded, telefone redigido, flag de redacao e texto redigido exatos. Processing continua preservado para reconciliacao.                                                   |
| P1 - resolvido estaticamente | `scripts/qa/whatsapp-functional-regression.cjs:325` | Item e button filtrado por telefone completo exato, aguardado visible e exigido count=1; acao de retorno tambem exige count=1, sem first. Selecao por primeiro nome removida; ambiguidade falha antes da mutacao. Nao reexecutado apos correcao. |
| P2 - resolvido estaticamente | `scripts/qa/kan136-contact-reconcile.ts:24`         | Inbound agora exige status received, provider evolution e source whatsapp_inbound, alem de ID, marcador unico e telefone completo.                                                                                                               |
| P2 - resolvido estaticamente | `scripts/qa/kan136-live-contact.ts:241`             | Falha de sql.end promove status BLOCKED, registra databaseClose=FAIL e mantem exit nao zero, com businessStatus separado.                                                                                                                        |

Ultima leitura confirma resolucao do P1 de selecao nos novos modos browser.
Nenhum P1 pendente identificado no escopo revisado; nao e aprovacao de todo o
repositorio nem novo PASS funcional dos selectors corrigidos.

## Residuals e resultados reportados

- Relato manual do usuario e prova DB correlacionada continuam sendo evidencias
  separadas do historico externo, mesmo com status/origem agora assertados;
  provider ID em uma linha DB nao substitui confirmacao externa de transporte.
- Restore por `active/false` protege contra estados diferentes, mas nao detecta
  uma edicao concorrente que mantenha os mesmos valores. Evitar operadores/runs
  concorrentes; uma versao/ownership do run seria protecao mais forte.
- Retencao do pedido QA nao significa zero residuo: valor zerado altera o baseline
  financeiro da fixture e a linha retida continua contando em pedidos/indicadores.
  O main informa impacto financeiro/contagem explicitamente no relatorio; manter
  baseline, IDs retidos e esse limite, sem anunciar remocao integral.
- StorageState, trace/video e arquivo privado de recuperacao podem conter sessao
  ou PII. Nao publicar; mascara de screenshot nao sanitiza esses outros artefatos.
- Main informou tsc dedicado PASS com `scripts/qa/tsconfig.kan136.json`.
  O revisor nao executou tsc; tipagem nao comprova transporte, cleanup ou E2E.
- Ultimo relato do main: run antigo **74419** terminou BLOCKED, configRestored=true
  e convite redigido, sem aceite de inbound. Run novo **29600** usa outra identidade
  autorizada do proprio usuario, contato existente automatic/open, ativacao
  wholeQA9 explicitamente consentida e marcador unico; inicialmente aguardava
  resposta. Relatos posteriores de resposta/handoff constam abaixo.
  Esses estados sao informados pelo main, nao consultados ou comprovados pelo
  revisor. Espera/ACK nao aprova inbound, handoff ou receipt. Codigo novo nao
  corrige retroativamente processo antigo ja carregado.

## Reconciliacao somente leitura

Revisado `scripts/qa/kan136-contact-reconcile.ts`: SQL somente SELECT, sem enqueue,
novo envio ou replay. POST ao endpoint findMessages e consulta de historico;
este revisor nao chamou o endpoint. CLI rejeitada, alvo obtido de arquivo privado,
marker validado contra instrucao do mesmo run e telefone completo conferido.
Reply unica deve estar sent, com motivo explicit_human_request e metadata de ACK;
conversa deve estar human/pending_human e configuracao draft/test restaurada.

`applicationFlowStatus` e preservado antes da consulta adicional ao provedor.
Historico sem o ID esperado resulta PARTIAL_PROVIDER_HISTORY_UNVERIFIED,
providerHistoryStatus BLOCKED e exit nao zero; nao transforma ausencia de
historico em falha de entrega. A consulta cobre apenas pagina 1/100 registros:
ausencia nessa resposta nao prova ausencia da mensagem nem receipt. Falha no
fechamento DB promove status BLOCKED neste novo script; falha de escrita produz
saida nao zero sem novo aceite. Telefone, segredo e corpo bruto nao sao incluidos
no report normal; arquivos privados/artefatos continuam sujeitos a controle de acesso.

Ultimo relato do main, nao consultado pelo revisor: resposta manual real tinha
caracteres extras e nao casou com selector exato. Marcador unico, telefone esperado
e origem Evolution foram observados no app; inbound received, uma reply sent com
ACK em metadata e explicit_human_request, conversa human/pending_human e restore
confirmado no DB. Report do main registra PASS_REAL_USER no segmento do app e
PARTIAL no agregado; API de historico devolveu zero registros, segmento BLOCKED,
nao delivery failure. Na ultima versao, origem/status tambem sao oraculos
assertados pelo reconciliador; revisao dessa correcao e estatica, nao nova execucao.

Receipt permanece NOT_VERIFIED. Este segmento nao conclui todos os criterios,
variantes UI, LLM, checkout ou regressao integral. **KAN-136 nao esta Done.**

## Novos modos browser: campos e handoff real

Inspecionados personality-fields e real-handoff em
`scripts/qa/whatsapp-functional-regression.cjs`, sem executar browser ou DB.

| Prioridade | Referencia                               | Achado                                                                                                                                                                                                                           |
| ---------- | ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P2         | `whatsapp-functional-regression.cjs:343` | Retorno confirma somente mode automatic e timestamp truthy; status e lido mas nao exige open, nem timestamp novo. Nao comprova baseline automatic/open completo. Conferir ambos e timestamp posterior ao inicio/estado anterior. |
| P2         | `whatsapp-functional-regression.cjs:388` | Rejeicao insegura aceita qualquer alert existente; feedback pode ser stale/nao relacionado. Conferir erro especifico da tentativa e termino da action, junto ao DB inalterado; nao apenas count de alert.                        |

No modo de campos, baseline deve ser draft/test, sete valores editaveis sao
comparados com DB, quatro textos sao conferidos apos reload e finally restaura
os campos/test/status capturados com readback. Isso atende o recorte de fixture
QA autorizada, sob ausencia de operadores concorrentes; nao testa geracao LLM.
Os enums persistem no DB, mas a selecao visual dos tres enums apos reload nao e
assertada. Nenhum novo enqueue/QR/conexao aparece nesses dois modos.

Main informou quatro checks business de campos aprovados com fluxo FAIL React;
flow() exige zero pageerror e portanto nao converte esse resultado em PASS global.
Atualizacao final do main: real-handoff teve historico real, cancelar preservando
pausa e retorno UI da mesma conversa com DB automatic e timestamp; checks business
aprovados, fluxo agregado FAIL runtime React418. O revisor nao executou nem
consultou DB para confirmar esses resultados. Reconciliacao PARTIAL/historico vazio permanece um
segmento separado, mesmo que a UI de handoff funcione. Dados reais do contato
devem permanecer privados nos traces/videos/screenshots.

Usuario confirmou manualmente recebimento da resposta automatica; main referencia
`externalmanual-recipient-confirmation.json`. Essa e confirmacao externa manual,
nao leitura API do provedor e nao comprovacao independente feita por este revisor.
O NOT_VERIFIED no reconciliador descreve aquele artefato/segmento automatizado;
a confirmacao manual deve ser referenciada separadamente, sem inventar API proof.

Ultima leitura confirma selector por button com telefone completo exato,
visible/count=1 e retorno unico sem first. P1 de selecao encerrado por revisao
estatica da correcao; evidencias anteriores de business/receipt nao sao invalidadas,
mas nao constituem execucao do selector novo. Nao reexecutar handoff neste
fechamento: baseline automatic ja restaurado conforme relato do main.

Conclusao: revisao estatica encerrada; tres pendencias anteriores resolvidas,
P1 de selecao, P2 de origem/status e P2 de fechamento DB tambem resolvidos por
leitura atual. Nenhum P1 pendente identificado no escopo; residuals P2/limites
restantes registrados. KAN-136 nao esta Done: runtime React418 FAIL e prova
API de historico PARTIAL/BLOCKED nao sao apagados por estas correcoes.
Nenhum novo PASS funcional atribuido, nenhuma alteracao dos scripts, matriz ou
catalogo detalhado. Apenas este documento atualizado; resultados operacionais
continuam dependentes das evidencias reais do executor.
