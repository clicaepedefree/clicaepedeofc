# KAN-140 - Migracao de gestao da Evolution QA

## Atualizacao de 23/11/2026

PR179 mergeado em d36cdb1. Executor instalado nos caminhos canonicos com
hashes conferidos. Restore Compose pos-merge PASS61.017s, tentativa
d7c2505299824a388cf2cd491741900f: 37 tabelas/1243 linhas, uma instancia e
sessao, conexoes PG/Redis reais, reinicio, integridade e cleanup. Recibo
oficial anterior preservado. Nenhum corte de producao foi realizado.

### Controlador nativo: ensaio com arquivos ficticios

Projeto clica-qa ja existia vazio. Criado um unico controller evolution-qa
com servico sintetico: imagem PG fixada, sem servidor PostgreSQL iniciado,
sem rede, portas ou volumes reais. Dois arquivos ficticios iguais sob
diretorio root0700 foram montados somente para leitura. O comando efetivo
confere acesso e igualdade desses arquivos. Container inspecionado com
binds, imagem, entrada e comando exatos; exit0 e sem OOM.

A primeira tentativa falhou antes de criar containers. EasyPanel2.38.1
createComposeService armazena source inline, mas o deploy automatico nao
encontrou code/docker-compose.override.yml: o diretorio de codigo ainda
nao existia. Confirmado no codigo instalado, por leitura: o endpoint
suportado updateComposeSourceInline materializa docker-compose.yml.
Usar esse endpoint com a fonte exata e depois deploy resolveu o ensaio.
Nao criar arquivos internos do painel manualmente, nao montar a arvore
de segredos no manager nem reiniciar o EasyPanel para contornar isso.

Materializacao passou: projeto Docker Compose clica-qa_evolution-qa,
dois binds de host lidos e controller enabled=false apos stop e readback.
Jobs terminais conferidos. Nao repetir create. Intento persistido antes
da materializacao impede retentativa entre processos; container anterior
com o mesmo nonce rejeita a prova. Resultado ambiguo exige inspect/reconcile,
nao repeticao automatica de deploy. SIGTERM/SIGINT fazem unwind e cleanup;
SIGKILL/perda do processo exige reconciliacao manual pelos registros.

HTTP200 vazio em mutacoes void e um ACK valido do painel, nao uma prova de
estado. Reads vazios continuam rejeitados. Token de login chega somente
em memoria por SSH/stdin; logout revoga a sessao. Nenhuma credencial, fonte
privada ou log bruto e emitido em diagnosticos.

### Transferencia fisica: ensaio independente

volume_transfer.py oferece transferencia offline com destinos novos e
quiescencia de escritores, manifestos TAR limitados e hashes de conteudo,
UID/GID, modos e diretorios. Recusa links e tipos especiais. O rollback
copia os dados ATUAIS gerenciados para volumes de retorno novos; nunca
sobrescreve o volume legado com um snapshot antigo.

Ensaio nativo com tres volumes aleatorios passou sob backup.lock: copia
inicial (10bytes/3entradas), escrita nova somente no destino e retorno
(27bytes/4entradas), com bytes e metadados conferidos por oracle separado.
Fonte inicial preservada e cleanup_verified=true. Todos os helpers sem
rede/portas, rootfs readonly, imagem exata e capacidades restritas.
Sinais controlados percorrem cleanup; SIGKILL nao oferece essa garantia.
Esse ensaio nao inicia banco nem comprova consistencia transacional ou
rollback do controlador real: complementa, nao substitui, o restore acima.

### Estado e limites

managed_lifecycle.py e uma biblioteca sem CLI de ativacao. Sob backup.lock,
registra intents antes das mutacoes, publica fence antes da parada, exige
desired=0 e ausencia de escritores, usa destinos novos e emite ownership
somente depois da verificacao. Retorno explicito copia dados atuais para
volumes de rollback novos e publica geracao/ServiceSpec completos antes
de retomar os servicos. Nao remove o fence nem reproduz mutacoes ambiguas.
Falhas ou interrupcoes de rollback parcial exigem reconciliacao manual.
Dezesseis testes offline cobrem ordem, falhas antes/depois das mutacoes,
polling transitorio, colisao de identidade e preservacao dos dados atuais.
Regressoes usam o atomic writer e runtime.load reais para validar os pins
do rollback, reservam prazo independente para containment apos timeout e
recusam fonte estrangeira antes de desabilitar o controlador.
Isso nao comprova operacao real: a integracao do SDK Engine full-ServiceSpec
e os gates externos continuam explicitamente bloqueados por padrao.

Swarm original permanece unico runtime real, com tres servicos saudaveis
e volumes originais. Nenhum ownership/fence ativo, rota alterada, mensagem,
QR ou reconexao. Worker OFF e timer inactive/disabled. Controller do painel
contem APENAS fixture desabilitada, nao a Evolution real administravel.

Faltam corte com dados reais, dominio nativo sem rota concorrente,
rollback operacional e aceite do backup/monitoramento no runtime final.
Nao mover KAN140 para Teste/Done por esses ensaios. Conector Jira nesta
retomada pediu reautenticacao; evidencias locais nao equivalem a anexos
publicados no Jira.

## Atualizacao de 22/11/2026

PR178 mergeado em d406b9a. runtime.py, backup.py e monitor.py aprovados
instalados na VPS sob backup.lock, com hashes anteriores conferidos e
backup de codigo. Sem manifesto ativo, reinicio de servico ou cutover.
Bot permanece explicitamente pausado no aplicativo, webhook e worker.

Novo backup oficial e restore offsite apos instalacao: PASS em 52.406s
(validador49.139s), 37 tabelas/1243 linhas, 13 chaves Redis com AOF e uma
instancia/sessao. EVO_START inicia o servidor REAL: no digest instalado,
db:generate gera o cliente Prisma e start:prod executa node dist/main.
Nao executar deploy_database.sh/migracoes no ensaio de recuperacao.

### Ensaio integrado Compose

compose_restore.py reutiliza o validador oficial por uma classe separada:
recursos novos, volumes externos rotulados e um unico bridge internal com
gateway modes isolated. Sem rede do proxy, portas, DNS externo, bot/worker,
downloads/builds, endpoints de connect/send/QR/logout ou ownership de producao.
O servidor real, dependencias e dados restaurados sao usados; nao e um stub.
Healthchecks da imagem sao desabilitados somente no ensaio e substituidos
por readiness/API explicitos. Isso NAO comprova os healthchecks do cutover.

Compose cria um servico selecionado por vez, sem depends_on/links/build.
Na versao5.5.1 instalada, create nao oferece --no-deps; usar --no-build
--pull never. Valores literais sao escapados para impedir interpolacao de
$ em JS/shell/env. Secret copies ficam readonly sob pai root0700; JSON
gerado e env vazio sao600. O rollback/fencing canonico nao e alterado.

O ensaio compara todas as linhas/sequencias pelo oracle limitado antes do
startup e com Evolution parada apos o startup. Depois reinicia PG/Redis e
Evolution e repete integridade/API/dependencias. Conexoes reais sao atribuidas
ao IP do container Evolution em pg_stat_activity e CLIENT LIST, excluindo
probes/loopback/ping; nao basta o script conseguir conectar aos bancos.
Arquivos de sessao sao comparados quiescidos antes/depois do reinicio por
stream TAR sem extracao, com limite total72MiB, dados64MiB, 10000 entradas
incluindo diretorios e deadline. Links e tipos especiais sao rejeitados.

rehearsal_offsite.py e opt-in Linux/root. Confere hashes dos modulos canonicos,
carrega caminhos exatos e rejeita caches de modulo. Usa o downloader/offsite
canonico sem editar seus arquivos, chaves ou recibo oficial. Identidade age
somente por stdin. O resultado separado last_compose_rehearsal.json usa UUID
de tentativa e running/finalizing antes de PASS; erros nao reaproveitam PASS
antigo. PASS exige limpeza booleana verdadeira, plaintext removido, recibo
persistido e lease liberado. Saida publica so contem contagens, flags e digest.
Consumidores devem usar o attempt do resultado da execucao, nao apenas um
recibo historico. Falha anterior ao inicio validado nao atualiza o recibo.

### Evidencias desta etapa

- Probe nativo SIGKILL sintetico: PASS2.707s, recuperador canonico removeu
  tres recursos e dois diretorios, lease ausente e IDs ativos inalterados.
  O container fixture nunca iniciou e nao tinha credenciais/dados reais.
- Ensaio Compose com backup REAL de QA: PASS66.754s, 37 tabelas/1243 linhas,
  uma instancia/sessao; PG semantic rows/sequences, Redis AOF, API401/200,
  dependencias reais e reinicio dos tres componentes validados. Arquivos
  de sessao e cleanup confirmados. Sem mensagens nem reconexao fisica provada.
- Tentativa4b951b5ef51a47969a9b0f2b26d03b7c; fingerprint do PG
  4a59ced2be36573caa78fd194e962b40872cbe0443586545632740519ffd4ce3.
- 377 testes locais:352 PASS/25 SKIP. Skips nao contam como aceite executado.
- Falhas de fixture/pacote e flags CLI foram preservadas, nao convertidas
  em sucesso. A tentativa real A falhou antes de iniciar os servicos por
  representar CapDrop como CAP_NET_RAW; o teste agora aceita somente essa
  grafia ou NET_RAW e continua rejeitando ausencia/CapAdd. Cleanup confirmado.

O ensaio prova restauracao integrada em Compose, NAO administracao dos tres
servicos pelo EasyPanel, transferencia de rota, corte/rollback de dados em
producao ou notificacao WhatsApp. Esses itens seguem pendentes. KAN140 fica
Em andamento e9/19; nao mover para Teste/Done por este resultado isolado.

## Atualizacao de 21/11/2026

### Pos-merge PR177 e novo gate de retorno

PR177 mergeado em 36887b8. Os adaptadores aprovados foram instalados com
backup de codigo, verificacao dos hashes anteriores e backup.lock exclusivo.
Nenhuma propriedade ativa foi publicada e nenhum cutover foi executado.
O backup oficial posterior (15:49:51 UTC) e o restore offsite passaram:
46.021s, PostgreSQL 37 tabelas/1242 linhas, Redis AOF, instancia/sessao
armazenada e limpeza isolada. O restore continua sendo o validador oficial
existente; nao comprova o startup completo das tres aplicacoes em Compose.

O retorno passa a ter ownership explicito runtime=swarm, state=active e
geracao nova. Nao remover managed/ownership para voltar ao legado. Publicar
swarm.json com IDs completos e ServiceSpecs exatos, ContainerSpec SHA-256,
volumes kan140_rollback_* e recibo compose-disabled.json vinculado a geracao
e hash da fonte. O recibo so pode ser emitido APOS desabilitar o controlador
Compose via API suportada e provar ausencia de escritor concorrente. Ele
nao substitui essa acao. Os markers usam service_id no Swarm e container_id
no Compose; nunca aceitar marker de geracao/backend anterior. Fonte e
ServiceSpec permanecem exatos; somente omissoes dos defaults Docker conhecidos
sao equivalentes no TaskSpec (runtime, DNS vazio, grace 10s e restart padrao).

swarm_control_test.py e opt-in: cria tres sleepers sinteticos com imagem PG,
volumes separados, namespace privado e limites pequenos. Valida pausa/retorno
com novo container, marker obsoleto recusado e controlador oposto bloqueado.
Nao testa Evolution/Redis como aplicacoes, dados reais ou um corte completo.
As tentativas com falhas de fixture/defaults/cleanup foram preservadas.

data_snapshot.py e um oracle read-only de ensaio, ainda NAO integrado ao
arquivo de backup nem ao restore oficial. Compara hashes das linhas completas,
duplicatas, SQL NULL versus JSON null e estado exato de sequencias. Identificadores
sao cotados no servidor e search_path restrito a pg_catalog. Exige quiescencia
externa para comparar sequencias, que nao sao transacionais. Limites:
512 tabelas/sequencias, 100000 linhas/tabela, resposta 512KiB, linha estimada
1MiB, statement 8s/transaction 60s. Tipos nao suportados nao nulos, JSONB
comprimido/grande ou numeros extremos falham fechado; nao emitir comparacao
parcial como aceite. PG nativo isolado passou em 24.168s, incluindo coluna
chamada t, overload em public, TOAST e numericos JSONB adversariais.

Firewall Hostinger 369765 sincronizado e associado a VPS2017403: SSH somente
origem /32 autorizada, HTTP/HTTPS liberados, sem regra para 3000. IPv6 externo
chegou ao 443 e recebeu 418; 3000 expirou. Loopback/global IPv6 tambem negados
no proxy. Isso e evidencia de acesso, nao prova que a migracao aconteceu.

Ainda faltam ensaio conjunto com dados reais isolados, gestao UI, dominio
nativo Evolution, transferencia unica de ownership e rollback de dados.
Bot e worker permanecem desligados. Nao mover KAN-140 para Teste/Done por
terem passado os probes sinteticos.

KAN-161 encerrada apos PR176 mergeado e restore **canonico** offsite PASS
em 43.294s. Hash, descriptografia, PostgreSQL (37 tabelas/1241 linhas),
Redis apos reinicio AOF, instancia/sessao armazenada e cleanup aprovados.
Isso libera a preparacao da migracao, nao significa que ela aconteceu.

O administrador autorizou explicitamente recriacao controlada em Compose,
com breve indisponibilidade da Evolution QA, preservando identidade, dados,
versoes e bot desligado. Tambem aprovou a diferenca de secrets: arquivos
root-only montados somente para leitura substituem secrets do Swarm.
Essa alternativa nao tem a mesma protecao em repouso do secret Swarm.

Estado atual:

- DNS painel.clicaepede.com.br aponta para a VPS Hostinger; nameservers
  continuam no provedor autoritativo existente, sem alteracao de MX/app.
- HTTPS nativo EasyPanel ativo, HTTP redireciona 301 e serveOnIp=false.
- Politica deny-only no proxy restringe origem IPv4 administrativa /32,
  bloqueia hostname alternativo e preserva o login proprio do EasyPanel.
- Chrome real isolado: pagina HTTPS, login e logout passaram. Origem
  diferente e X-Forwarded-For falsificado receberam 418. API listProjects
  sem autenticacao recebeu 401; getUser pode retornar null/200 e nao e
  oracle de autorizacao. Evolution segue HTTPS 200. Porta publica 3000
  nao respondeu dentro do timeout, nao usar isso como teste de todas as portas.
- Projeto vazio clica-qa criado e confirmado por API suportada. Ainda nao
  existem Evolution/PostgreSQL/Redis gerenciados por esse projeto.
- Plano Compose validado pelo Docker Compose 5.5.1 instalado, somente
  config --quiet --no-interpolate, sem iniciar recursos. Nao e ensaio
  funcional de Compose nem prova de migracao/persistencia/rollback.
- Stack Swarm original continua saudavel e permanece unica escritora.
  Worker desabilitado, timer inactive/disabled, sem novo QR/envio.

## Operacao do painel

URL diaria: https://painel.clicaepede.com.br. Cada operador deve usar conta
nominal e origem aprovada. As credenciais locais e recibos administrativos
permanecem fora do Git/Jira em diretorio privado. MFA nao foi comprovado;
nao declarar configurado. O controle de acesso aqui e origem restrita mais
login proprio, nao apenas URL oculta.

Se o IP administrativo mudar, acessar pelo tunel SSH nominal de recuperacao
e atualizar a politica via setCustomConfig. Nao abrir 3000. Adicionar o novo
IP antes de remover o anterior apenas durante janela autorizada; verificar
o acesso e revogar a origem/conta que nao deve mais operar. O teste de
origem usa ClientIP, nunca cabeçalhos X-Forwarded-For enviados pelo cliente.
IPv6 nao integra a allowlist; antes de adicionar um operador IPv6, revisar
a politica e comprovar negação/aceite reais, sem liberar redes amplas.

O tunel e encaminhamento local para o servidor remoto, nao hospedagem no
computador do operador. Continuar usando a chave nominal e known_hosts
previamente aprovados; nao resetar senha novamente para automacao.

TLS e dominio pertencem ao mecanismo nativo setPanelDomain do EasyPanel.
Preservar o resolver ACME e monitorar validade/erros de renovacao. Os guards
nao criam backend nem emitem certificados; apenas negam acessos.
Rollback de acesso: pelo tunel, restaurar via APIs suportadas os valores
anteriores de setPanelDomain/setCustomConfig guardados nos recibos privados,
mantendo guards existentes e porta publica 3000 fechada. Nao copiar um
snapshot antigo de /etc/easypanel sobre o banco atual do painel.

## Plano Compose sem efeito colateral

scripts/infra/kan140/compose_plan.py recebe bytes JSON do stack canonico,
SHA-256 previamente aprovado e uma geracao inteira positiva. Nao faz I/O,
nao le segredos, nao cria containers e retorna deployment_permitted=false.
O hash deve vir do baseline revisado, nao ser recalculado cegamente depois
de uma alteracao nao aprovada. O ensaio atual conferiu o baseline canonico
03f48f5cd3d1a11ea766754bb369d72ceff4e6524bff46263298a6bd652d28d1.

A traducao preserva digests, entrypoints/redator, healthchecks, env nao
secreto, logging 10m/3, limites CPU/RAM e reserva de memoria. Remove politicas
exclusivas de Swarm (placement/update) e usa restart unless-stopped. O delay
de restart e a reserva de CPU do scheduler Swarm nao sao garantidos por
essa traducao Compose. A rede bridge interna isola bancos; somente Evolution
integra a rede proxy existente e attachable. Nenhuma porta e publicada.

Os tres volumes externos kan140_qa_* devem existir e conter dados validados
antes de criar o servico; external=true impede criacao silenciosa pelo
Compose. Nao compartilhar os volumes ativos clica-evolution-qa_*.
Configs sao copias root-owned em /etc/clicaepede/kan140/configs; secrets
referenciam copias dedicadas em /etc/clicaepede/kan140/mount-secrets.
Ambos os diretorios devem ser root:root 0700, com arquivos 0444 montados
readonly para permitir leitura pelos UIDs dos containers. A travessia dos
diretorios continua proibida aos outros usuarios do host. Os originais de
recuperacao em /etc/clicaepede/evolution-qa/secrets continuam 0600, inalterados.
O manifesto privado exige hashes revisados das oito copias. A sintaxe Compose
nao prova permissoes efetivas: testar init fresco, volume restaurado, UID
PostgreSQL, healthchecks e negacao de travessia no host antes de ativar.
O plano nao comprova que arquivos, permissoes, volumes e dados existem;
esses sao gates independentes do corte.

Ensaio nativo sintetico compose_mount_test.py: PASS em 11.177s na VPS,
com PostgreSQL 17.11 fixado, network none, sem portas e limite 256MB/0.25CPU.
Comprovou init fresco/role restrita, leitura pelo UID postgres, binds readonly,
negacao de travessia pelo UID 65534 no host, reinicio com persistencia e
cleanup exato de container/volume. Nao usou credenciais, banco ou sessao reais.
A primeira tentativa falhou na fixture (senha sintetica sem newline para
read -r) e no diagnostico de ausencia do Docker; foi preservada, corrigida
e repetida em novo diretorio. Nao representa restore de dados reais para
Compose, migracao completa ou teste de toda a aplicacao.

## Contrato preparatorio de ownership

Os adaptadores Compose do PR177 ja foram instalados conforme a atualizacao
acima. A extensao de retorno Swarm desta etapa ainda e candidata em revisao.
Os testes offline nao substituem aceite nativo do backup/monitor com Compose.
Nao escrever um manifesto ativo apenas para ultrapassar os gates.

O controle privado usa /etc/clicaepede/kan140/managed (sentinela duravel) e
ownership.json, ambos root-owned 0600. O manifesto schema=1 associa runtime
compose, state active, generation inteira, projeto Compose real, imagens por
role, volumes explicitos, source.path/source.sha256 de compose.json e
mount_hashes das quatro configs e quatro copias de secrets. O nome do projeto
Docker deve ser observado na implantacao gerenciada; nao assumir que coincide
com o nome do projeto exibido na UI.

Sem ambos os arquivos, somente o legado anterior a migracao e permitido.
Se existe qualquer um, ausencia do outro, estado de transicao/bloqueio,
hash/permissao incorreta ou geracao divergente rejeitam a operacao sem fallback
para Swarm. Uma falha apos publicar a sentinela deixa a barreira instalada;
nao remove-la automaticamente para fazer scripts antigos voltarem a funcionar.

O backup usa o lock estavel /var/lib/clicaepede/kan133/backup.lock e vincula
o marker de manutencao a geracao/projeto/hash da fonte e ID exato do container.
O adaptador somente para/inicia container existente validado; nao executa
compose up para recuperar um container ausente. O arquivo canonico KAN132
continua no backup para manter compativel o verificador isolado existente,
junto com o novo manifesto, fonte, configs e copias de montagem criptografados.

A barreira e cooperativa entre scripts revisados, nao impede um root de
executar docker diretamente. A janela de corte precisa impedir redeploys na
UI e reconciliar operacoes em curso; as travas e os markers devem ser testados
com falhas e reinicio antes de se declarar ownership transferido.

## Gates pendentes antes do corte

O PR desta etapa prepara acesso/plano/fencing. Nao marcar a tarefa inteira
como Teste/Done antes do corte e dos aceites abaixo.

1. Instalar somente codigo revisado/mergeado, com backup de recuperacao.
2. Adaptar e validar backup, monitor e recovery ao manifesto de recursos,
   geracao e ownership. Nunca inferir backend pela ausencia de container.
3. Cercar todos os mutadores legados: KAN132 deploy/publish/verify restart
   e cleanup, KAN133 backup/recover/install e KAN151 maintain apply.
   Reconciliar markers pendentes e controlar retries/boot; parar so o
   backup.timer nao impede recovery ou um deploy manual antigo.
4. Ensaiar restauracao e rollback com dados em ambiente isolado sem egress,
   incluindo contrato de novos recursos no backup criptografado.
5. Executar parada controlada com lock unico e writers legados ausentes;
   criar servico Compose por API suportada, sem edicao LMDB/labels falsas.
6. Validar API autenticada, dados, dependencia PG/Redis, pareamento e
   persistencia; confirmar UI gerenciavel e dominio Evolution nativo sem
   rota legada concorrente. Teste de transporte requer autorizacao separada.
7. Desativar antigos somente apos aceite, preservando volumes/secrets e
   rollback. Nenhum prune automatico, reativacao do bot ou migracao do app.

As secoes historicas abaixo registram o baseline anterior; os bloqueios
DNS/login/KAN161 foram resolvidos conforme os recibos desta atualizacao.

## Estado em 19/11/2026

Retomada apos suspensao da VPS. Nao houve cutover, nova stack, alteracao de
proxy, reinicio, escala, reset de administrador ou envio de mensagens.
O app continua na Vercel e o banco comercial continua no Supabase.

Inventario via SSH: Evolution, PostgreSQL e Redis saudaveis, uma tarefa por
servico, tres imagens fixadas por digest e um escritor observado por volume.
Docker secrets e configs preservados; workloads sem portas publicadas.
EasyPanel 2.38.0 com setup concluido (nao comprova login). Sessao Evolution
open; flags de worker WhatsApp e billing desabilitadas. Backup capturado em
19/11/2026 12:00:39 UTC e verificado 12:01:16 UTC, sem recuperacao pendente.
Isso nao substitui novo ensaio de restore para a migracao.

DNS painel.clicaepede.com.br ausente. Nameservers observados:
nspro86.hostgator.com.br e nspro87.hostgator.com.br.

## Bloqueios externos

1. Administrador do DNS deve criar somente A painel, apontando ao IPv4 atual
   da VPS QA. Confirmar na zona autoritativa; nao trocar nameservers, MX,
   verificacoes, dominio do app ou Evolution.
2. Disponibilizar acesso administrativo nominal ao EasyPanel pelo tunel.
   Nao redefinir senha, ler hashes ou criar segundo administrador para
   contornar a autenticacao. Credenciais por canal seguro, nunca Jira/Git.
3. Aprovar janela de manutencao depois do ensaio de restore/rollback.
   Reconexao fisica e mensagens exigem teste combinado; nao religar o bot.

## Preflight reproduzivel

Executar por SSH: sudo python3 preflight.py --expected-ip IP_DA_VPS_QA.
Pode enviar o script pelo stdin: sudo python3 - --expected-ip IP_DA_VPS_QA.
Saida JSON; exit 2 para bloqueio/inventario indisponivel. Exit 0 significa
baseline saudavel, nao autoriza nem executa migracao.

Consulta apenas Docker, API local de status de setup e campos permitidos
do backup/configuracao. Nao emite senhas, env, logs, payloads, QR, telefone
ou conteudo de volumes. Nao comprova firewall externo, IPv6, acesso admin,
restore, reconexao ou exclusividade futura. Observacao pontual nao substitui
lock, fencing e revalidacao durante o cutover.

Testes offline:

    python -B -m unittest discover -s scripts/infra/kan140 -p '*_test.py' -v

## Caminho de migracao e gates

APIs oficiais documentam criacao/deploy de projetos e servicos. Nao foi
confirmada uma API suportada de adocao in-place da stack Swarm nesta versao.
Nao escrever no LMDB nem adicionar labels para simular projeto administravel.
Confirmar suporte a secrets, configs, redes internas e healthchecks antes
de escolher adocao ou recriacao controlada.

1. Obter login autorizado pelo tunel e inventariar configuracao efetiva,
   limites, healthchecks, redes/aliases, TLS, guards e redacao de logs.
2. Ensaiar backup/restore isolado com digests exatos, secrets, PostgreSQL/role
   restrita, Redis persistente e volume da sessao. Clone Evolution sem egress
   e sem concorrer com o numero pareado.
3. Criar contrato unico de recursos/ownership. KAN-132 deploy.sh e
   publish-route.py apontam para a stack antiga; KAN-133 backup.py,
   monitor.py e recovery tambem. Parar so backup.timer nao basta: recovery
   pode escalar a Evolution anterior no boot. Nao executar deploy paralelo.
4. Implementar/testar lock/owner/generation, IDs de servicos e volumes e
   reconciliacao de markers. Confirmar writer antigo ausente antes de iniciar
   substituto. Stop-first sozinho nao coordena duas stacks.
5. Configurar projeto QA e protecao admin antes do dominio. Proposta:
   restricao de origem no proxy mais login proprio com MFA, se suportado.
   Confirmar revogacao e acesso de recuperacao; basic auth nao e MFA.
6. Com DNS valido, usar mecanismo suportado para dominio/TLS. Preservar
   bloqueios de IP/IPv6/hosts alternativos e portas internas; testar
   reconciliacao e rollback sem roteadores concorrentes.
7. Cutover somente em janela aprovada, com unico controlador/escritor.
   Validar API autenticada, UI, dados/reconexao, timers, backup e monitor.
   Ensaiar rollback com dados: reverter imagem/DNS nao reverte escritas.
8. Desativar antigos apos aceite, preservando volumes/secrets/recuperacao.
   Nenhum prune automatico.

Nenhum criterio de migracao passa apenas pelo inventario. Manter KAN-140
em andamento ate implementar e comprovar checklist, depois enviar a Teste.

## Fontes

- [API EasyPanel](https://easypanel.io/docs/api)
- [App service](https://easypanel.io/docs/services/app)
- [Setup](https://easypanel.io/docs/api/setup/getSetupStatus)
- [Dominio](https://easypanel.io/docs/api/settings/setPanelDomain)
- [KAN-132](kan132-evolution-infra-runbook.md)
- [KAN-133](kan133-backup-observability-plan.md)
