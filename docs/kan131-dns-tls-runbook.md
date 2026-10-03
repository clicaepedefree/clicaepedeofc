# KAN-131 - DNS, subdominios e TLS

## Estado e limites

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

## Mapa e decisao pendente

Preservar o mapa da KAN-127, salvo decisao explicita registrada no Jira:

| Nome | Destino planejado | Acao agora |
| --- | --- | --- |
| `clicaepede.com.br` | App de producao futuro | Reservar no mapa; nao alterar DNS |
| `admin.clicaepede.com.br` | Host administrativo do app futuro | Reservar; nao alterar DNS |
| `staging.clicaepede.com.br` | App de QA isolado | Publicar apenas apos definir deployment e dados de QA |
| `admin.staging.clicaepede.com.br` | Mesmo app de QA | Publicar junto com o app de QA |
| `evolution-staging.clicaepede.com.br` | VPS atual, exclusiva de QA | A candidato, condicionado a aprovacao do mapa |
| `evolution.clicaepede.com.br` | Evolution de producao futura | Reservar; criterio da KAN-131 ainda pendente |
| `ops-staging.clicaepede.com.br` | Administracao da VPS QA | Nao publicar sem protecao adicional validada |
| `ops.clicaepede.com.br` | Administracao de producao futura | Reservar; nao publicar |

A KAN-131 pede `evolution.clicaepede.com.br` ativo agora, mas a KAN-127 reserva
esse nome para producao. Confirmar uma das opcoes antes de escrever registros:
manter o mapa e ajustar explicitamente o aceite para `evolution-staging`, ou
autorizar uso temporario de `evolution` em QA, com plano de migracao e avisos
claros. Nao alterar o criterio ou criar um alias silenciosamente.

O nome `staging` nao garante isolamento. Nao aponta-lo para a producao Vercel
nem considerar uma pagina provisoria como app de QA funcionando. Separar
deployment, banco/dados, Clerk, Turnstile, Redis, banco Evolution, credenciais,
numero WhatsApp, webhooks e rotinas agendadas antes de habilitar fluxos.

## Handoff para Gustavo no Registro.br

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

Registrar data, ambiente e resultado por criterio, sem segredos ou IPs privados
do operador. Armazenar detalhes operacionais na pasta protegida em D:.

| Criterio | Evidencia necessaria | Estado inicial |
| --- | --- | --- |
| Autoridade DNS | NS/SOA e administrador identificados | Identificado |
| Evolution publicado | Registro aprovado em autoridade e resolvedores publicos | Pendente |
| Staging isolado | DNS, deployment e dados/credenciais separados | Pendente |
| App futuro reservado | Mapa acima, sem cutover | Documentado; nao publicado |
| TLS e renovacao | Cadeia/SAN/validade e ensaio de renovacao | Pendente |
| HTTP para HTTPS | Respostas por hostname, caminho e query | Pendente |
| Painel protegido | Testes autorizado/nao autorizado e bypass | Pendente; exposicao diagnosticada |
| TTL e rollback | TTL aplicado, backup e ensaio | Procedimento preparado; ensaio pendente |
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
sessao WhatsApp. Ensaiar em hostname QA descartavel antes de aceitar a tarefa.

## Referencias

- [Registro.br - gerenciamento de conta e DNS](https://registro.br/ajuda/gerenciamento-de-conta/)
- [EasyPanel - dominios de servicos](https://easypanel.io/docs/services/app)
- [Vercel - certificados SSL](https://vercel.com/docs/domains/working-with-ssl)
- [Clerk - deployment](https://clerk.com/docs/guides/development/deployment/production)
- [Turnstile - hostnames](https://developers.cloudflare.com/turnstile/additional-configuration/hostname-management/)
