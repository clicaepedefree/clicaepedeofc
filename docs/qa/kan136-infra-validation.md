# KAN-136 - Validacao de infraestrutura (read-only)

## Resultado

**PARCIAL COM RESSALVAS; nao e aceite integral KAN127-135 nem QA funcional WhatsApp.**
Janela observada: 2026-10-09 03:58:27-04:04:40 UTC (00:58:27-01:04:40 Brasilia).
Branch existente: `codex/kan-136-whatsapp-functional-qa`; HEAD `a90ffe6f2e4d87a327552d7868928fbba6a2c320`.
Entrada: snapshot KAN136 local, sem atualizacao Jira. Evidencia estruturada fora do Git:
`D:/ProjetoIA/codex/clicaepede/KAN-136/infra-evidence.json`.

Cinco servicos 1/1, Evolution/PostgreSQL/Redis healthy, TLS confiavel, portas internas
TCP testadas sem conectividade externa, sete backups offsite privados e heartbeat
recente. 36 testes scheduler + 9 monitor aprovados na VPS com rede bloqueada/mocks.
Billing VPS desabilitado. Scheduler WhatsApp preexistente ATIVO em PRODUCAO a cada
minuto; app continua Vercel e Supabase live compartilhado. Pilot9 foi informado
pelo usuario; uma sessao connected da loja9 foi observada, mas flags Vercel nao foram lidas.

## Escopo e Seguranca

Somente este report e o JSON foraGit foram escritos. Sem commit/push/Jira,
reinicio/power/recreate, firewall/DNS, backup/restore/retention manual, pareamento,
replay live, cobranca, mensagem WhatsApp ou Telegram. Timers preexistentes seguiram
rodando; suas gravacoes automaticas nao sao acoes desta auditoria.
SSH por chave existente, known_hosts estrito, BatchMode e sudo passwordless.
Hostinger MCP: somente discovery e leituras. Supabase: SQL em transacao READ ONLY,
sem SELECT de telefone, QR, corpo de mensagem, segredo, Vault ou payload cron.
Configuracoes privadas foram projetadas em campos permitidos; logs em metadados
operacionais. API key foi usada em memoria para GET, nunca emitida. Nao houve
cat de config/env inteiro. Metadata 0600/root foi conferida sem expor conteudo.
Os testes offline usam fixtures temporarias removidas e `python3 -B`, sem estado
produtivo: nao executam entrypoints vivos do scheduler/monitor nem jobs backup/restore.
Arquivo concorrente `scripts/qa/whatsapp-functional-regression.cjs` foi preservado.
Browser auth em diagnostico nao bloqueou a inspecao infra; matriz funcional pertence
ao outro agente e nao foi editada.

## Achados

### INFRA-01 - Isolamento integral QA/producao nao demonstrado

Classificacao: P1 acceptance risk. Banco de negocio Supabase live compartilhado e scheduler produtivo ativo. A infraestrutura Evolution QA separada nao torna dados de negocio descartaveis. Rollout pilot loja9 foi informado pelo usuario; so estado da sessao loja9 foi confirmado, nao as variaveis de rollout Vercel.

Encaminhamento: Main deve manter gate pilot9 e planejar QA sem contaminacao; nao aprovar criterio de isolamento integral.

### INFRA-02 - Scheduler e webhook usam destinos Vercel diferentes

Classificacao: P1 acceptance risk. Scheduler canonico produtivo; webhook usa deployment imutavel especifico. Pode ser decisao deliberada de QA, mas saude, secrets, versao e aprovacao do alvo nao foram demonstrados nesta auditoria. Nao classificar automaticamente como webhook quebrado.

Encaminhamento: Main confirmar deployment aprovado/saudavel e fluxo inbound antes de aceite; eventual retarget requer aprovacao, nao realizado.

### INFRA-03 - Baseline e relato de instalacao desatualizados

Classificacao: P2 evidence gap. Baseline cita Ubuntu26.04/firewall vazio; live Ubuntu24.04.5/firewall associado. Runbook KAN135 ainda descreve origem preview enquanto live aponta producao.

Encaminhamento: Dono dos documentos reconciliar inventario/decisao atual; auditor so altera seu report.

### INFRA-04 - Restore raiz e recuperacao de chave portatil nao comprovados

Classificacao: P2 recovery limitation. Receipt existente prova ensaio historico isolado com Docker disponivel, nao rebuild completo da VPS nem restauracao de todos os sete objetos recentes. Backup Evolution nao cobre banco comercial. Perfil DPAPI e provedor Storage/watchdog compartilhado continuam limites.

Encaminhamento: Planejar ensaio isolado aprovado com Main; nao rodar restore/backup/retention agora.

### INFRA-05 - Portas internas escutam e scan e direcionado

Classificacao: P2 hardening/coverage gap. UFW inativo; painel3000/Swarm2377/7946 TCP e UDP4789/7946 escutam. Firewall Hostinger sincronizado e probes TCP nao conectaram nas internas; nenhum achado de exposicao TCP nessas portas. UDP/all-ports/origens alternativas nao exercitados.

Encaminhamento: Nao anunciar scan completo nem mudar firewall; programar avaliacao ampliada aprovada.

### INFRA-06 - Retencao especifica KAN135 nao identificada; falhas anteriores preservadas

Classificacao: P2 observability limit. KAN133 tem namespace7dias/16M; scheduler usa journal global. Mailbox application-failure HTTP200 sequence2/ack2 existe e foi reconhecida; estado atual success. Success do ciclo nao significa entrega de mensagem.

Encaminhamento: Confirmar politica global de journal e investigar causas pela equipe dona, sem reset/apagar auditoria.

## Evidencias

| ID  | Fonte e resultado sanitizado                                                                                                                                                                                                                                                                                       |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| E01 | Baseline/runbooks e vercel.json: topologia, externos, cron billing09UTC, RPO/RTO/papeis/janela.                                                                                                                                                                                                                    |
| E02 | Hostinger MCP: VPS running KVM1/Boston2/1CPU/4GiB/50GiB; firewall sincronizado22 restrito/80/443; quatro modulos; assinatura ativa proxima cobranca28/10; metricsCPU/RAM/disco/rede/uptime. DNS[] e domain404 porque autoridade atual e externa. Um backup provedor05/10; nao restaurado.                          |
| E03 | SSH: brunoops uid1000/sudo exit0, ops-staging, Ubuntu24.04.5, America/Sao_Paulo, RAM3915MiB e disco15%; uptime29min no inicio.                                                                                                                                                                                     |
| E04 | SSH hardening efetivo; Fail2ban/updates ativos; UFW inativo; metadados config/tokens0600 root e dirs0700 sem symlink.                                                                                                                                                                                              |
| E05 | Inspect projetado: Evolution2.3.7/PG17.11/Redis7.4.11 pinned por digest, volumes/redes, health/restart/limites; json-file10m x3; ACME0600 root; Redis RDB/AOF presentes. EasyPanel latest e Traefik3.7.13 sem healthcheck proprio. Secrets Swarm0444 UID0 dentro dos consumers: nao confundir com config host0600. |
| E06 | DNS Google/Cloudflare A correto TTL300, NS HostGator; QA sem AAAA, Evolution prod sem A. TLS1.3 autorizado Let's Encrypt YR1 SAN exato,06/10/2026-04/01/2027. HTTP301, API sem chave401, raiz API200, IP HTTP418, app307 login.                                                                                    |
| E07 | TCP externo22/80/443/2377/3000/5432/6379/7946/8080: v4 abertas22/80/443, v6 abertas80/443; demais timeout. Sem UDP/scan completo.                                                                                                                                                                                  |
| E08 | Sete timers enabled/active; WhatsApp cada minuto Persistent=true; billing disabled/inactive/flagfalse; origin produtiva allowlisted; sandbox scheduler strict/ProtectHome/NoNewPrivileges.                                                                                                                         |
| E09 | Ultima captura00:00:15Z/verified00:00:48Z/727416bytes/failedfalse; journal backups2 ok/24h; retention7/0/0. Receipt restore36.408s pass/cleanup/hash/decryption. Scheduler success e mailbox sequence2/ack2 preservada; monitores sem incidentes/pending. KAN133 journal7dias/16M/8M.                              |
| E10 | Supabase READ ONLY: bucket privado7copias/3401832bytes/zero>7dias; watchdog1min ativo/204/ok-ok; heartbeat04:01:02Z age1.30s; CPU6.24/RAM20.49/disco14.56/zeroOOM. Leases RLS/FORCE sem select anon/auth, zero rows. Loja9 uma sessao connected sem erro, heartbeat03:30:11Z.                                      |
| E11 | GET autenticado API200, uma instancia open Baileys; webhook enabled com3eventos e headers presentes, alvo deployment diferente do scheduler. Sem telefone/ID/QR/header divulgado. Primeiro lookup do basename do secret falhou, corrigido pela metadata File.Name; nenhuma exposicao.                              |
| E12 | Offline VPS:36/36 scheduler incl. flock Linux e9/9 monitor; rede bloqueada/Telegram mock; um teste installer-source excluido pois runtime nao instala install.sh/systemd repo. Nao representa suite completa37 nem transporte real.                                                                                |
| E13 | SHA256 de7scripts instalados corresponde ao repo:6KAN133 + schedulerKAN135. Hashes completos no JSON.                                                                                                                                                                                                              |
| E14 | Snapshot/runbooks/kan133-validation.json: evidencias HISTORICAS de escrita MCP/reboot/renovacao/restore/WhatsApp. Nao reexecutadas nesta autorizacao.                                                                                                                                                              |

## Criterios Individuais

Legenda: OBSERVADO = leitura atual ou criterio documental atendido; PARCIAL = evidencia
limitada/parte nao ensaiada; HISTORICO = relato/receipt anterior, sem novo ensaio;
NAO_REVALIDADO = nao exercitado nesta auditoria; DIVERGENTE = estado atual difere do
requisito/documentacao. OBSERVADO nao implica aceite produtivo automatico.

### KAN-127

| Criterio                               | Estado     | Observacao e evidencia                                                                                                                                                                            |
| -------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C01 Plano/regiao/CPU/RAM/disco/SO      | DIVERGENTE | MCP: KVM 1, Boston 2, 1 vCPU/4096 MiB/51200 MiB; SSH: Ubuntu 24.04.5 LTS. Baseline antigo cita Ubuntu 26.04 e firewall vazio, nao o estado atual. (E02 E03 E14)                                   |
| C02 Diagrama componentes/redes         | OBSERVADO  | Diagrama inclui EasyPanel, Evolution, PG, Redis, Next.js/Vercel e externos; duas redes overlay atuais confirmadas. (E01 E05)                                                                      |
| C03 Supabase/Clerk externos            | OBSERVADO  | Explicitados no baseline; Supabase ACTIVE_HEALTHY externo. Clerk somente documental, sem consulta ao provedor. (E01 E10)                                                                          |
| C04 Separacao producao/staging         | DIVERGENTE | Evolution QA tem PG/Redis dedicados, mas banco de negocio e live compartilhado; scheduler aponta producao e webhook deployment especifico. Nao ha isolamento completo de dados. (E05 E08 E10 E11) |
| C05 Endpoints/portas publicas/internas | OBSERVADO  | Contrato 22 restrito/80/443; PG/Redis sem publicacao; sondagens direcionadas nao conectaram nas portas internas. (E04 E05 E07)                                                                    |
| C06 Dependencias Vercel/crons          | OBSERVADO  | Inventario no baseline e KAN135; vercel.json conserva GET billing diario 09 UTC. App segue na Vercel; estado remoto do schedule nao consultado. (E01 E08)                                         |
| C07 RPO/RTO/donos/janela               | OBSERVADO  | Baseline define QA24h/8h, producao1h/4h, papeis e janela terca 02-04 Brasilia. Sao alvos; rebuild integral nao medido. (E01 E14)                                                                  |
| C08 Consumo/margem de capacidade       | PARCIAL    | Estimativas/gates documentados; amostra live CPU6.24%, RAM20.49%, disco14.56%, sem OOM. Nao e benchmark nem homologacao produtiva. (E03 E10)                                                      |

### KAN-128

| Criterio                                      | Estado    | Observacao e evidencia                                                                                                                                      |
| --------------------------------------------- | --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C01 MCP oficial                               | OBSERVADO | Configuracao selecionada usa @hostinger/mcp; discovery e leituras reais responderam. Nao houve instalacao/reconfiguracao. (E02)                             |
| C02 Modulos registrados                       | OBSERVADO | Headers selecionados confirmam VPS, DNS, domains e billing; quatro ferramentas responderam sem alteracoes. (E02)                                            |
| C03 Credencial fora Git/TOML                  | PARCIAL   | Nao extraidos valores nem lido TOML inteiro; somente headers/args nao sensiveis. Nao foi feita auditoria completa do armazenamento da credencial. (E02 E04) |
| C04 Autorizacao administrativa                | OBSERVADO | Leituras autenticadas listaram duas VPS e assinatura KVM1 ativa, sem novo login/token. (E02)                                                                |
| C05 Inicializacao/discovery                   | OBSERVADO | Search retornou operacoes readOnly e execute retornou estado real. (E02)                                                                                    |
| C06 VPS/recursos contratados                  | OBSERVADO | VPS alvo running, KVM1/1CPU/4GiB/50GiB; assinatura ativa, proxima cobranca 28/10/2026. Sem alterar renovacao. (E02)                                         |
| C07 Leituras VPS/DNS/domains/billing/metricas | OBSERVADO | Metricas CPU/RAM/disco/rede/uptime lidas; DNS Hostinger [], dominio 404 nao registrado la; NS atuais HostGator por DNS publico. (E02 E06)                   |
| C08 Prova de escrita reversivel               | HISTORICO | Snapshot registra firewall temporario criado/removido na KAN128. Nao repetida: esta autorizacao e estritamente read-only. (E14)                             |
| C09 Menor conjunto de modulos                 | PARCIAL   | Quatro modulos de infraestrutura registrados; menor privilegio efetivo da credencial administrativa nao provado por estas leituras. (E02)                   |
| C10 Reconexao/expiracao/revogacao/incidente   | HISTORICO | Runbook no snapshot descreve procedimentos. Nao provocar expiracao/revogacao nem reiniciar Codex nesta tarefa. (E14)                                        |
| C11 Sem tokens no Git/Jira                    | PARCIAL   | Novos artefatos sanitizados, sem valores de credenciais; nenhuma escrita Jira. Nao certifica ausencia em todo historico Git/Jira. (E04)                     |

### KAN-129

| Criterio                                    | Estado    | Observacao e evidencia                                                                                                                                                        |
| ------------------------------------------- | --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C01 Plano/regiao provisionados              | OBSERVADO | Hostinger confirma plano KVM1 e data center24 Boston2. (E02)                                                                                                                  |
| C02 SO suportado/atualizado                 | PARCIAL   | Ubuntu24.04.5 LTS/kernel6.8.0-146; unattended-upgrades ativo. Nao verificada lista de patches pendentes/suporte upstream nesta auditoria. (E03 E04)                           |
| C03 Hostname/timezone                       | OBSERVADO | Hostname ops-staging e America/Sao_Paulo confirmados. (E03)                                                                                                                   |
| C04 EasyPanel fonte oficial                 | PARCIAL   | Imagem easypanel/easypanel:latest em servico 1/1; fonte da instalacao so documental, nao prova integridade/supply chain. (E05 E14)                                            |
| C05 Painel acesso restrito                  | PARCIAL   | Porta3000 escuta v4/v6 mas sondagens externas timeout; HTTP por IP418. Tunel/politicas Host/SNI completas nao reensaiados. (E04 E06 E07)                                      |
| C06 80/443 proxy                            | OBSERVADO | Listeners presentes e conexoes externas v4/v6 abertas; Traefik1/1. (E04 E05 E07)                                                                                              |
| C07 CPU/RAM/armazenamento                   | OBSERVADO | 1 CPU, 3915 MiB RAM utilizavel, filesystem48G; disco15% ocupado na amostra SSH. (E03)                                                                                         |
| C08 Reboot preserva configuracao            | HISTORICO | Uptime resetado e timers/servicos atuais ativos; runbook KAN135 registra reboot autorizado. Nao reiniciado nesta execucao, sem comparacao before/after propria. (E03 E08 E14) |
| C09 Estado inicial/recuperacao documentados | OBSERVADO | Runbooks KAN129/130/133 existentes e estado atual coletado; reconstruir VPS nao autorizado. (E01 E14)                                                                         |

### KAN-130

| Criterio                                 | Estado         | Observacao e evidencia                                                                                                                                                                             |
| ---------------------------------------- | -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C01 Usuario nominal                      | OBSERVADO      | Login brunoops uid1000 por chave; sudo -n true exit0. (E03)                                                                                                                                        |
| C02 SSH por chave antes restricoes       | PARCIAL        | Sessao atual usa chave/known_hosts estrito/BatchMode; ordem historica da restricao nao repetida. (E03 E14)                                                                                         |
| C03 Root/senhas restringidos             | OBSERVADO      | sshd efetivo: PermitRootLogin no, PasswordAuthentication no, KbdInteractiveAuthentication no, AllowUsers brunoops, MaxAuthTries3. (E04)                                                            |
| C04 Firewall somente portas justificadas | PARCIAL        | Hostinger firewall sincronizado: SSH CIDR administrativo/32 e HTTP/HTTPS any. UFW inativo; Swarm2377/7946 e painel3000 escutam mas TCP externo testado nao conecta. UDP nao testado. (E02 E04 E07) |
| C05 PG/Redis nao expostos                | OBSERVADO      | Nenhuma publicacao Swarm5432/6379 nem listener host nessas portas; timeout TCP v4/v6. (E04 E05 E07)                                                                                                |
| C06 Brute force/updates                  | OBSERVADO      | Fail2ban sshd ativo, zero falhas/bans na amostra; unattended-upgrades ativo. Nao provocado ataque nem update. (E04)                                                                                |
| C07 Segredos cofre/ambiente fora Git     | PARCIAL        | Arquivos privados KAN133/135 root0600, dirs0700, sem symlink; Swarm secrets nativos. Nao auditado todo Git/cofre. (E04 E05)                                                                        |
| C08 Chaves staging/producao separadas    | NAO_REVALIDADO | Secrets QA da Evolution identificados; nao comparados com segredos produtivos/Vercel. Tokens jobs dedicados existentes nao comprovam isolamento completo de ambiente. (E04 E05)                    |
| C09 Rotacao/acesso emergencial           | OBSERVADO      | Runbook KAN130 define rotacao e console Hostinger; nao exercitados nem alterados acessos. (E01 E14)                                                                                                |
| C10 Varredura externa completa           | PARCIAL        | Sondagens TCP direcionadas22/80/443/2377/3000/5432/6379/7946/8080 v4/v6. Nao e scan65535 TCP/UDP nem teste de todas as origens. (E07)                                                              |

### KAN-131

| Criterio                            | Estado    | Observacao e evidencia                                                                                                                                                          |
| ----------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C01 Autoridade DNS                  | OBSERVADO | NS atuais nspro86/nspro87.hostgator.com.br; Hostinger nao hospeda registro do dominio. (E02 E06)                                                                                |
| C02 A evolution-staging para QA     | OBSERVADO | A para VPS alvo confirmado DNS local/Google/Cloudflare, TTL300. (E06)                                                                                                           |
| C03 Staging isolado                 | PARCIAL   | Hostname infra separado, sem AAAA observado; Evolution produtiva sem A. Banco de negocio/scheduler nao constituem ambiente QA de dados isolado. (E06 E10 E11)                   |
| C04 Dominio futuro reservado        | PARCIAL   | Mapa documental; evolution.clicaepede.com.br sem A observado. Nao equivale a prova de reserva/ownership contratual. (E01 E06)                                                   |
| C05 TLS valido/renovacao automatica | PARCIAL   | TLS1.3 autorizado, Let's Encrypt YR1, SAN exato, expira04/01/2027; ACME root0600 persistente. Renovacao natural nao observada; laboratorio historico no snapshot. (E05 E06 E14) |
| C06 HTTP redireciona HTTPS          | OBSERVADO | GET raiz QA retorna301 com Location HTTPS; preservacao POST/caminho/query somente historica, nao POST nesta auditoria. (E06 E14)                                                |
| C07 EasyPanel protegido             | PARCIAL   | HTTP IP418 e3000 externa timeout v4/v6. Matrix completa de Host/SNI/headers/tunel nao reexecutada. (E06 E07 E14)                                                                |
| C08 TTL/rollback documentados       | OBSERVADO | TTL300 live e runbook rollback DNS; rollback na zona ativa nao executado. (E01 E06 E14)                                                                                         |
| C09 Site/app atual preservado       | PARCIAL   | GET producao307 para login, Evolution raiz200. Nenhuma alteracao nossa; nao substitui smoke browser/regressao/medicao continua downtime. (E06)                                  |

### KAN-132

| Criterio                            | Estado    | Observacao e evidencia                                                                                                                                  |
| ----------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C01 Evolution especifica/fixada     | OBSERVADO | Evolution2.3.7 fixada por digest sha256, nao latest. (E05)                                                                                              |
| C02 PostgreSQL volume/credenciais   | PARCIAL   | Postgres17.11-bookworm pinned, volume postgres_data e secrets admin/app distintos; exclusividade/forca da senha nao auditadas. (E05)                    |
| C03 Redis persistencia              | OBSERVADO | Redis7.4.11-alpine pinned, volume redis_data; dump.rdb, AOF manifest/base/incr presentes. Durabilidade sob crash nao retestada. (E05)                   |
| C04 Rede interna Evolution/PG/Redis | OBSERVADO | Tres servicos na overlay clica-evolution-qa_internal; Evolution tambem easypanel para proxy. Healthy3/3; conexao/config completa nao divulgada. (E05)   |
| C05 5432/6379 privadas              | OBSERVADO | Sem published ports; probes TCP nao conectaram em v4/v6. (E05 E07)                                                                                      |
| C06 API chave forte como segredo    | PARCIAL   | Swarm secret nativo; GET sem chave401 e autenticado200, chave usada apenas em memoria. Entropia/rotacao nao revalidadas. (E05 E06 E11)                  |
| C07 Healthchecks tres servicos      | OBSERVADO | Healthchecks definidos e tres containers healthy; EasyPanel/proxy nao possuem healthcheck, fora deste criterio dos tres. (E05)                          |
| C08 Restart/limites                 | OBSERVADO | Restart any nos tres; limites RAM Evolution1536MiB/PG512MiB/Redis384MiB, CPU0.75/0.5/0.3. Amostra zero OOM/restart_count0. (E05)                        |
| C09 Reinicio preserva sessoes       | HISTORICO | KAN132 documenta canaries nao pareados e KAN134/135 recovery real. Instancia agora open, mas nenhum restart/paired persistence drill proprio. (E11 E14) |
| C10 Versoes/variaveis/upgrade docs  | OBSERVADO | Runbook KAN132 e referencias existentes; imagens live conferidas. Segredos/montagens nao divulgados em bruto. (E01 E05)                                 |

### KAN-133

| Criterio                               | Estado    | Observacao e evidencia                                                                                                                                                             |
| -------------------------------------- | --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C01 Backup PG automatico               | OBSERVADO | Timer backup enabled/active Persistent=true 00/12 UTC; journal dois status ok/24h, ultima captura00:00:15Z e verificacao00:00:48Z, failed=false. (E08 E09)                         |
| C02 Volumes/config estrategia          | PARCIAL   | Runbook inclui dump PG, RDB/volume sessoes, EasyPanel/Traefik e recuperacao criptografada; seis scripts deploy correspondem ao repo. Bundle nao aberto agora. (E01 E13)            |
| C03 Copias offsite                     | OBSERVADO | Supabase bucket infra-backups-qa privado; sete objetos prefixo QA,3401832 bytes. Metadata prova presenca, nao decriptabilidade de cada copia. (E10)                                |
| C04 Retencao/criptografia/descarte     | PARCIAL   | age/7dias/min2 documentados; retention timer ativo e journal listed7/eligible0/deleted0. Zero objetos>7dias; delete de antigos nao observado. (E08 E09 E10 E14)                    |
| C05 Restore completo isolado           | HISTORICO | Receipt last_restore pass/isolated-full-restore/cleanup_verified, hash/decryption true,36.408s; doc fixture37.423s. Nao executado restore nem rebuild raiz nesta tarefa. (E09 E14) |
| C06 Monitor CPU/RAM/disco/API/restarts | OBSERVADO | Monitor local e watchdog externo recentes; CPU6.24%,RAM20.49%,disco14.56%, evolution_ok true,OOM/restarts0. (E09 E10)                                                              |
| C07 Alertas backup/espaco/Evolution    | PARCIAL   | Nove testes offline monitor passaram; estado sem incidentes/pending, delivery historico presente. Sem falhas provocadas nem Telegram enviado agora. (E09 E10 E12 E14)              |
| C08 Logs retencao/sem dados sensiveis  | PARCIAL   | Containers json-file10m x3; namespace KAN1337dias/16M/8M. Apenas campos allowlisted dos logs foram emitidos; nao prova ausencia total de PII/segredos em todos os logs. (E05 E09)  |
| C09 RPO/RTO comprovados/ajustados      | PARCIAL   | Backup atual com cerca4h na amostra dentro QA24h; RTO36.408s e receipt historico de stack isolado/Docker existente, nao rebuild VPS8h nem producao4h/PITR. (E09 E10 E14)           |

### KAN-134

| Criterio                            | Estado         | Observacao e evidencia                                                                                                                                                          |
| ----------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C01 Instancia QA criada             | OBSERVADO      | Fetch autenticado200, uma instancia; nome/ID omitidos, integracao WHATSAPP-BAILEYS. (E11)                                                                                       |
| C02 Numero autorizado pareado       | PARCIAL        | Provider open e banco loja9 connected sem erro; autorizacao do numero/QR/ownership vem do historico, nao re-pareado. (E10 E11 E14)                                              |
| C03 Config por ambiente             | DIVERGENTE     | Scheduler origin canonica de producao; webhook origin deployment especifico diferente. URL/headers presentes, mas isolamento/retarget aprovado nao demonstrados. (E08 E11)      |
| C04 Webhook endpoint existente      | PARCIAL        | Webhook enabled, path /api/webhooks/whatsapp/evolution; alvo especifico Vercel. Nao realizada chamada callback nem comprovada saude/autenticacao remota desse deployment. (E11) |
| C05 Somente eventos necessarios     | OBSERVADO      | Allowlist CONNECTION_UPDATE,QRCODE_UPDATED,MESSAGES_UPSERT; webhookByEvents/base64 false. (E11)                                                                                 |
| C06 Autenticacao/assinatura webhook | HISTORICO      | Headers presentes nao provam segredo valido. Runbook registra validacao anterior; nenhum POST/injecao de callback nesta tarefa. (E11 E14)                                       |
| C07 Inbound persistido uma vez      | NAO_REVALIDADO | Runbook registra inbound/replay historicos; esta auditoria nao recebeu mensagem nem mediu deduplicacao de novo. Matriz funcional pertence ao outro agente. (E14)                |
| C08 Outbound chega WhatsApp         | NAO_REVALIDADO | Historico distingue provider e recebimento humano; zero envio nesta auditoria. Scheduler success nao comprova mensagem/receipt. (E09 E14)                                       |
| C09 Reconexao restart/perda rede    | HISTORICO      | Runbook descreve restart e bloqueio443 temporario seguido open; nao repetir restart/firewall/rede agora. (E14)                                                                  |
| C10 Anti-loop/dedup                 | HISTORICO      | Runbook descreve replay e echo sintetico; nao replay live. Testes scheduler offline nao validam anti-loop da app. (E12 E14)                                                     |
| C11 Telefone fora Jira/codigo       | PARCIAL        | Artefatos novos sem telefone/QR; runbook registra troca de fixtures, historico Git nao reescrito. Nao certifica limpeza global de Jira/historico. (E14)                         |

### KAN-135

| Criterio                             | Estado    | Observacao e evidencia                                                                                                                                                                                                          |
| ------------------------------------ | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C01 Inventario crons/processadores   | OBSERVADO | Runbook inventaria billing GET/POST, WhatsApp, KAN133/watchdog; vercel.json billing09UTC preservado. (E01 E08)                                                                                                                  |
| C02 Equivalente billing diario       | OBSERVADO | POST/timer09UTC documentados; billing_enabled=false, timer inactive/disabled. Sem cobranca/cutover executado. (E08)                                                                                                             |
| C03 Worker WhatsApp frequencia       | OBSERVADO | Timer enabled/active cada minuto UTC Persistent=true; origin https://clicaepedeofc.vercel.app, ultimos oito eventos estruturados success. (E08 E09)                                                                             |
| C04 Auth segredo dedicado            | PARCIAL   | whatsapp.token/billing.token root0600, config validada em allowlist, success HTTP200; segredo produtivo/Vercel e exclusividade nao extraidos/comparados. (E04 E08 E09 E12)                                                      |
| C05 Lock simultaneidade              | PARCIAL   | Teste Linux cross-process flock passou; leases live RLS/FORCE RLS, SELECT negado anon/authenticated, zero rows na amostra. Contencao distribuida live nao provocada. (E10 E12 E14)                                              |
| C06 Idempotencia duplicidade         | PARCIAL   | 36 testes offline scheduler passaram incluindo janela/retry/mailbox; idempotencia de negocio live somente historica, nao novo envio/replay. (E12 E14)                                                                           |
| C07 Retry/backoff/falhas permanentes | OBSERVADO | Timer retry ativo; testes cobrem backoff/terminal/auth/interrupted; mailbox real sequence2 ack2 application-failure HTTP200 preservada, nao apagada. (E08 E09 E12)                                                              |
| C08 Manual/agendada testadas         | PARCIAL   | Agendamento live observado, manual/historico documentado; nenhum scheduler manual live executado. Success de ciclo nao prova entrega de mensagem. (E09 E12 E14)                                                                 |
| C09 Reboot preserva pendencias       | HISTORICO | Runbook registra reboot/retry real attempts2; atuais timers habilitados/estado persistente. Nao reexecutado reboot nem criada pendencia live. (E08 E14)                                                                         |
| C10 Logs/alertas atraso/interrupcao  | PARCIAL   | Monitor ativo; zero incidentes/pending na amostra, confirmed/consumed failures2. Telegram historico/controle offline, sem novo envio. KAN135 usa journal global sem politica especifica de retencao identificada. (E08 E09 E12) |

## Limites e Conclusao

87 criterios individualizados; contagens: DIVERGENTE=3, OBSERVADO=41, PARCIAL=31, HISTORICO=9, NAO_REVALIDADO=3.
Uma captura de backup recente e dentro do RPO QA24h nao prova semanas de execucao.
Sete objetos nao provam que cada um restaura; receipt de36.408s e historico, para
stack isolado com Docker ja disponivel. Restore raiz/rebuild8h exige plano e
aprovacao Main; nao executavel legitimamente nesta janela read-only.
Nenhum cutover billing, renovacao ACME natural, scan TCP/UDP integral, comparacao de
secrets QA/prod ou limpeza global de PII foi certificado. Nenhum log/auditoria foi
apagado. Revalidacao funcional inbound/outbound/ownership/dedup deve ficar na matriz
KAN136 do responsavel, sem transformar scheduler success em prova de entrega.
