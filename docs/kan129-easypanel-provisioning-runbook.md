# KAN-129 - Provisionamento da VPS e EasyPanel

## Objetivo

Registrar o provisionamento reproducivel do host de QA/staging da Clica e
Pede, incluindo criterios de aceite, acesso administrativo e recuperacao.
Este runbook complementa o baseline definido na KAN-127.

Nenhum token, senha, endereco IP ou chave privada deve ser versionado neste
arquivo.

## Decisao de plataforma

A VPS KVM 1 contratada foi mantida como ambiente exclusivo de QA/staging. O
sistema original, Ubuntu 26.04, foi substituido pelo template oficial da
Hostinger `Ubuntu 24.04 with Easypanel` porque a Hostinger homologa a EasyPanel
nesse template e a documentacao da EasyPanel requer um Ubuntu limpo com pelo
menos 2 GB de RAM e as portas 80 e 443 disponiveis.

O host continua fora do escopo de producao. O baseline da KAN-127 permanece
valido: producao exige uma VPS separada e dimensionada antes do go-live.

## Configuracao aplicada

| Item | Configuracao |
| --- | --- |
| Uso | QA/staging |
| Plano | Hostinger KVM 1 |
| Regiao | Boston, Estados Unidos |
| Sistema | Ubuntu 24.04 LTS com EasyPanel oficial |
| CPU | 1 vCPU |
| Memoria | 4 GB |
| Disco | 50 GB NVMe |
| Hostname | `ops-staging` |
| Timezone | `America/Sao_Paulo` |
| Acesso SSH | Chave Ed25519 nominal, armazenada fora do repositorio |
| Painel planejado | `ops-staging.clicaepede.com.br` |
| Portas publicas | 80/tcp e 443/tcp |
| Porta administrativa inicial | 3000/tcp, sem exposicao publica permanente |

## Procedimento executado

1. Confirmar pelo MCP da Hostinger que a VPS estava ativa e sem projetos
   Docker, chaves SSH, firewall, snapshot ou backup.
2. Registrar uma chave SSH exclusiva para a infraestrutura de QA.
3. Criar um script pos-instalacao para:
   - configurar `America/Sao_Paulo`;
   - definir o hostname `ops-staging`;
   - instalar a chave publica no acesso do root;
   - atualizar os pacotes do sistema;
   - habilitar o Docker no boot.
   A versao reproduzivel e sem segredos fica em
   `scripts/infra/kan129-bootstrap.sh`. A chave publica e fornecida somente em
   runtime por `KAN129_SSH_PUBLIC_KEY`.
4. Recriar a VPS vazia com o template oficial Ubuntu 24.04 + EasyPanel.
5. Validar sistema, recursos, Docker, EasyPanel, proxy e portas.
6. Aplicar o firewall da Hostinger antes de hospedar workloads.
7. Reiniciar a VPS e repetir as validacoes de saude.

## Politica de rede

| Porta | Origem | Uso |
| --- | --- | --- |
| 22/tcp | IP administrativo autorizado | SSH por chave |
| 80/tcp | Publica | HTTP e emissao/renovacao de certificado |
| 443/tcp | Publica | Proxy HTTPS |
| 3000/tcp | Bloqueada publicamente | Setup via tunel SSH ate o dominio operacional |
| 5432/tcp | Bloqueada | PostgreSQL interno |
| 6379/tcp | Bloqueada | Redis interno |
| 8080/tcp | Bloqueada | Evolution interna, atras do proxy |

O acesso inicial ao painel deve usar tunel SSH:

```powershell
ssh -i CAMINHO_PROTEGIDO_DA_CHAVE `
  -L 3000:127.0.0.1:3000 root@HOST_PROTEGIDO
```

Com o tunel ativo, abrir `http://127.0.0.1:3000`. Depois da configuracao de
DNS e TLS, o painel deve responder somente pelo dominio operacional com HTTPS.

## Validacao tecnica

Executar no host:

```bash
hostnamectl
timedatectl
nproc
free -h
lsblk
docker version
docker info
docker node ls
docker service ls
ss -lntp
systemctl --failed
```

Resultados esperados:

- hostname `ops-staging`;
- timezone `America/Sao_Paulo`;
- 1 vCPU, aproximadamente 4 GB de RAM e 50 GB de disco;
- Docker e Swarm ativos;
- servicos da EasyPanel e do proxy em execucao;
- portas 80 e 443 atendidas pelo proxy;
- nenhuma porta de banco ou Redis publicada;
- zero unidades systemd com falha critica.

### Evidencia de aceite

Validacao executada em 01/10/2026, depois da reinstalacao, do hardening e de
reinicializacoes controladas. A saida sanitizada dos comandos, sem IPs ou
segredos, esta em `docs/evidence/kan129-acceptance-2026-10-01.txt`.

| Verificacao | Resultado |
| --- | --- |
| Sistema | Ubuntu 24.04.5 LTS |
| Hostname | `ops-staging` |
| Timezone | `America/Sao_Paulo` |
| Recursos | 1 vCPU, aproximadamente 4 GB de RAM e 50 GB de disco |
| Docker | Ativo |
| Swarm | Ativo |
| EasyPanel | Replica `1/1` |
| Proxy EasyPanel | Replica `1/1` |
| Unidades systemd com falha | Zero |
| Pacotes atualizaveis | Zero |
| SSH por chave | Aprovado antes e depois do reboot |
| Login root por senha | Bloqueado e senha temporaria removida |
| Firewall Hostinger | Ativo e sincronizado |
| 80/tcp e 443/tcp | Acessiveis |
| 3000/tcp | Bloqueada publicamente; HTTP 200 via tunel SSH |
| 5432/tcp, 6379/tcp e 8080/tcp | Bloqueadas publicamente |
| Snapshot inicial | Criado depois do hardening; temporario, nao e backup |
| Reboot | EasyPanel, proxy, firewall e chave preservados |

## Reinicializacao controlada

Antes do reboot, registrar o estado dos servicos e confirmar que nenhuma
implantacao esta em andamento. Reiniciar pelo MCP da Hostinger e aguardar o
estado `running`. Depois, repetir todas as validacoes acima e confirmar que a
EasyPanel e o proxy retornaram sem intervencao manual.

## Recuperacao

### Falha de acesso

1. Confirmar o estado da VPS no hPanel.
2. Usar o console web da Hostinger.
3. Verificar `/var/log/clicaepede-kan129-bootstrap.log`.
4. Corrigir a chave em `/root/.ssh/authorized_keys` se necessario.
5. Nao liberar a porta 3000 publicamente como atalho.

### EasyPanel indisponivel

1. Validar Docker e Swarm.
2. Inspecionar os servicos e logs da EasyPanel.
3. Reiniciar somente o servico afetado.
4. Se o host estiver comprometido, ativar o modo de recuperacao da Hostinger.
5. Restaurar backup somente como ultimo recurso, pois a restauracao sobrescreve
   integralmente o estado atual.

### Reprovisionamento

Como este host e de QA, a recuperacao de desastre pode recriar o template
oficial e executar `scripts/infra/kan129-bootstrap.sh`, fornecendo a chave
publica somente em runtime. Dados persistentes dos workloads futuros precisam
de backup externo; snapshot local nao substitui backup.

O snapshot inicial criado durante esta tarefa e temporario e expira conforme a
politica da Hostinger. A politica diaria externa com retencao de sete dias
definida na KAN-127 continua como gate antes de armazenar dados persistentes.
Esta tarefa valida a recuperacao por reprovisionamento do host vazio; ela nao
declara que o backup futuro dos workloads ja esta implantado.

## Checklist operacional

- [x] VPS provisionada conforme o baseline.
- [x] Ubuntu 24.04 atualizado.
- [x] Hostname e timezone validados.
- [x] EasyPanel oficial saudavel.
- [x] Metodo de acesso administrativo validado.
- [x] Portas 80 e 443 disponiveis para o proxy.
- [x] CPU, RAM e armazenamento reconhecidos.
- [x] Reinicializacao concluida sem perda de configuracao.
- [x] Procedimento de recuperacao documentado.

## Referencias

- [EasyPanel - Getting Started](https://easypanel.io/docs)
- [Hostinger - EasyPanel VPS template](https://www.hostinger.com/support/8703798-how-to-use-the-easypanel-vps-template-at-hostinger/)
- `docs/kan127-hostinger-vps-baseline.md`
