# KAN-140 - Migracao de gestao da Evolution QA

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
