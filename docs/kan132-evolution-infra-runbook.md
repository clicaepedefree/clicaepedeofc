# KAN-132 - Evolution API de QA persistente

## Escopo

Infraestrutura Evolution da VPS QA, sem migrar o aplicativo da Vercel ou o
Supabase. Implantacao e operacao por Docker Swarm via SSH nominal; o EasyPanel
continua administrando seu painel/proxy. Esta stack independente nao e um
projeto gerenciado pela interface EasyPanel. Nao editar estes servicos pelo
painel nem criar uma segunda Evolution sobre os mesmos volumes.

Nenhuma chave, senha, IP operacional, QR Code ou telefone deve ser versionado.
Pareamento real, mensagens, webhook e reconexao WhatsApp sao gates da KAN-134.
Backup externo e restauracao sao gates da KAN-133 antes de dados reais.

## Versoes e topologia

| Servico | Versao validada | Imagem |
| --- | --- | --- |
| Evolution API | 2.3.7 | evoapicloud/evolution-api:v2.3.7 |
| PostgreSQL | 17.11 | postgres:17.11-bookworm |
| Redis | 7.4.11 | redis:7.4.11-alpine |

As tres imagens estao fixadas por tag e SHA256 em
`scripts/infra/kan132/stack.yaml`. Nenhuma usa `latest`. Docker confirmou os
digests antes da implantacao. A compatibilidade PostgreSQL 17 foi validada por
migrations reais da imagem e CRUD/configuracao de uma instancia, nao presumida
como homologacao de todos os recursos upstream.

Stack: `clica-evolution-qa`. Rede overlay privada `clica-evolution-qa_internal`
com `internal=true`, exclusiva dos tres servicos. Apenas Evolution participa
tambem da rede `easypanel` para HTTPS e conexoes externas WhatsApp futuras.
Nenhum servico publica portas no host. Banco/Redis nao participam da rede do
proxy. API por `https://evolution-staging.clicaepede.com.br`.

Volumes locais nomeados: `clica-evolution-qa_postgres_data`,
`clica-evolution-qa_redis_data`, `clica-evolution-qa_evolution_instances`.
Mounts: `/var/lib/postgresql/data`, `/data`, `/evolution/instances`.
Baseline e um unico manager QA: nao adicionar managers ou rescheduler para
outro host sem migrar/validar volumes. Nao ha HA ou backup externo nesta etapa.

## Recursos e saude

| Servico | Teto de RAM | Teto CPU | Healthcheck |
| --- | --- | --- | --- |
| PostgreSQL | 512 MiB | 0.50 CPU | pg_isready |
| Redis | 384 MiB | 0.30 CPU | PING autenticado |
| Evolution | 1536 MiB | 0.75 CPU | fetchInstances autenticado com acesso ao DB |

Uma replica por servico, restart `any`, delay 10/15 segundos, updates
`stop-first`, falha de update pausa rollout. Swarm reprograma tarefas
inoperantes; isso nao substitui alertas de disponibilidade da KAN-133.
Limites CPU nao sao reservas simultaneas: a VPS tem so 1 vCPU. Nao aprovar
producao ou multiplas instancias com base nesse smoke de baixo volume.
Node heap maximo 768 MiB. Logs json-file rotacionados em 3 arquivos de 10 MB
por container; retencao temporal/backup/alertas pertencem a KAN-133.

## Segredos e variaveis

`deploy.sh` gera quatro segredos aleatorios de 32 bytes, em formato hexadecimal,
uma unica vez, sem imprimir valores. Usa Docker Swarm secrets externos
`kan132_pg_admin_v1`, `kan132_pg_app_v1`, `kan132_redis_v1`, `kan132_api_v1`.
Copia de recuperacao root-only em `/etc/clicaepede/evolution-qa/secrets`,
diretorio700/arquivos600. Incluir essa pasta na estrategia criptografada e
externa de backup da KAN-133. Nao copiar valores para Jira ou Git.

PostgreSQL usa `POSTGRES_PASSWORD_FILE`; usuario `evolution_admin` inicializa o
cluster. Role `evolution` possui seu banco/schema, mas nao e superuser e nao
pode criar roles/bancos. Senhas de administrador e app sao diferentes.

Evolution nao suporta `_FILE` nativamente: wrapper le mounts autorizados e
exporta `AUTHENTICATION_API_KEY`, `DATABASE_CONNECTION_URI`, `CACHE_REDIS_URI`
apenas dentro do processo. Esses valores nao ficam no ServiceSpec, argumentos
CLI, imagem ou stack versionada. Root/Docker manager continuam capazes de ler
segredos: nao tratar isso como isolamento contra administradores.

Variaveis publicas e flags completas estao em `stack.yaml`:

- SERVER_TYPE=http internamente; SERVER_PORT=8080; SERVER_URL HTTPS canonico.
- DATABASE_PROVIDER=postgresql; DATABASE_SAVE_DATA_INSTANCE=true.
- CACHE_REDIS_ENABLED=true; CACHE_LOCAL_ENABLED=false;
  CACHE_REDIS_SAVE_INSTANCES=false; prefix exclusivo QA.
- AUTHENTICATION_EXPOSE_IN_FETCH_INSTANCES=false; DEL_INSTANCE=false.
- WEBHOOK_GLOBAL_ENABLED=false; sem URL webhook, chave LLM ou numero de telefone.
- LOG_LEVEL=ERROR,WARN; LOG_BAILEYS=error; TELEMETRY_ENABLED=false.
- Salvamento de mensagens/contatos/chats/historico desabilitado no baseline QA.

Redis usa senha em arquivo runtime privado, AOF `appendonly yes`,
`appendfsync everysec`, snapshot `save 60 1`, limite128 MiB e `noeviction`.
O teto de container deixa margem para buffers/fork. Nunca usar FLUSHALL para
limpar um teste. Nunca publicar 6379 ou remover a autenticacao.

O wrapper preserva o entrypoint oficial de migrations/generate/start da imagem.
Um supervisor redige os tres segredos recebidos antes de emitir stdout/stderr
e encaminha SIGTERM/SIGINT ao grupo filho. Redacao em stream tem overlap
limitado e backpressure, inclusive para linhas sem newline. Isso nao garante anonimizar futuras
mensagens/dados pessoais: proteger logs e reavaliar logging antes da KAN-134.

## Implantacao reproduzivel

1. Confirmar VPS QA, disco, RAM, Swarm e rede externa `easypanel`.
2. Preservar configuracoes do proxy/hardening e verificar restore point antes
   de mudancas arriscadas. Nao recriar/reinstalar a VPS como atalho.
3. Copiar `scripts/infra/kan132/` para diretorio operacional via SSH nominal.
4. Executar `sudo bash deploy.sh` nesse diretorio. Arquivos `.sh` exigem LF.
5. Executar `sudo bash verify.sh inspect`; exigir tres healthy/replicas1/1,
   migrations concluidas, role restrita e conexoes PostgreSQL/Redis.
6. Somente depois, executar `sudo python3 publish-route.py`.
7. Executar `sudo python3 public-test.py` e `sudo python3 check-logs.py`.
8. Testar portas e painel de fora da VPS, em IPv4 e IPv6.
9. Rodar smoke Chromium somente depois de finalizar qualquer reinicio.

Swarm nao ordena startup: wrapper espera listeners internos antes das migrations.
Secrets/configs sao imutaveis; alterar um script montado exige criar nova versao
de config no stack, nao editar somente o arquivo em disco.

## Proxy e administracao

`publish-route.py` faz update atomico do arquivo customizado KAN-131, sem tocar
o `main.yaml` gerado pelo EasyPanel. Troca apenas destino do router QA HTTPS
por `http://clica-evolution-qa_evolution:8080`; preserva certificado, redirect e
bloqueios publicos do painel. Backup anterior em
`/var/backups/kan132-qa-route-before.yaml`.

Rotas de instancia exigem API key e foram testadas com chave ausente/invalida
(401) e valida (200) pelo HTTPS publico. Root `/` upstream retorna metadados
publicos/versionamento (200); isso nao concede CRUD de instancias. O link
manager retornado pelo upstream pode usar HTTP por causa do backend interno;
usar explicitamente HTTPS, que redireciona HTTP. Nunca enviar API key por HTTP.

Painel continua bloqueado externamente. Administracao por tunel SSH loopback,
nao liberacao de 3000. Revalidar guards/prioridades apos updates EasyPanel.

## Teste de persistencia e limpeza

`sudo bash verify.sh restart` e destrutivo somente para disponibilidade
temporaria de QA: cria probe proprio sem telefone/pareamento/webhook, inicializa
credenciais reais nao pareadas sem publicar QR ou chaves, valida settings,
registra IDs/fingerprint publico e canarios, escala os tres servicos a zero e volta a uma replica.
Exige novos IDs de containers e mesmos dados. Nunca rodar com teste de mensagens
ativo ou clientes reais. Nao e reboot do host nem simulacao de crash.

`sudo bash verify.sh cleanup` remove somente a instancia/canarios do teste.
Ownership usa nome e ID registrados no marker, fora do diretorio da instancia.
DELETE upstream e assincrono: polling confirma ausencia da instancia e consulta
confirma remocao da Session via API/cascade antes de limpar marker.
Estado deleteRequested evita DELETE duplicado em retry. Se houver timeout ou
troca de ID, abortar e reconciliar; nao apagar dados por SQL ou reconstruir
ownership a partir de uma instancia atual sem evidencia anterior.

O teste comprova mesma Instance.id, Session.id e fingerprint da identidade
publica Baileys no PostgreSQL apos reinicio, com credenciais reais e
registered=false. Nao comprova reutilizacao runtime de todas as chaves,
pareamento ou reconexao autenticada. O marker do volume e apenas um canario,
nao a sessao em si. Redis SAVE comprova recuperacao controlada do snapshot;
AOF/everysec foram conferidos, mas crash recovery/fsync nao foram isoladamente
testados. Pareamento e reconexao autenticada pertencem a KAN-134.

O gate Redis identifica um peer nao-PING com a mesma origem observada do probe
executado na tarefa Evolution (Swarm VIP pode aplicar SNAT). Foi executado sem
observadores Redis concorrentes. Nao e prova exclusiva de identidade do processo:
outro observador na mesma tarefa pode causar falso positivo. Nao usar esse gate
sozinho para homologar trafego WhatsApp ou ambientes com diagnosticos simultaneos.

## Atualizacao e rollback

1. Bloquear update se backup/restauracao KAN-133 ainda nao estiverem prontos
   e houver dados reais ou sessao pareada. Em QA vazio, registrar o estado.
2. Revisar release notes, CVEs, schema e compatibilidade. Pull de tag exata,
   conferir digest/plataforma e atualizar lock de imagem em PR.
3. Atualizar Evolution, Postgres e Redis separadamente. Postgres major requer
   estrategia pg_upgrade/dump/restore; nao trocar major sobre o mesmo volume.
4. Para mudar wrapper, usar novo nome de config v2, mantendo rollback v1.
5. Rotacao de segredo cria novo secret versionado; atualizar banco/consumidores
   coordenadamente. POSTGRES_PASSWORD_FILE nao altera senha em volume existente.
6. Aplicar rollout stop-first, validar health, API/auth, dependencia, logs,
   recursos e persistencia. Pareamento real exige os retestes da KAN-134.
7. Em falha de route, voltar apenas backend QA ao noop418 mantendo guards/TLS.
   Restaurar backup customizado apenas depois de conferir preservacao dos guards.
8. Rollback de imagem nao desfaz migration: restauracao exige backup compativel
   e procedimento testado. Nao usar `docker volume rm`, `stack rm` com limpeza
   de volumes ou `system prune --volumes` como rotina de rollback.

## Aceite executado em 2026-10-06 (America/Sao_Paulo)

| Criterio | Resultado |
| --- | --- |
| Versoes exatas/digests | PASS, pull real e locks versionados |
| PostgreSQL persistente/credencial exclusiva | PASS, migrations/CRUD e role restrita |
| Redis persistente/autenticado | PASS, AOF/everysec, snapshot e canario preservado |
| Dependencias reais | PASS, pg_stat_activity e cliente Redis Evolution existente |
| Portas5432/6379/8080/3000 | PASS, sem publicacao e inacessiveis IPv4/IPv6 |
| API key protegida | PASS, native secrets e HTTPS401/200 |
| Tres healthchecks/restart/limites | PASS, configurados e containers healthy |
| Reinicio integral | PASS, tres servicos parados, containers recriados, mesma instancia/settings/Session/identidade nao pareada/canarios |
| Limpeza | PASS, probes removidos e cleanup reexecutavel |
| Logs sem valores dos segredos | PASS, comparacao com os segredos implantados |
| Proxy/painel | PASS, redirectPOST308 e bloqueioIP418 preservados |
| Chromium apos reinicio | PASS, Evolution2.3.7, login e cardapio Vercel |
| Bootstrap PostgreSQL | PASS, init final em cluster efemero novo com role restrita e ownership |
| Testes de politica/redacao | PASS, 4 casos de politica e 3 casos de redacao/supervisor Node |

Artifacts locais em D:, pasta qa-evidences/KAN-132: log de reinicio/limpeza,
screenshots, video, trace.zip, results.json e report.html. Um smoke durante o
reinicio planejado registrou Evolution indisponivel; a execucao final foi feita
depois de os healthchecks passarem. Nao omitir esse contexto nem transformar
smoke em regressao completa do app.

## Referencias

- [Evolution Dockerfile 2.3.7](https://github.com/evolution-foundation/evolution-api/blob/2.3.7/Dockerfile)
- [Evolution env 2.3.7](https://github.com/evolution-foundation/evolution-api/blob/2.3.7/.env.example)
- [Docker Swarm secrets](https://docs.docker.com/engine/swarm/secrets/)
- [PostgreSQL Docker Official Image](https://hub.docker.com/_/postgres)
- [Redis Docker Official Image](https://hub.docker.com/_/redis)
- [Redis persistence](https://redis.io/docs/latest/operate/oss_and_stack/management/persistence/)
