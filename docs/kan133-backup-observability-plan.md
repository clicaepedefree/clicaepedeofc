# KAN-133 - Backup, restore e observabilidade de QA

## Autorizacao e escopo
Bruno autorizou a implantacao em 2026-10-06, depois da preparacao do PR 159
e da confirmacao de recebimento do teste Telegram. Inclui pausas breves da
Evolution QA, bucket privado, timers e restore isolado. Nao inclui contratar
planos, reinstalar a VPS, mudar o app ou parear telefone.
Stack: clica-evolution-qa, Hostinger srv2017403. App permanece na Vercel.
Este backup cobre PostgreSQL da Evolution, nao banco/arquivos comerciais do app.

## Backup
- backup.py: pg_dump custom, RDB confirmado, volume de sessoes, configuracoes
  EasyPanel/Traefik, scripts KAN-132 e secrets de recuperacao criptografados.
- Nunca copia PGDATA quente nem AOF em gravacao. Evolution pausa somente na
  captura e retoma com health comprovado ANTES de criptografar/enviar.
- Lock e marker duravel precedem a pausa. Reconciliacao independente a cada
  60s e no boot reassume replicas e limpa staging abandonado. SIGKILL real testado.
- age 1.1.1: so recipient publico na VPS. Identidade privada em DPAPI no D:,
  fora da VPS/Git. Restore recebe a identidade por SSH stdin, sem persistir.
- Bucket PRIVADO infra-backups-qa, prefixo kan133/evolution-qa/, nomes unicos.
  Auth dedicado e RLS: sem chave service_role/S3 irrestrita na VPS.
- Sem UPDATE/upsert. Sucesso somente apos download completo e SHA256 identico.
  captured_at e verified_at separados; RPO usa captura, nao upload.
- Schedule 12h UTC, Persistent=true, timeout e retry limitado.
- Limite conservador 40 MiB/bundle. Bundles observados ~320 KiB. Supabase ainda
  Free; metadata de objetos nao comprova quota/custo ilimitado ou upgrade.

## Restore e retencao
Download offsite, hash, decriptacao e extracao controlada. Clone Docker interno,
sem portas, proxy ou egress, com recursos limitados e imagens pinned. Verifica
PG/roles/schema/dados, sessoes/API, volume, Redis RDB -> AOF -> restart.
Cleanup so dos recursos com ownership do ensaio; sem docker prune.
Lease duravel precede decriptacao e so desaparece depois da remocao comprovada
do staging. Recovery independente remove apenas os recursos daquele owner;
SIGKILL real deixou tres recursos/dois diretorios e todos foram recuperados.
Janitor separado preserva sete dias e ao menos dois backups mais recentes.
RLS impede exclusao de recentes e alteracao/upload pelo janitor. Descarte exige
restore bem-sucedido e cleanup. Lista truncada, clock invalido ou restore
ausente falham fechado. Sem chave administrativa para descarte na VPS.

## Monitor e alertas
Coletor local 60s: CPU >=60%/15min, RAM >=70%/15min, disco >=70%, replicas,
health, mudanca de containers, OOM e HTTPS Evolution. Backup: falha imediata,
warning 18h e critical 24h desde captura confirmada. Fila persistente,
deduplicacao, recovery e retry limitado, respeitando retry_after Telegram.
Entrega exige ok=true, chat correto e message_id; timeout ambiguo pode duplicar.

Supabase Cron chama kan133-watchdog Edge a cada minuto, fora da VPS.
Heartbeat ausente por 5min alerta. Hora de chegada vem do servidor; uploader
nao muda destinatario, mute, thresholds, estado de entrega ou observed_at.
Campos livres/sensiveis sao rejeitados. Timestamps backup sao claims do uploader;
download/restore fazem a prova independente de integridade.

Token Telegram fica no Vault e so e lido pela Edge com credencial server-side.
NAO entra em URL/headers de pg_net. Fila contem URL Edge e JWT anon publico.
RPCs sensiveis negados a anon/usuarios/VPS. RPC bootstrap removido apos uso.
Edge verifica a invocacao configurada, ignora overrides e retorna apenas status.
Cron verifica HTTP; Telegram exige receipt separado. Destino: bot Infra, Bruno.
Teste inicial confirmado manualmente; incidentes controlados posteriores possuem
receipts. Tokens/chat ID ficam fora do repositorio.

## Logs e chave
Containers: JSON limitado a 10 MiB x 3. Jobs: namespace journald kan133,
retencao maxima sete dias, teto 16 MiB. Sem payloads, QR, creds ou URLs com token.
DPAPI depende do perfil Windows autorizado. Copiar apenas o blob nao habilita
outro PC/usuario. Antes de producao, exportar identidade portatil para cofre
do time e testar recuperacao. Este ensaio assume este PC/perfil disponivel.

## RPO/RTO comprovados e limites
Alvo QA RPO <=24h, backup a cada 12h, alerta 18h/24h. Thresholds exercitados.
Ha capturas offsite verificadas; isso nao e observacao de semanas de execucao.
Restore com dados reais de teste: 37,423s incluindo download/hash/decriptacao.
37 tabelas, 60 linhas, uma instancia e uma sessao Baileys real nao pareada,
um arquivo de volume e uma chave Redis. RDB/AOF/restart, API e cleanup passaram.
Fixture viva removida por API/ownership. Estado vazio legitimo tambem deve
restaurar; contagem zero nunca e declarada como sessao restaurada.
Ultimo ensaio vazio, com wrapper final revisado: 36,408s, 37 tabelas/57 linhas,
hash/decriptacao/Redis AOF restart/cleanup aprovados. Seis arquivos instalados
comparados por SHA256 com o repositorio; todos identicos. Quatro timers ativos.

8h permanece alvo de rebuild integral da VPS, NAO medido por reinstalacao.
Medicao comprovada e restore do stack Evolution com Docker ja disponivel.
EasyPanel/Traefik entram no arquivo, mas control plane publico nao e substituido.
Esta delimitacao ajusta o aceite QA; nao anuncia RTO integral de producao.

## Evidencias e historico de migrations
[Resumo sanitizado](kan133-validation.json): ensaios reais, testes e limites.
Suporte automatizado: 140 testes Python (139 passaram/1 skip Linux), policy
Node 7/7 e suite Bun 462 passaram/1 integration skip. Storage 8/8, watchdog
10/10 e retencao funcional passaram. CI roda suites offline sem credenciais.
Tres copias externas presentes; nenhum objeto tem sete dias ainda. Descarte
de antigos validado por calculo unitario; bloqueio RLS de recentes validado
funcionalmente. Nao declarar observacao de uma semana ou delete real de antigos.

As seis migrations KAN-133 locais correspondem as seis versoes efetivamente
aplicadas. Auditoria global encontrou drift PREEXISTENTE: remoto 20260822020934
(KAN-69) sem arquivo com essa versao, alem de sete versoes antigas locais nao
listadas no historico remoto. Nao aplicar/repair essas migrations do app nesta
tarefa, nem afirmar sincronismo global; reconciliar em trabalho especifico.

## Deploy da Edge Function

`kan133-watchdog` esta declarada em `supabase/config.toml`, com `enabled = true`,
entrypoint explicito e `verify_jwt = true`, para deploy automatico por branches.
A autorizacao adicional por RPC permanece obrigatoria. Publicar a funcao nao
configura o Vault, ativa cron nem copia credenciais Telegram para previews.
Nao executar o bootstrap de producao em uma branch para testar o deploy.

## Operacao
Codigo root-owned: /opt/clicaepede/kan133; secrets: /etc/clicaepede/kan133;
estado: /var/lib/clicaepede/kan133. Helpers de bootstrap ficam em
scripts/infra/kan133. Nao resetar credenciais existentes para repetir bootstrap.
Restore: restore-offsite.ps1 no perfil Windows autorizado.
Administracao SSH: systemctl start kan133-backup.service; systemctl list-timers
'kan133-*'; retention.py sem --apply e dry-run; journalctl --namespace=kan133.
Resumo sanitizado de evidencias no Jira/PR; nunca publicar bundle, chave ou creds.

## Limites de QA
Supabase e externo a VPS, mas Storage/watchdog compartilham provedor: nao detecta
sua propria pausa/queda total. Telegram nao alerta sobre si pelo mesmo Telegram.
VPS single-node 1 CPU/4 GiB, sem HA. Sem PITR, Object Lock, reconexao WhatsApp
real, garantia de todas as mensagens ou LLM. KAN-140 trata migracao EasyPanel.

## Referencias
- [Storage/RLS](https://supabase.com/docs/guides/storage/security/access-control)
- [Credenciais em pg_net](https://supabase.com/docs/guides/troubleshooting/database-roles-can-read-request-headers-queued-by-pg_net-ad6357)
- [Agendamento Edge](https://supabase.com/docs/guides/functions/schedule-functions)
- [age](https://github.com/FiloSottile/age)
- [Redis persistence](https://redis.io/docs/latest/operate/oss_and_stack/management/persistence/)
