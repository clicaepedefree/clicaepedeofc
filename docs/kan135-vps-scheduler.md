# KAN135: scheduler VPS -> Vercel

## Escopo e inventario

O worker Python stdlib dispara POST HTTPS na aplicacao Vercel. Nao executa
Next.js, consultas ao banco, cobrancas ou envio de mensagens localmente.
Implementacao: `scripts/infra/kan135/`, endpoints de cron e lease server-only
no PostgreSQL. A instalacao QA e as evidencias reais estao no final deste documento.

| Agendamento | Dono atual / destino | Frequencia |
| --- | --- | --- |
| `/api/cron/billing` GET | Vercel `vercel.json`, preservado ate cutover | 09:00 UTC diario |
| `/api/cron/whatsapp/transactional` POST | Novo timer VPS, opt-in | Cada minuto UTC |
| `/api/cron/billing` POST | Novo timer VPS, desabilitado por padrao | 09:00 UTC diario |
| KAN133 backup | VPS existente, inalterado | 00:00 e 12:00 UTC |
| KAN133 retention | VPS existente, inalterado | 00:15 e 12:15 UTC |
| KAN133 monitor / recover | VPS existente, inalterado | 60 segundos |
| Vault watchdog `pg_cron` | Supabase existente, inalterado | 1 minuto |

Os quatro ultimos nao sao app crons e nao devem migrar para este worker.
09:00 UTC corresponde a 06:00 America/Sao_Paulo na configuracao atual.

## Contrato com Main

- POST, corpo vazio, somente os dois paths fixos. GET legado permanece com
  `CRON_SECRET`, sem fallback para POST.
- `whatsapp.token` corresponde a `WHATSAPP_WORKER_SECRET`; `billing.token`
  corresponde a `BILLING_WORKER_SECRET`. Valores diferentes, dedicados.
- Main implementa autenticacao, lease PostgreSQL persistente distribuido,
  idempotencia de cobrancas/envios e retry da fila de negocio. Claim atomico
  por owner UUID, expiry de 15 minutos (maior que server maxDuration 60s).
  Release exclusivamente pelo owner e somente APOS o callback encerrar.
  Desconexao nao libera lease: advisory transaction lock nao e adequado aqui.
  A nova migration do Main deve estar aplicada/validada antes da integracao.
- HTTP 409 `{ok:true,skipped:true,reason:job_already_running}` e skipped:
  sem retry imediato, sem atualizar `last_success_at`/`last_healthy_at`.
  Assim uma sequencia de skips gera alerta de atraso.
- HTTP 2xx so e sucesso com JSON objeto `ok` estritamente `true`.
  WhatsApp `failed` ou `discarded` produz `ok:false` e falha operacional.
  Nao se persiste o corpo nem se tenta reenviar item a partir dele.
- Main limita batch WhatsApp a 5, `maxDuration=60`; HTTP timeout 65s,
  service timeout 90s. Timer/systemd e flock nao sobrepoem o mesmo job.
- Main quarentena `processing` com mais de 15 minutos como `discarded`,
  `last_error=delivery_outcome_unknown`. Nao reenviar cegamente esses itens.

## Configuracao privada

Todos os arquivos privados ficam FORA do checkout:

| Arquivo | Permissao / dono |
| --- | --- |
| `/etc/clicaepede/kan135/config.json` | 0600 root |
| `/etc/clicaepede/kan135/whatsapp.token` | 0600 root |
| `/etc/clicaepede/kan135/billing.token` | 0600 root |
| `/etc/clicaepede/kan135/preview.token` (opcional) | 0600 root |
| `/etc/clicaepede/kan133/config.json` (Telegram existente) | 0600 root |

Diretorios privados 0700. A leitura rejeita symlink, arquivo nao regular,
permissao diferente de 0600 ou dono diferente do usuario efetivo (root nos
units). Segredos nao passam por argumentos CLI, Git, stdout ou journal.
Provisionar pelo canal privado existente, nunca colar valores neste documento.
Nao copiar a configuracao KAN133 para o repositorio ou para o preview.

O exemplo tem ambos os jobs desabilitados. `origin` precisa estar literalmente
em `allowlisted_origins`, sem wildcard, porta, query, userinfo ou path; apenas
HTTPS em producao ou hostname preview `clicaepedeofc-*.vercel.app` aprovado
individualmente (o asterisco nao e aceito na configuracao). Origem padrao:
`https://clicaepedeofc.vercel.app`. TLS usa verificacao normal, proxies de ambiente
e redirects sao desabilitados. Paths nao sao configuraveis.

Para QA, somente apos aprovacao CI e autorizacao do Main, colocar o hostname
EXATO do PR preview aprovado (prefixo proprio `clicaepedeofc-git...vercel.app`)
em `origin` e `allowlisted_origins` no arquivo privado. Usar dados e segredos
de QA do preview, nunca faturamento de producao. Billing continua false.
Se protegido, adicionar opcionalmente:

```json
"preview_bypass_secret_file": "/etc/clicaepede/kan135/preview.token"
```

Main provisiona o token existente via canal privado/DPAPI. Header
`x-vercel-protection-bypass` so e anexado quando a origem configurada e o
preview exato aprovado e diferente da producao. Nunca enviado em producao,
redirects ou Telegram. Nao relaxar deployment protection; o exemplo publico
omite o campo. Validar o preview aprovado, nao um alias que muda sem revisao.

## Instalacao e execucao explicitas

Comandos abaixo compoem o runbook; a instalacao QA segue os limites registrados
na secao de evidencias. Nao aplicar o cutover billing automaticamente.

```sh
sudo sh /caminho/aprovado/kan135/install.sh /caminho/aprovado/kan135
```

Instala arquivos e units, valida systemd e faz daemon-reload. Nao altera
config existente, nao cria tokens, nao habilita ou inicia timers por padrao.
Nao para unidades ja ativas: para uma atualizacao coordenada o operador
deve primeiro parar os timers envolvidos. Nao remover estado existente.

Depois de provisionar secrets e colocar `whatsapp_enabled=true` no config:

```sh
sudo sh /caminho/aprovado/kan135/install.sh /caminho/aprovado/kan135 --enable
sudo systemctl start kan135-whatsapp.timer kan135-retry.timer kan135-monitor.timer
```

`--enable` so habilita no boot WhatsApp, retry e monitor; nunca usa `--now`,
start ou restart. A segunda linha e uma ACAO MANUAL separada, aprovada.
Billing nao e habilitado por `--enable`.

Execucao manual compartilha o mesmo flock/estado/flags do agendamento:

```sh
sudo python3 -B /opt/clicaepede/kan135/scheduler.py whatsapp
sudo python3 -B /opt/clicaepede/kan135/scheduler.py billing
sudo python3 -B /opt/clicaepede/kan135/scheduler.py retry
sudo python3 -B /opt/clicaepede/kan135/scheduler.py monitor
```

Nao existe modo force-send. Um job concluido na mesma janela e suprimido.
Billing manual antes de 09 UTC usa a ultima janela de 09 UTC, permitindo
catch-up deliberado, nao faturamento antecipado da janela seguinte.

## Billing: um unico scheduled owner

1. Manter `billing_enabled=false` e timer VPS desabilitado durante QA/preview.
   Vercel GET continua unico scheduled owner de producao.
2. Pos-merge, Main remove o cron billing de `vercel.json`, faz deploy e
   confirma a remocao efetiva do schedule Vercel e a migration do lease.
   Nesta entrega o cron Vercel foi preservado. Aguardar execucao anterior terminar.
3. Provisionar segredo POST dedicado, ajustar origin para producao,
   habilitar `billing_enabled=true` no config privado.
4. Somente entao instalar com `--enable-billing-after-cutover` e iniciar
   manualmente `kan135-billing.timer`, retry e monitor. Esse opt-in valida
   flag/secret, mas nao verifica o deploy remoto: confirmacao pertence ao Main.
5. Validar disparo, lock distribuido, estado, fatura idempotente e monitor.

Nunca manter dois scheduled owners. Rollback: parar e desabilitar timer VPS,
colocar flag false, aguardar execucao em andamento terminar e apenas depois
restaurar cron Vercel. Flock local nao protege donos remotos; lease persistente
e idempotencia da aplicacao continuam obrigatorios.

## Fila duravel, backoff e dead-letter

`/var/lib/clicaepede/kan135/<job>.json` guarda uma unica chamada/coalesced
janela: slot, attempts, status, timestamps, proximo retry, codigo HTTP,
reason allowlisted e flag blocked. Nao e copia da fila WhatsApp ou billing.
Locks locais separados por job (flock LOCK_EX|LOCK_NB); lock ocupado e skip.
Retry drainer revalida status sob o mesmo lock, evitando race com timer/manual.

Estado e reservado como `running` ANTES do HTTP, usando tempfile 0600,
fsync, rename atomico e fsync do diretorio. Depois de restart, `running`
torna-se terminal `interrupted`, sem replay dessa chamada. Monitor detecta
running antigo (>120s), mesmo se flag do job for desligada. Operador pode
invocar o job para reconciliar esse estado; proxima janela normal tambem o faz.
Nao apagar estado para "destravar" uma entrega desconhecida.

Somente DNS (`gaierror`) e connection-refused anteriores a conexao permitem
retry: maximo 3 tentativas totais, esperas persistidas 60s e 120s.
`kan135-retry.timer` checa a fila a cada 60s, inclusive billing entre dias.
Nao usa sleeps ou Restart=on-failure. Timeout, TLS, disconnect, JSON invalido,
redirect, HTTP 429/5xx e `ok:false` sao terminais NAQUELA chamada, pois a
operacao remota pode ter iniciado. Proxima janela regular pode rodar o ciclo
da app, que administra retry de itens/idempotencia; nao e resend do item.

401/403 cria blocked persistente e nao permite novas janelas ate intervencao:
reparar credencial (ou bypass privado do preview), validar configuracao e:

```sh
sudo python3 -B /opt/clicaepede/kan135/scheduler.py whatsapp --reset-auth
```

Reset nao dispara HTTP; a janela seguinte ou invocacao manual posterior pode
rodar. Claims/processing com outcome desconhecido permanecem protegidos pelo
lease de 15 minutos; Main coloca itens processing antigos (>15 minutos) em
quarentena sem blind resend. Nao liberar lease manualmente so porque houve
disconnect/timeout; investigar o resultado antes de qualquer intervencao.
`<job>.dead-letter.json` e tambem uma mailbox operacional limitada: ultima
falha (job, slot, reason, status HTTP, attempts, timestamp), sequence monotona,
ack_sequence e primeira falha ainda nao confirmada. Gravada no run terminal
sob o flock do job ANTES de persistir conclusao. Sucesso de outra janela nao
apaga a mailbox; falhas consecutivas agregam contagem/sequence sem crescer
uma lista. Sem PII/token/corpos, nao e fila de mensagens para reenvio.

Timers calendar tem `Persistent=true`: reboot faz catch-up de uma janela,
nao replay de todos os minutos/dias perdidos. Retry state e bloqueio auth
sobrevivem reboot. Nao restaurar snapshot antigo do state junto de producao
sem reconciliacao manual, pois pode reabrir uma janela ja concluida.

## Monitor e evidencias

Monitor minuto: WhatsApp sem sucesso por >180s; billing sem sucesso da ultima
janela 09 UTC por >15min; terminal/auth/interrupted. Primeiro boot tem grace
persistida. Flags false suprimem atraso, nao falhas/interrupcoes retidas.
409 nao mascara atraso. Telegram usa somente `telegram_token` e
`telegram_chat_id` do config privado KAN133, com texto fixo de codigo operacional.
Envio confirmado pelo `ok`, message_id e chat exato, sem registrar resposta.

Monitor consome mailbox por job/sequence/timestamp, com cursors consumidos e
confirmados persistidos em `monitor.json`. Ack so apos confirmacao Telegram
(ou agregacao a um episodio ativo ja confirmado); sincroniza ack_sequence
sob flock no proximo ciclo. Falha nova durante notificacao fica acima do
receipt confirmado e nao e apagada. Mailboxes legadas sem sequence migram
como sequence 1. Assim falha -> sucesso antes do monitor ainda produz alerta.

Incidentes/recuperacoes deduplicados e pendentes persistidos. Recuperacao
NUNCA remove incidente nao entregue e espera confirmacao dele antes de enviar,
inclusive se ambos forem descobertos no mesmo ciclo. Reincidencia nao reseta
attempts/backoff de incidente pendente. Recuperacao pendente obsoleta e
cancelada quando a falha reaparece; a condicao e conferida novamente antes
do envio. Estado limitado a dois tipos de evento
por sinal/job e duas mailboxes; slots repetidos nao criam lista ilimitada.
Entrega tem
3 tentativas com backoff 60/120s, sem loop infinito; pendente terminal fica
visivel em `monitor.json` e resumo do journal para intervencao. Maximo 3
envios por ciclo; timeout Telegram 12s. Config ausente/mode invalido gera
falha de entrega retida, nao exposicao de credencial. Monitor desligado ou
VPS sem energia nao consegue alertar sozinho: KAN133/external heartbeat
deve cobrir indisponibilidade do host e falha do proprio monitor.

```sh
systemctl list-timers 'kan135-*'
systemctl status kan135-whatsapp.service kan135-billing.service kan135-monitor.service
journalctl -u 'kan135-*' --since '15 minutes ago'
python3 -B -m unittest discover -s scripts/infra/kan135 -p 'test_*.py' -v
systemd-analyze verify scripts/infra/kan135/systemd/kan135-*.service scripts/infra/kan135/systemd/kan135-*.timer
```

Checklist implementada: inventario; billing/cutover; fila scheduler;
autenticacao dedicada; locks locais (distribuidos pelo Main); idempotencia
de janela (negocio pelo Main); backoff/terminal; manual/agendado;
reboot/durabilidade; alertas redacted.

Testes locais Windows: mocks HTTP, lock contention via fake flock, atomic
failure, restart running, backoff duravel, auth terminal/reset, POST secrets,
bypass privado, 409 atraso, monitor/backoff e instalador opt-in. Teste real
Linux cross-process flock/0600/symlink incluido e pulado no Windows. CI/Linux
deve executa-lo e validar units antes de QA agendada aprovada. Testes mocks
nao substituem integracao POST/lease/fila na Vercel ou reboot real da VPS.

## Validacao realizada em 2026-10-09

- Suite do app: 527 testes aprovados, 1 pulado; cobertura critica aprovada.
- Scheduler: 37 testes coletados, 36 aprovados no Windows e 1 exclusivo de
  Linux; todos executados na VPS, incluindo flock entre processos, modos
  privados e rejeicao de symlinks. Units verificadas com systemd-analyze.
- Banco real: concorrencia, lease sobrevivendo perda de conexao, expiracao,
  reconhecimento perdido e liberacao condicionada ao owner exercitados.
  RLS bloqueia anon/authenticated na tabela de leases.
- POST real no preview: Bearer incorreto rejeitado (401); worker autorizado
  executa. Um envio manual e um agendado percorreram VPS -> Vercel ->
  Supabase -> Evolution; ambos registrados como sent, uma tentativa cada.
  A API do provedor confirmou o envio; nao equivale a confirmacao de leitura.
- Repeticao do mesmo evento recusada por idempotencia; repeticao da janela
  ignorada pelo scheduler. Alertas reais de incidente e recuperacao foram
  confirmados pela API Telegram em estado de teste isolado.
- Reboot integral autorizado da VPS validado pela Hostinger e por mudanca de
  boot_id. Timers, Docker/Evolution, Redis, PostgreSQL e EasyPanel retomaram
  automaticamente. Config/segredos mantiveram 0600 e state 0700.
- Ensaio inicial com fixture limitada a uma tentativa preservou o evento,
  mas esgotou o limite ao receber 502 durante inicializacao da Evolution;
  falha mantida no historico, sem alterar status ou apagar auditoria.
- Segundo ensaio com tres tentativas, como configuracao normal: evento
  queued/attempts=0 antes do reboot; primeiro envio recebeu 502; retry via
  scheduler resultou em sent/attempts=2 em 2026-10-09 03:32:01 UTC.
  Uma unica tentativa succeeded; evento repetido recusado como duplicate.
  Nenhum reset manual de status ou envio forcado foi usado. Monitor confirmou
  incidente/recuperacao; state e cursors persistidos sobreviveram ao host.
- App de producao Vercel respondeu HTTP 200 durante o ensaio. Billing VPS
  permaneceu desabilitado; nao houve reinicio do Supabase nem alteracao de DNS.
- WhatsApp/retry/monitor habilitados apenas para QA, com origem imutavel do
  preview deste PR. Billing VPS permanece desabilitado; cron GET existente e
  configuracao de producao da Vercel permanecem inalterados. Cutover exige
  aplicar segredos de producao e retarget aprovado; billing exige dono unico.

Sem migracao de UI/app/dominio, LLM ou gateway. Esta validacao de infraestrutura
nao substitui regressao visual ou ensaio financeiro real. Segredos, telefone,
QR e credenciais nao integram as evidencias publicadas.
