# Rollout Controlado Da Operacao Interna

Este documento define como liberar a area administrativa interna com risco
controlado, como operar o grupo piloto e como executar rollback de aplicacao e
dados.

Os exemplos usam dados ficticios. Nao inclua tokens, senhas, documentos reais
ou e-mails pessoais de clientes neste arquivo.

## Objetivo

Liberar o modulo de cadastro e gestao administrativa de restaurantes sem abrir
para toda a base antes da validacao operacional. O rollout deve permitir:

- ativar apenas para um grupo piloto;
- validar deploy, migracoes, dados e monitoramento;
- interromper rapidamente em caso de incidente;
- voltar a aplicacao e os dados para um estado consistente.

## Feature Flag

A area interna respeita a variavel:

```text
INTERNAL_OPERATIONS_ROLLOUT_MODE=all
```

Valores aceitos:

| Valor | Comportamento |
| --- | --- |
| `all` | Todos os usuarios com role interna valida podem acessar. E o default para preservar o comportamento atual. |
| `pilot` | Apenas e-mails ou roles definidos no grupo piloto podem acessar. |
| `off` | Ninguem acessa a area interna, mesmo com role valida. Use para rollback emergencial. |

Quando a variavel estiver ausente ou vazia, o sistema assume `all` para manter
o comportamento atual. Quando ela tiver um valor invalido, o sistema falha
fechado e trata como `off`.

Grupo piloto por e-mail:

```text
INTERNAL_OPERATIONS_PILOT_EMAILS=ops@example.com,financeiro@example.com
```

Grupo piloto por role:

```text
INTERNAL_OPERATIONS_PILOT_ROLES=superadmin,implementation
```

O papel legado `ops_admin`, usado internamente pela Clica e Pede, continua
sendo aceito e tratado como `superadmin`. Clientes/lojistas comuns nao recebem
`privateMetadata.internalRole` no Clerk, portanto nao participam deste rollout e
nao veem a area Admin.

Recomendacao: quando usar `pilot`, inclua pelo menos `superadmin` ou os e-mails
do time interno responsavel. Assim a equipe da Clica e Pede nao perde acesso ao
controle interno durante o rollout.

## Onde A Flag Atua

A flag controla:

- exibicao do botao Admin no painel principal;
- acesso as rotas `/internal`, `/internal/stores`, `/internal/stores/new`,
  `/internal/stores/[storeId]`, `/internal/monitoring` e `/internal-operations`;
- Server Actions administrativas que usam permissoes internas.

A flag nao substitui permissao. Para acessar, o operador precisa:

1. estar dentro do rollout permitido; e
2. ter `privateMetadata.internalRole` valido no Clerk; e
3. ter a permissao interna exigida pela acao.

## Responsaveis Do Rollout

Defina responsaveis antes de ativar:

| Papel | Responsabilidade |
| --- | --- |
| Produto/Operacao | Decide grupo piloto, criterios de expansao e interrupcao. |
| Desenvolvimento | Acompanha deploy, logs, migrations e rollback tecnico. |
| Suporte | Executa fluxos reais com lojas piloto e reporta falhas. |
| Financeiro | Valida cobranca, faturas, pagamentos e bloqueios. |
| QA | Executa checklist funcional e registra evidencias. |

## Fases

### Fase 0 - Preparacao

1. Confirmar que as dependencias da KAN-77 foram mergeadas.
2. Confirmar que o Supabase esta saudavel.
3. Confirmar que a ultima build da Vercel passou.
4. Confirmar que as variaveis de ambiente estao presentes.
5. Confirmar que o grupo piloto foi definido.
6. Confirmar que o plano de rollback esta entendido por operacao e tecnologia.

### Fase 1 - Piloto Interno

Configuracao sugerida:

```text
INTERNAL_OPERATIONS_ROLLOUT_MODE=pilot
INTERNAL_OPERATIONS_PILOT_ROLES=superadmin
```

Se o usuario interno ainda estiver configurado como `ops_admin` no Clerk, essa
configuracao tambem libera acesso, porque `ops_admin` e normalizado para
`superadmin`.

Validacoes:

1. Superadmin enxerga botao Admin.
2. Superadmin acessa lista de lojas.
3. Operador fora do piloto nao enxerga botao Admin.
4. Operador fora do piloto recebe `unauthorized` ao tentar rota direta.
5. Server Actions administrativas negam chamadas fora do piloto.
6. Auditoria continua registrando operacoes feitas pelo piloto.

### Fase 2 - Piloto Operacional

Inclua roles ou e-mails adicionais:

```text
INTERNAL_OPERATIONS_ROLLOUT_MODE=pilot
INTERNAL_OPERATIONS_PILOT_ROLES=superadmin,implementation,support,finance
```

Validacoes:

1. Implantacao cadastra uma loja de teste.
2. Suporte valida reativacao e bloqueio.
3. Financeiro valida fatura manual, baixa de pagamento e ajuste.
4. Monitoramento mostra filas/eventos sem alerta critico.
5. Nenhum operador fora do piloto acessa a area interna.

### Fase 3 - Liberacao Geral Controlada

Configuracao:

```text
INTERNAL_OPERATIONS_ROLLOUT_MODE=all
```

Validacoes:

1. Todas as roles internas autorizadas acessam conforme matriz de permissao.
2. Viewer permanece somente leitura.
3. Financeiro nao acessa dados pessoais sem permissao.
4. Suporte nao altera cobranca.
5. Operacoes sensiveis continuam auditadas.

## Checklist De Deploy

Antes do deploy:

- [ ] Branch mergeada na `main`.
- [ ] `bun test` passou.
- [ ] `bun run build` passou.
- [ ] Variaveis de rollout revisadas.
- [ ] Variaveis de cron/webhook existentes preservadas.
- [ ] Supabase saudavel.
- [ ] Migrations pendentes conhecidas ou inexistentes.
- [ ] Responsaveis de produto, tecnologia e operacao avisados.

Durante o deploy:

- [ ] Acompanhar build da Vercel.
- [ ] Confirmar que a versao entrou no ambiente esperado.
- [ ] Confirmar que `/api/health` responde saudavel.
- [ ] Confirmar que o grupo piloto acessa a area interna.
- [ ] Confirmar que usuario fora do piloto nao acessa.

Depois do deploy:

- [ ] Executar smoke test do Admin.
- [ ] Executar smoke test de cadastro interno.
- [ ] Executar smoke test de cobranca/fatura.
- [ ] Executar smoke test de bloqueio/desbloqueio.
- [ ] Conferir logs da Vercel.
- [ ] Conferir eventos/auditoria.
- [ ] Registrar evidencias no Jira.

## Checklist De Migracao

Quando houver migration relacionada:

- [ ] Conferir migration versionada em `supabase/migrations`.
- [ ] Conferir se a migration e idempotente quando possivel.
- [ ] Conferir indices, constraints e RLS/revokes/grants.
- [ ] Conferir se dados historicos precisam de backfill.
- [ ] Executar dry-run ou relatorio de prontidao quando aplicavel.
- [ ] Ter query de verificacao de contagem antes/depois.
- [ ] Ter decisao documentada para registros ambiguos.

Para a KAN-77 em si, nao ha migration obrigatoria. O controle de rollout usa
variaveis de ambiente e a matriz de roles existente.

## Checklist De Verificacao Funcional

Execute em ambiente controlado:

1. Com operador piloto:
   - login;
   - botao Admin visivel;
   - acesso a `/internal/stores`;
   - abertura de detalhe de loja;
   - tentativa de acao permitida pela role.
2. Com operador fora do piloto:
   - login;
   - botao Admin oculto;
   - rota direta redireciona para unauthorized.
3. Com role sem permissao:
   - rota permitida apenas quando a role pode visualizar;
   - acao sensivel bloqueada.
4. Com `INTERNAL_OPERATIONS_ROLLOUT_MODE=off`:
   - botao Admin oculto;
   - rotas internas bloqueadas;
   - Server Actions internas bloqueadas.

## Rollback De Aplicacao

Use quando a falha estiver em comportamento da aplicacao, permissao, UI ou
Server Actions.

Opcoes em ordem recomendada:

1. **Rollback por flag**
   - Alterar `INTERNAL_OPERATIONS_ROLLOUT_MODE=off`.
   - Redeploy ou recarregar ambiente conforme politica da Vercel.
   - Confirmar que a area interna esta inacessivel.
2. **Voltar para piloto**
   - Alterar `INTERNAL_OPERATIONS_ROLLOUT_MODE=pilot`.
   - Manter apenas `superadmin` ou e-mails tecnicos.
   - Validar incidente com acesso restrito.
3. **Rollback de deploy**
   - Promover o deployment anterior estavel na Vercel.
   - Confirmar `/api/health`.
   - Confirmar logs sem erro recorrente.

Responsavel minimo: desenvolvimento para executar rollback tecnico e
produto/operacao para decidir se a liberacao fica pausada.

## Rollback De Dados

Use quando a falha criou ou alterou dados incorretos.

Principios:

- Nao apagar historico auditavel sem decisao explicita.
- Preferir inativar, cancelar, revogar ou registrar ajuste compensatorio.
- Preservar trilha em auditoria e eventos de cobranca.
- Antes de corrigir, identificar todas as lojas/faturas/usuarios afetados.

Roteiro:

1. Pausar rollout com `INTERNAL_OPERATIONS_ROLLOUT_MODE=off` ou `pilot`.
2. Levantar janela do incidente.
3. Identificar registros afetados por auditoria/eventos.
4. Classificar impacto:
   - cadastro de loja indevido;
   - fatura indevida;
   - bloqueio indevido;
   - permissao indevida;
   - modulo indevido.
5. Aplicar compensacao:
   - loja: inativar/cancelar/arquivar conforme caso;
   - fatura: cancelar, ajustar ou reembolsar;
   - bloqueio: desbloquear com motivo;
   - permissao: revogar ou bloquear usuario;
   - modulo: revogar ou expirar entitlement.
6. Registrar motivo operacional.
7. Reexecutar verificacao funcional.
8. Documentar no Jira o que foi revertido.

Quando precisar de restauracao de backup, tratar como incidente de dados:

- congelar operacoes;
- identificar backup de referencia;
- avaliar perda de dados entre backup e incidente;
- obter aprovacao de produto/operacao;
- executar restauracao somente com responsavel tecnico.

## Criterios De Expansao

Expandir do piloto para mais roles ou para `all` apenas quando:

- nenhum erro P0/P1 aberto no Jira;
- smoke tests passaram;
- monitoramento sem alerta critico;
- auditoria registrando corretamente;
- suporte consegue executar cadastro, bloqueio e cobranca sem dev;
- financeiro validou fatura, pagamento e ajuste;
- rollback por flag foi testado ao menos uma vez em ambiente controlado.

## Criterios De Interrupcao

Interrompa o rollout se ocorrer:

- operador fora do piloto acessando area interna em modo `pilot`;
- Server Action sensivel executada por role sem permissao;
- falha que crie cobranca incorreta;
- bloqueio/desbloqueio indevido em loja real;
- perda de auditoria;
- erro recorrente de build, rota ou banco;
- qualquer exposicao de dado pessoal sem permissao.

Acao imediata:

1. Mudar `INTERNAL_OPERATIONS_ROLLOUT_MODE=off`.
2. Registrar bug no Jira.
3. Informar responsaveis.
4. Corrigir e retestar antes de reabrir piloto.

## Evidencias Esperadas

Para considerar o rollout pronto para teste:

- print/log do grupo piloto acessando;
- print/log de usuario fora do piloto bloqueado;
- resultado de `bun test`;
- resultado de `bun run build`;
- comentario no Jira com PR, validacoes e decisao de rollout;
- responsaveis listados no comentario ou na tarefa de release.
