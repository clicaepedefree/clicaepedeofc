# KAN-131 - DNS, subdominios e TLS

## Estado em 2026-10-06

DNS agora delegado a HostGator (`nspro86.hostgator.com.br` e
`nspro87.hostgator.com.br`), nao aos servidores Registro.br anteriores. O
registrador continua sendo o local da delegacao, mas a zona ativa deve ser
administrada na HostGator. O A de `evolution-staging.clicaepede.com.br` foi
validado nos dois autoritativos e em Google/Cloudflare, TTL 300 segundos.

HTTPS aplicado no proxy da VPS, com certificado Let's Encrypt YR1, SAN exato e
validade ate 2027-01-04. Node TLS confirmou `authorized=true` e curl validou a
cadeia sem ignorar erros. HTTP retorna 301 em GET e 308 em POST para HTTPS, preservando caminho e
query. Nao houve alteracao no app, variaveis ou dominios Vercel.

**Endpoint provisorio, nao Evolution:** o hostname responde HTTP 418 do
`noop@internal`. Nenhuma instancia Evolution foi instalada nesta etapa. Esse
endpoint comprova TLS e roteamento, nao envio de mensagens nem saude do bot.

A configuracao reproduzivel fica em
`scripts/infra/kan131-traefik-qa.yaml` (JSON, subconjunto de YAML). Deve ser
publicada como `.yaml`, nao `.json`, no diretorio persistente
`/etc/easypanel/traefik/config/kan131-qa.yaml`, observado pelo file provider.
Publicar primeiro em arquivo temporario com extensao ignorada e renomear
atomicamente. O arquivo gerado `main.yaml` nao foi editado.

Os catchalls de prioridade 3 substituem os fallbacks/IP do painel (1/2) por
`noop@internal`; hostname QA tem prioridade 100. Essa contencao depende da
configuracao carregada: nunca remover o arquivo inteiro no rollback. Novos
routers de maior prioridade podem superar o bloqueio; rever todos os providers
e testar bypass apos atualizacoes do EasyPanel ou adicao de servicos.

No proxy, contato ACME foi alterado para o email administrativo e
`TRAEFIK_ENTRYPOINTS_{HTTP,HTTPS}_FORWARDEDHEADERS_INSECURE=false`. Houve reinicio
do proxy, com persistencia da configuracao e certificado comprovada depois.
Esses overrides de Docker devem ser preservados ou incorporados a configuracao
suportada do EasyPanel antes de atualizacoes que recriem o servico.

Testes externos apos reinicio: painel por IP IPv4/IPv6 em HTTPS retorna 418;
IP IPv4 em HTTP retorna 418; hostname desconhecido, divergencia Host/SNI e
headers encaminhados falsificados nao retornam interface EasyPanel. Porta 3000
em IPv4/IPv6 teve timeout externo. Tunel SSH nominal em loopback retornou 200
na pagina de login, sem abrir uma porta publica. A VPS tem IPv6 global mesmo
sem AAAA publicado; o teste por IP direto foi necessario. Login do app Vercel
retornou 200 antes e depois; isso e um smoke test, nao regressao funcional.

Revisao de escopo: esta etapa prepara a infraestrutura Evolution de QA,
conforme KAN-127 e hostname aprovado por Bruno. Nao exige criar um novo app
staging, banco Supabase ou instancia Clerk. A exigencia anterior desses
recursos e de um ensaio DNS destrutivo foi excessiva e foi corrigida. O
rollback deve estar documentado; nao foi executado contra a zona ativa.

Renovacao automatica efetivamente testada em laboratorio isolado: Traefik
3.6.7, ACME Pebble 2.8.0, HTTP-01 real e certificados de cinco minutos.
O timer renovou o certificado sem reinicio ou alteracao de relogio/storage,
mantendo a conta ACME. O proxy passou a servir o novo certificado com cadeia
confiavel do laboratorio. Com a CA desligada, o certificado renovado e a
conta persistiram apos reinicio. Nenhuma CA foi instalada no trust store,
nenhuma porta foi publicada e nenhum estado ACME de producao foi utilizado.
O prazo reduzido do laboratorio exercita o timer de um minuto; nao comprova
que o certificado publico ja passou pela sua janela natural de renovacao.

Scripts reproduziveis: `scripts/infra/kan131-test-acme-renewal.sh` e
`scripts/infra/acme-lab/`. Executar com root em host Docker, com curl, openssl,
timeout e python3 disponiveis. Recursos temporarios sao removidos pelo trap;
logs ficam em `/var/log/clicaepede/kan131-acme-*`, sem chaves privadas.
Proteger esses logs operacionais; nao publicar tokens de challenges ACME.

Smoke Chromium na Vercel aprovado: login carregou e aceitou o email QA;
cardapio Ccocobongo carregou sem Application error. Foram gerados screenshots,
video, trace, resultados JSON e relatorio HTML em D:. Nao houve login completo,
pedido ou mutacao de dados; loja fechada por horarios e estado de negocio
existente, nao falha de TLS. Esse teste valida disponibilidade das telas,
nao substitui regressao de pedidos ou a futura integracao do bot.

Checklist DNS/TLS concluido dentro desse escopo e pronto para Teste. O mapa
reserva o app de producao, sem publicar ou migrar esses nomes.

Ao instalar Evolution em tarefa propria, configurar seu servico e dominios no
EasyPanel, verificar credenciais e webhook e retirar **somente** os dois
routers provisorios `kan131-evolution-qa-*` quando a rota gerenciada estiver
pronta. Enquanto eles tiverem prioridade 100, podem superar a rota nova.
Preservar os dois bloqueios `kan131-block-panel-*` e testar painel novamente.

## Historico da preparacao (2026-10-03)

Preparacao, nao publicacao concluida. Em 2026-10-03, a autoridade DNS de
`clicaepede.com.br` foi identificada no Registro.br: `d.sec.dns.br` e
`f.sec.dns.br`. Gustavo administra essa conta. O conector Hostinger nao controla
essa zona; criar registros somente nele nao publica os nomes na Internet.

O app continua em `https://clicaepedeofc.vercel.app`. Nenhum registro, dominio
Vercel, variavel de ambiente ou nameserver foi alterado nesta preparacao. Os
dominios personalizados associados ao projeto Vercel ainda precisam ser
inventariados; nao presumir que a ausencia de um A no dominio raiz prova que
nenhum alias esta configurado no projeto.

As consultas iniciais retornaram NXDOMAIN para `evolution.clicaepede.com.br` e
`staging.clicaepede.com.br`. Nao existem evidencias de TLS valido, renovacao ou
staging isolado nesses nomes. Nao marcar esses criterios como completos.

## Mapa aprovado

Preservar o mapa da KAN-127, salvo decisao explicita registrada no Jira:

| Nome | Destino planejado | Acao agora |
| --- | --- | --- |
| `clicaepede.com.br` | App de producao futuro | Reservar no mapa; nao alterar DNS |
| `admin.clicaepede.com.br` | Host administrativo do app futuro | Reservar; nao alterar DNS |
| `staging.clicaepede.com.br` | App de QA isolado futuro | Fora desta publicacao; depende de tarefa/deployment/dados proprios |
| `admin.staging.clicaepede.com.br` | Mesmo app de QA futuro | Fora desta publicacao |
| `evolution-staging.clicaepede.com.br` | VPS atual, exclusiva de QA | A publicado e validado na HostGator |
| `evolution.clicaepede.com.br` | Evolution de producao futura | Reservar; nao apontar para QA |
| `ops-staging.clicaepede.com.br` | Administracao da VPS QA | Nao publicar sem protecao adicional validada |
| `ops.clicaepede.com.br` | Administracao de producao futura | Reservar; nao publicar |

Em 2026-10-03, Bruno aprovou explicitamente usar `evolution-staging` para QA e
manter `evolution` reservado para producao. Registrar essa decisao no Jira e
ajustar o hostname no criterio de aceite, sem marcar o registro como criado
antes de sua publicacao e validacao.

Para uma futura implantacao do app, o nome `staging` nao garante isolamento. Nao aponta-lo para a producao Vercel
nem considerar uma pagina provisoria como app de QA funcionando. Separar
deployment, banco/dados, Clerk, Turnstile, Redis, banco Evolution, credenciais,
numero WhatsApp, webhooks e rotinas agendadas antes de habilitar fluxos.

## Handoff original (antes da mudanca de autoridade DNS)

1. Exportar ou registrar a zona atual completa em armazenamento protegido.
2. Manter os nameservers atuais. Preservar A/AAAA, CNAME, MX, TXT, CAA e
   registros de email, Clerk e verificacao existentes.
3. Confirmar o mapa acima e o hostname Evolution de QA aprovado.
4. Adicionar somente um registro A para esse hostname, apontando para o IPv4 da
   VPS fornecido ao administrador fora do Git/Jira. TTL desejado: 300 segundos,
   se o painel permitir; caso contrario registrar o TTL realmente aplicado.
5. Nao criar AAAA sem IPv6 validado. Nao criar wildcard, registros raiz,
   `admin`, `staging` ou `ops` como atalho.
6. Enviar confirmacao contendo hostname, tipo e TTL efetivo. Validar depois nos
   nameservers autoritativos e em pelo menos dois resolvedores publicos.

O registro de staging exige primeiro um deployment Vercel de QA aprovado. Usar
exatamente o A/CNAME informado por esse projeto/deployment e concluir a
verificacao de dominio. Hospedar o app na VPS depende de decisao e tarefa
separadas. Nao copiar valores antigos ou genericos da Vercel.

## Publicacao TLS e protecao administrativa

1. Confirmar A/AAAA/CAA e propagacao do hostname aprovado antes de solicitar
   certificado. Verificar que CAA existente permite a autoridade escolhida;
   nao apagar CAA sem avaliar outros certificados da zona.
2. Configurar o dominio no servico correto do EasyPanel, com HTTPS/ACME e
   endereco de contato operacional. Guardar o estado ACME protegido e
   persistente; nunca copiar chaves privadas para Git ou evidencias.
3. Validar HTTPS externamente sem `--insecure`: cadeia confiavel, SAN do
   hostname correto, validade e ausencia de erros de TLS.
4. Validar HTTP retornando redirect para HTTPS no mesmo host, preservando
   caminho e query; seguir o redirect e verificar ausencia de loops. Para API,
   exigir preservacao de metodo e corpo POST (307/308); configurar consumidores
   diretamente em HTTPS, sem depender de redirects para webhooks.
5. Confirmar renovacao automatica com um ensaio seguro no ambiente ACME de
   teste e a persistencia do estado. Em producao, registrar validade e
   monitorar tentativas de renovacao sem forcar emissoes repetidas. Registrar
   a execucao automatica e a substituicao do certificado no ensaio, nao apenas
   uma segunda emissao manual. Um primeiro certificado valido nao comprova
   renovacao testada.

O proxy atual possui rotas de EasyPanel por IP e fallback por hostname. A
verificacao externa de `/login` pelo IP retornou HTTP 200 com verificacao TLS
desabilitada; essa consulta usou `--insecure` apenas para diagnosticar exposicao
da interface, nao acesso autenticado, e **nao** valida o criterio TLS.
Bloquear a porta 3000 nao bloqueia o painel pelo proxy 443. A contencao ja e
pendencia atual da execucao de infraestrutura da KAN-131, independente de
publicar `ops-staging`: aplicar VPN, allowlist no proxy ou autenticacao
adicional em todos os routers que encaminham para `easypanel`, incluindo
routers por IP e fallbacks. Validar 80 e 443 pelo IP, hostname alternativo,
Host arbitrario, combinacoes Host/SNI e IPv6 quando habilitado. Manter o tunel SSH nominal como
rota de recuperacao, sem abrir portas internas. Revalidar apos mudancas ou
atualizacoes do EasyPanel, pois ele gera a configuracao do proxy.

## Integracao com o app

- Manter URLs Vercel atuais enquanto os novos hosts nao estiverem aprovados.
- Para QA, definir `NEXT_PUBLIC_APP_DOMAIN`, `NEXT_PUBLIC_APP_URL` e `APP_URL`
  coerentes com o host QA. Rebuildar variaveis publicas e testar links,
  convites, cardapio e acompanhamento para nao apontarem para producao.
- Validar origens, sessao e redirects Clerk; validar listas de hostname
  Turnstile por ambiente. Nao compartilhar segredos entre QA e producao.
- A revisao identificou risco de middleware autenticar o webhook Evolution
  antes do handler. Reproduzir chamada externa sem cookie e com segredo de
  webhook correto/incorreto; exigir JSON sem redirect para login. Os testes
  diretos do handler nao comprovam essa integracao. Tratar eventual correcao
  em tarefa propria de integracao, nao como DNS concluido.

## Evidencias e aceite

O quadro abaixo registra a preparacao inicial; os resultados atuais estao na
secao de 2026-10-06. Registrar data, ambiente e resultado por criterio, sem segredos ou IPs privados
do operador. Armazenar detalhes operacionais na pasta protegida em D:.

| Criterio | Evidencia necessaria | Estado inicial |
| --- | --- | --- |
| Autoridade DNS | NS/SOA e administrador identificados | Identificado |
| Evolution publicado | Registro aprovado em autoridade e resolvedores publicos | Pendente |
| Staging isolado | Host Evolution QA separado do nome futuro de producao; sem servico produtivo na VPS | Pendente |
| App futuro reservado | Mapa acima, sem cutover | Documentado; nao publicado |
| TLS e renovacao | Cadeia/SAN/validade e ensaio de renovacao | Pendente |
| HTTP para HTTPS | Respostas por hostname, caminho e query | Pendente |
| Painel protegido | Testes autorizado/nao autorizado e bypass | Pendente; exposicao diagnosticada |
| TTL e rollback | TTL aplicado e procedimento documentado | Procedimento preparado |
| App atual preservado | Fluxos Vercel antes/depois da publicacao | Sem mutacoes; reteste pos-publicacao pendente |

## Rollback

Antes de publicar, guardar zona anterior, TTL efetivo, dominio/rota do proxy,
URL de API e callbacks, certificado e deployment de origem. Quando possivel,
reduzir TTL antecipadamente e aguardar o TTL anterior antes de um cutover.

Reverter apenas registros e rotas de publicacao alterados para os valores
anteriores, preservando obrigatoriamente as restricoes administrativas novas.
Nao restaurar routers ou fallbacks que exponham EasyPanel sem protecao.
Repetir os testes de bypass do painel depois de qualquer rollback. Se um
nome era inexistente, remover somente o novo registro; caches podem manter o
destino ou NXDOMAIN pelo TTL. Manter o destino anterior operacional durante a
propagacao. Reverter junto a URL Evolution e seus callbacks quando alterados.
Revalidar HTTPS, webhook e app Vercel. DNS nao reverte dados, credenciais ou
sessao WhatsApp. Um ensaio em hostname QA descartavel e recomendado para um
futuro cutover, nao requisito adicional desta publicacao de infraestrutura.

## Referencias

- [Registro.br - gerenciamento de conta e DNS](https://registro.br/ajuda/gerenciamento-de-conta/)
- [EasyPanel - dominios de servicos](https://easypanel.io/docs/services/app)
- [Vercel - certificados SSL](https://vercel.com/docs/domains/working-with-ssl)
- [Clerk - deployment](https://clerk.com/docs/guides/development/deployment/production)
- [Turnstile - hostnames](https://developers.cloudflare.com/turnstile/additional-configuration/hostname-management/)
