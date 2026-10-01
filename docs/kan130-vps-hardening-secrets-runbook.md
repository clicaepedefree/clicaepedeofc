# KAN-130 - Hardening da VPS e governanca de segredos

## Objetivo

Reduzir a superficie de ataque do ambiente de QA/staging sem interromper o
EasyPanel. Este documento nao contem enderecos IP, tokens, senhas ou chaves.

## Acesso administrativo

- O acesso operacional usa o usuario nominal `brunoops` e uma chave Ed25519
  exclusiva, armazenada fora do repositorio.
- O usuario possui `sudo` sem senha para permitir automacao por chave. A chave
  privada deve ficar restrita ao operador autorizado.
- Login SSH remoto como `root`, senha e keyboard-interactive ficam bloqueados.
- A porta 22 permanece limitada no firewall da Hostinger ao IP administrativo
  autorizado. HTTP e HTTPS sao as unicas portas publicas gerais.
- Antes de restringir `root`, uma segunda sessao deve validar login e
  `sudo -n true` com o usuario nominal.

O procedimento reproduzivel esta em `scripts/infra/kan130-hardening.sh`. Ele
recebe a chave apenas em runtime por `KAN130_ADMIN_PUBLIC_KEY`. A primeira
execucao mantem root por chave para permitir o teste externo. Somente depois do
login nominal e `sudo -n true` aprovados, repetir com
`KAN130_DISABLE_ROOT=yes`. A origem administrativa autorizada e fornecida em
runtime por `KAN130_ADMIN_CIDR` e nunca versionada.

## Protecoes do host

- Fail2ban protege o SSH com tres tentativas em dez minutos e bloqueio por uma
  hora. A origem administrativa ja limitada no firewall fica em `ignoreip`
  para evitar o bloqueio da unica rota SSH autorizada.
- `unattended-upgrades` permanece habilitado para atualizacoes automaticas de
  seguranca.
- PostgreSQL, Redis, o setup do EasyPanel e servicos internos nao devem ser
  publicados diretamente. Todo servico web deve passar pelo proxy HTTPS.
- Mudancas de SSH exigem `sshd -t` antes do reload e teste em uma sessao nova.

## Segredos

1. Segredos de aplicacao ficam nas variaveis protegidas do ambiente que executa
   o servico; nunca no Git, imagem Docker, `docker-compose.yml` ou logs.
2. Arquivos `.env`, chaves e diretorios locais de credenciais sao ignorados.
3. `.env.example` documenta somente nomes e valores ficticios.
4. `bun run security:secrets` verifica arquivos versionados e roda na CI.
5. Staging e producao devem usar credenciais, webhooks, bancos e chaves de
   criptografia independentes.
6. Conceder acesso pelo menor privilegio e remover o acesso quando a pessoa ou
   integracao deixar de precisar dele.

## Rotacao

- Rotacionar imediatamente qualquer segredo exposto, suspeito ou acessado por
  pessoa nao autorizada.
- Para rotacao planejada, criar a nova credencial, configurar o consumidor,
  validar, revogar a anterior e registrar data, responsavel e servico afetado.
- Chaves SSH devem ser adicionadas e testadas antes da remocao da chave antiga.
- Nunca registrar o valor do segredo em Jira, PR, evidencias ou documentacao.

## Acesso emergencial

1. Confirmar indisponibilidade do SSH e o estado da VPS no hPanel.
2. Usar o console web da Hostinger com a conta administrativa protegida.
3. Inspecionar `journalctl -u ssh`, Fail2ban e o arquivo de configuracao SSH.
4. Corrigir ou adicionar uma chave nominal, executar `sshd -t` e recarregar o
   SSH.
5. Usar modo de recuperacao ou snapshot somente se o console nao resolver.
6. Registrar o incidente e rotacionar credenciais potencialmente expostas.

## Validacao

Depois de qualquer mudanca:

```bash
ssh -i CHAVE_PROTEGIDA brunoops@HOST_PROTEGIDO
sudo -n true
sudo sshd -T
sudo fail2ban-client status sshd
sudo systemctl is-active unattended-upgrades
sudo ss -lntup
```

De fora da VPS, validar todas as portas TCP e confirmar que somente 22, 80 e
443 respondem, sendo 22 restrita ao IP administrativo. Validar explicitamente
que 3000, 5432, 6379 e 8080 permanecem bloqueadas.

## Reversao segura

Em caso de falha antes do bloqueio de `root`, manter a sessao atual aberta,
corrigir a chave e repetir o teste nominal. Depois do bloqueio, usar o console
web para alterar temporariamente o drop-in SSH, executar `sshd -t` e recarregar
o servico. Nao publicar portas internas como atalho.
