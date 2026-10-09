# KAN-136: executar e interpretar a regressao

## Escopo e seguranca

Este PR adiciona ferramentas e documentacao QA, nao corrige os bugs encontrados.
Plano congelado: `kan136-regression-matrix.md` e `scripts/qa/kan136-catalog.json`.
Resultado executado: `kan136-execution-results.md`; planejamento nao e evidencia.
Nao aprovar uma issue inteira porque um subfluxo ou seus unitarios passaram.

- Trabalhar no repositorio D: e carregar credenciais privadas sem imprimir valores.
- QA: `qaclicapede+clerk_test@gmail.com`, loja 9, codigo Clerk `424242`.
- Senha, DB URL, chaves Evolution e telefones ficam fora do Git, em armazenamento privado.
- `QA_BASE_URL` deve ser o deployment autorizado; usar producao existente sem servidor local.
- Manter a instancia e a sessao pareadas. Nao desconectar nem renovar QR para esta rodada.
- Nao executar duas jornadas mutaveis simultaneamente. O banco e compartilhado.
- Nao apagar auditoria append-only nem desativar triggers para limpar fixtures.
- Somente fixtures com ownership comprovado podem ser alteradas.

## Ferramentas

`whatsapp-functional-regression.cjs` usa Playwright com `channel: chrome`, headless,
contexto independente e conta verificada. Nao precisa da extensao ou do perfil
pessoal do Chrome. Playwright instalado no D: e resolvido pelo runtime local.

Com credenciais privadas ja carregadas, selecionar `QA_RUN_MODE`:

| Modo           | Execucao                                                                      |
| -------------- | ----------------------------------------------------------------------------- |
| scan           | Quatro abas, desktop/mobile, light/dark; runtime e medidas de layout.         |
| control        | Controle sem injecao de tema para investigar hidratacao.                      |
| interactive    | Nome do assistente: salvar, reload, invalido, restaurar; simulacao interna.   |
| dialogs        | Abrir/cancelar desconexao sem desconectar.                                    |
| contract       | HTTP sintetico identificado, dedup/optout e fixture de handoff UI.            |
| orders         | Pedido exclusivo QA como precondicao DB; cinco acoes reais UI e notificacoes. |
| recover-orders | Reconciliar fixtures proprias de pedidos de execucoes interrompidas.          |

```powershell
$env:QA_RUN_MODE='scan'
& 'D:/nodejs/node.exe' scripts/qa/whatsapp-functional-regression.cjs
& 'D:/nodejs/node.exe' node_modules/typescript/bin/tsc --project scripts/qa/tsconfig.kan136.json
```

O modo orders nao comprova checkout nem tracking publico. Os pedidos auditados
nao podem ser excluidos: ficam identificados como QA, com telefone removido e
valor zerado, preservando estado e auditoria. A linha ainda afeta contagens;
nao declarar isolamento completo ou limpeza integral de producao.

`kan136-backend-audit.ts`: leituras reais e sanitizadas, nao transporte novo.
`kan136-db-integrity.ts`: constraints live em transacao rollback-only.
`kan136-outbound-probe.ts`: envio fixo pela fila real. `--reconcile` reutiliza o
evento existente, sem novo envio. Sem essa flag, cada execucao envia mensagem nova.
Usar Bun portavel no D:. Sleep nao exige tipos globais Bun.

## Segundo contato e resposta real

`kan136-live-contact.ts` exige um telefone distinto explicitamente autorizado em
`QA_TARGET_PHONE`, rollout local pilot/store9 e `QA_ALLOW_STORE_WIDE_ACTIVATION=true`.
Essa autorizacao habilita temporariamente **toda a loja QA**, nao apenas um telefone.
Nao executar com trafego de clientes reais, operadores concorrentes ou sem aceite
do responsavel. Baseline esperado: draft/test mode; janela maxima cinco minutos.

O convite solicita uma resposta com marcador exclusivo. O teste observa a mensagem
inbound real e a confirmacao deterministica de handoff, sem chamar LLM ou fabricar
um webhook. Telefone completo, provider ID e contact ID sao conferidos. Contato
existente so e usado com conversas automatic/open. Nao se forca conversa pausada.

Ao terminar, restaura a configuracao anterior e descarta/redige somente seu convite.
Contato e historico, novos ou existentes, sao preservados: exclusao/sanitizacao
posterior exige inventario e autorizacao por IDs. Arquivo privado de recuperacao
deve permanecer somente se a restauracao falhar. Nunca publicar esse arquivo.
Uma falha de restore nao impede a tentativa de cancelar o convite pendente.

Ausencia de resposta dentro da janela e BLOCKED, nao bug automaticamente.
Mensagem propria (`fromMe`) nao representa cliente distinto. HTTP sintetico testa
contrato, nao WhatsApp real. Provider ACK nao significa entregue/lido no celular.

## Evidencias e aceite

Artefatos locais: `D:/ProjetoIA/codex/clicaepede/KAN-136`.
Cada fluxo browser gera screenshot, trace, video, results.json e report.html.
Falhas do harness sao separadas de defeitos do produto; manter tentativa anterior
e recuperacao documentadas, sem sobrescrever evidencias para aparentar PASS.

Screenshots sao mascarados, mas trace/video/storageState podem conter sessao, PII
e headers. Permanecem privados com ACL; nao subir sem revisao e sanitizacao.
Publicar screenshots revisados e relatorio sanitizado como anexos reais no Jira.
Um caminho local isolado nao e evidencia acessivel ao restante da equipe.

Marcar somente caixas cujo criterio completo foi executado e comprovado.
KAN-141 e KAN-142 sao os bugs confirmados desta rodada. Nao mover para Done antes
dos retestes e dos criterios restantes. Testes LLM, novo QR, falhas destrutivas e
drills de infra requerem precondicoes proprias, nao sao substituidos por mocks.
