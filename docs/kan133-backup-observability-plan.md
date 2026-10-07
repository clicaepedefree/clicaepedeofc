# KAN-133 - Preparacao de backup, restore e observabilidade

## Estado e autorizacao

**Preparado, nao implantado.** Em 2026-10-06 o usuario autorizou avaliar o
Supabase Storage e determinou preparar apenas os arquivos e o plano.
Nenhum software, timer, bucket, credencial, backup ou monitor foi instalado ou
criado. Nao houve parada de servico, restauracao ou alteracao do Supabase.
Checklist operacional da KAN-133 permanece aberta. Este PR e draft.

`scripts/infra/kan133/qa-policy.json` registra o contrato proposto.
`plan.cjs` valida esse contrato e calcula idade de um backup confirmado usando
inputs sinteticos. Nao e executor de backup, preflight remoto, monitor em
execucao ou sistema de entrega de alertas. Nao pode ser usado como prova de
RPO/RTO ou disponibilidade. Nao ha novos servicos systemd neste PR.

## Inventario somente leitura

- VPS QA existente: 1 vCPU, 4 GB RAM, 50 GB disco; Ubuntu 24.04 operacional.
- Disco: aproximadamente 15% utilizado; memoria disponivel aproximadamente 3 GB.
- Evolution, PostgreSQL, Redis, EasyPanel e Traefik: replicas 1/1.
- Nenhum timer de backup da Evolution ou monitor de alertas encontrado.
- `restic`, `age` e `rclone` nao encontrados no PATH da VPS.
- Quatro secrets da KAN-132 existem no diretorio protegido de recuperacao.
- Supabase do aplicativo: estado ACTIVE_HEALTHY, regiao us-west-2.
- Storage: um bucket `store-files`, publico, 14 objetos, 504998 bytes conforme
  metadata. Isso NAO e medicao de quota, faturamento, objetos orfaos ou overhead.
- Nao ha bucket de backup no inventario. Nao foram consultados conteudos de
  objetos, credenciais, dados comerciais ou mensagens.

## Decisao de armazenamento proposta

Supabase Storage e **candidato para QA**, nao destino homologado. Sua interface
S3 documenta operacoes usuais de upload, leitura, listagem e multipart. Isso
nao prova compatibilidade completa com restic: um roundtrip real precisa passar.

Propor bucket PRIVADO exclusivo `infra-backups-qa`, prefixo
`kan133/evolution-qa/`. Nunca reutilizar `store-files`, mudar sua privacidade ou
suas policies: o bucket publico atende o app. Nao inserir/deletar registros de
`storage.objects` por SQL para criar/remover arquivos; usar API Storage/S3.

Ferramenta candidata: restic, versao exata a fixar antes de instalar, com
criptografia autenticada no cliente e transporte HTTPS. Deixar a senha do
repositorio em secret root-only; a recuperacao dessa senha precisa existir
fora da VPS, em cofre controlado pelo time. Nao guardar a unica chave apenas
dentro do backup que ela mesma desbloqueia.

Gates antes da escolha definitiva:

1. Confirmar plano, quota efetiva de storage/egress e limites de upload do
   projeto, sem pressupor plano gratis ou contratar upgrade.
2. Medir tamanho real do conjunto exportado, overhead e crescimento por 7 dias,
   prevendo tambem espaco para o ensaio de restore e margem do app.
3. Validar S3 HTTPS/region e restic init, backup, check com leitura de dados e
   restore de fixture sintetica em prefixo exclusivo, com permissao de escrita.
4. Confirmar o escopo da credencial. Chaves S3 geradas do projeto podem ter
   amplo acesso e bypass RLS: bucket privado NAO limita essa chave. Nao copiar
   service_role/S3 amplo do app para a VPS como atalho. Exigir aprovacao explicita
   do risco ou alternativa com principal/RLS restrito ou projeto separado.
5. Confirmar protecao de acesso de anon/usuarios do app e inventariar policies
   existentes. Backend restrito deve permitir exatamente as operacoes da
   ferramenta; JWT restrito exige renovacao segura para automacao.
6. Avaliar projeto separado ou outro S3 se quota, credencial ou disponibilidade
   nao forem adequadas. Criar recurso/contratar plano exige nova autorizacao.

Supabase S3 nao oferece versionamento/Object Lock/lifecycle S3 nesta interface.
Nao alegar imutabilidade, anti-ransomware ou descarte automatico por lifecycle.
Free projects podem pausar; plano atual nao foi confirmado. Uma pausa ou perda
do projeto pode impedir recuperar a VPS. E offsite em relacao ao host, mas
continua dependencia compartilhada do app. Nao homologar esse arranjo para
producao sem revisar isolamento e disponibilidade.

## Consistencia e fontes de backup

Contrato futuro: `pg_dump` logico com o binario PostgreSQL 17 da imagem fixada,
arquivo customizado e validacao por `pg_restore`. Nao copiar PGDATA quente como
se fosse backup consistente. Roles/ownership devem ser reconstruidos por init
testado e secrets recuperados, sem imprimir senhas.

Para snapshot coerente entre DB, Redis e volume de sessoes:

1. Obter lock global contra backup/restore/update concorrente, verificar
   pre-requisitos, destino acessivel, RAM/disco e ultima copia recuperavel.
2. Registrar IDs/estado; pausar somente Evolution QA dentro de janela autorizada.
   Garantir retomada em finally/trap, inclusive falha de exportacao, sinal ou
   upload. Health e retomada precisam ser comprovados; falha deve alertar.
3. Com escritores parados, exportar PostgreSQL; exportar Redis consistentemente
   por SAVE/shutdown controlado ou metodo oficial verificado. Nunca copiar
   AOF mutavel sem coordenar escrita/rewrite. Nao usar FLUSHALL.
4. Capturar volume Evolution de sessoes, configuracao versionada, configs
   Docker efetivas, arquivos essenciais EasyPanel/proxy/TLS/hardening e recovery
   secrets. Inventariar paths e exclusoes; Docker inspect pode conter segredos,
   portanto nao publicar seu output em logs/Jira.
5. Retomar e validar Evolution imediatamente apos snapshot local consistente;
   envio offsite pode ocorrer depois, sem alongar downtime. Remover staging
   plaintext com ownership/paths validados e permissao 0700/0600, sem alegar
   secure erase fisico em SSD.
6. Registrar manifesto com versoes/digests, schema, tamanho, timestamps UTC,
   hashes e identidade da execucao, sem chaves, QR ou dados pessoais.
7. Criptografar/enviar, conferir snapshot remoto e fazer verificacao de leitura.
   Atualizar last_verified_offsite_success apenas apos confirmacao remota.
   Dump local, tentativa de upload ou mero exit0 de export nao contam como RPO.

PG/Redis/sessoes/configuracoes precisam do mesmo ponto consistente. Se houver
sessao pareada futura, impedir que o clone se conecte ao WhatsApp. O backup
contem material sensivel mesmo sem mensagens; nunca usar arquivo publico.

## Agendamento e retencao propostos

- Meta baseline QA: RPO <=24h, RTO <=8h, retencao minima 7 dias.
- Propor backup a cada 12h com timer systemd persistente e timeout; isso deixa
  margem para retry antes de ultrapassar RPO. Nao e PITR ou politica produtiva.
- Lock/retry com backoff, janela de QA definida e risco de parada curta aceito.
- Propor retencao restic `keep-within 7d` mais pelo menos duas copias verificadas
  independentes. Simular politica sobre fixtures antes de apagar dados reais.
- Automatic prune DESABILITADO nesta preparacao. So habilitar apos backup mais
  novo validado, restore testado e aprovacao da politica/escopo de descarte.
- Restricao de prefixo/repositorio QA, sem exclusao de bucket ou dados do app.
- Falha ou repositorio corrompido bloqueia prune. Verificar partial snapshots e
  packs referenciados; delecao simples por idade nao implementa retencao restic.
- Cache/staging/logs locais limitados; nao conservar copias plaintext sem necessidade.

## Restore isolado e prova de RPO/RTO

O ensaio futuro deve baixar do destino EXTERNO, nao reutilizar dump local para
alegar que testou recuperacao. Usar rede Docker isolada sem egress, sem portas
publicadas, sem webhook e sem conexao a redes QA/proxy. Containers/volumes de
restore exclusivos, labels de ownership e limites compativeis com 4 GB.

1. Recuperar secret do cofre externo e snapshot escolhido. Validar integridade.
2. Criar PostgreSQL 17 novo e Redis exclusivo; restaurar init/roles, pg_restore,
   export Redis e volume de sessoes com permissoes corretas.
3. Conferir schema/migrations, contagens relevantes, settings/identidade de
   instancia e sessao, fingerprint sem expor credenciais e amostras Redis.
4. Subir Evolution isolada sem pareamento, webhook ou saida externa. Validar API
   autenticada internamente, versao e leitura de configuracao restaurada.
5. Conferir tambem configuracoes/secret recovery e capacidade de reconstruir
   o servico. Nunca sobrescrever config live do painel/firewall para esse ensaio.
6. Medir UTC inicio/fim incluindo download, decriptacao, recriacao e verificacao.
   RTO de ensaio nao comprova novo provisionamento/DNS em desastre total: medir
   ou estimar separadamente com essa limitacao registrada.
7. RPO medido usa ponto consistente de captura, nao termino tardio do upload.
   Demonstrar janela entre backups verificados; agenda sozinha nao comprova RPO.
8. Salvar evidencias sanitizadas no D:/ e resumo no Jira. Remover SOMENTE recursos
   de restore pertencentes ao ensaio apos confirmar que os servicos live ficaram
   intocados e healthy. Nunca `prune --volumes` ou overwrite de dados live.

Nao criar sessao pareada ou enviar mensagens durante restore. KAN-134/KAN-136
homologam telefone/mensagens; isso nao e mock de um restore que nao aconteceu.

## Observabilidade e alertas

Coletor leve proposto a cada 60s, dados numericos sanitizados, sem ler mensagens:

| Sinal | Condicao proposta |
| --- | --- |
| CPU | >60% sustentado por 15min, conforme baseline |
| RAM | >70% sustentado por 15min; OOM sempre alerta |
| Disco | >=70% e tendencia de esgotamento; nunca esperar 100% |
| Evolution | HTTPS/TLS e endpoint protegido, status inesperado/timeout |
| Containers | replicas/health, task churn do Swarm, reinicios e OOM |
| Backup | falha imediata; idade offsite >=18h warning, >=24h critical |
| Entrega alerta | falha de envio e heartbeat ausente no watchdog externo |

Swarm substitui containers: RestartCount de um container isolado nao basta.
Persistir task/container IDs e comparar estado entre amostras. Collector HTTP
nao segue redirect com API key. Logs de metricas nao contem payload de API.

Deduplicar, aplicar cooldown e notificar recovery para evitar tempestade de
alertas, sem silenciar falha persistente. Canal e destinatario NOMINAL ainda
nao definidos. Escolher email SMTP/API, Telegram ou webhook privado existente;
teste de entrega precisa chegar ao destino real e ter comprovacao.

Coletor dentro da VPS nao avisa sozinho quando ela cai. Exigir watchdog fora
da VPS para HTTPS e ausencia de heartbeat/backup. Sem esse recurso, checklist
de disponibilidade e alertas nao pode receber PASS. Nao contratar servico pago
ou usar o PC do usuario como unico monitor permanente sem acordo explicito.

## Logs e privacidade

KAN-132 limita logs dos tres servicos a 3x10MiB e redige valores dos secrets
recebidos; nao garante eliminar QR, tokens futuros ou conteudo de mensagens.
Propor logs operacionais de backup/monitor com allowlist de eventos/campos e
retencao temporal de 7 dias mais teto de tamanho; revisar journald e logrotate
efetivos antes de habilitar. Containers continuam com teto por tamanho.

Nao registrar stdout completo de restic, URLs assinadas, dump, Session.creds,
API responses, SMTP credentials, QR ou telefone. Redirecionar stderr bruto para
diagnostico root-only temporario quando necessario; sanitizar antes de reportar.
Testar canarios sinteticos e comparar valores reais dos secrets sem imprimi-los.
Nao anunciar logs livres de todo conteudo sensivel ate validar esses controles.

## Matriz de aceite futuro

| Criterio Jira | Evidencia obrigatoria | Estado atual |
| --- | --- | --- |
| PostgreSQL automatico | timer ativo + dump real valido + offsite confirmado | Pendente |
| Volumes/configuracoes | manifesto completo + hashes recuperados | Plano apenas |
| Copia externa | upload e download criptografados em bucket privado | Pendente |
| Retencao/criptografia/descarte | configuracao + fixtures + politica aprovada | Proposta |
| Restore completo | clone isolado real + API/config/dados restaurados | Nao executado |
| CPU/RAM/disco/availability/restarts | series e falhas exercitadas | Plano apenas |
| Alertas | falha backup, disco baixo e outage com entrega real | Canal pendente |
| Logs | canarios + configuracao efetiva + inspeccao sanitizada | Pendente |
| RPO/RTO | tempos e janela de recuperacao medidos | Metas apenas |

## Proximos passos

1. Aprovar destino, isolamento/quota/custo e credenciais de minimo privilegio.
2. Definir destinatario/canal e watchdog externo.
3. Autorizar instalacao/configuracao e janela curta de QA explicitamente.
4. Implementar executores/timers/alertas e rodar a matriz acima, com revisor.
5. Marcar checklist real e mover para Teste so depois do aceite operacional.

KAN-140 depende de backup restauravel antes do cutover para EasyPanel. Este
PR de planejamento nao desbloqueia essa migracao nem homologa producao.

## Validacao local

```powershell
node scripts/infra/kan133/plan.cjs
node --test scripts/infra/kan133/plan.test.cjs
bun test --isolate scripts/infra/kan133/plan.test.cjs
```

Nao ha deploy.sh, criacao de bucket, install ou restart automatico neste pacote.

## Referencias oficiais consultadas

- [Baseline interno](kan127-hostinger-vps-baseline.md)
- [Infra Evolution existente](kan132-evolution-infra-runbook.md)
- [Supabase S3 compatibility](https://supabase.com/docs/guides/storage/s3/compatibility)
- [Supabase S3 authentication](https://supabase.com/docs/guides/storage/s3/authentication)
- [Supabase Storage pricing](https://supabase.com/docs/guides/storage/pricing)
- [Supabase Free project pausing](https://supabase.com/docs/guides/platform/free-project-pausing)
- [Restic repository setup](https://restic.readthedocs.io/en/stable/030_preparing_a_new_repo.html)
- [PostgreSQL 17 pg_dump](https://www.postgresql.org/docs/17/app-pgdump.html)
