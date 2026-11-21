# KAN-140 - Migracao de gestao da Evolution QA

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
