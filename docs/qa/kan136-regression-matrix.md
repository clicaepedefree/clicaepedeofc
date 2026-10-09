# KAN-136 - Matriz compacta de regressao sem LLM

## Resumo

**28 issues, 189 criterios integrais, 251 casos planejados.** Estados preservados: **246 NOT_RUN + 5 BLOCKED**; os 251 permanecem nao executados. Nenhum PASS/FAIL ou aprovacao E2E.

Branch: `codex/kan-136-whatsapp-functional-qa`. Fonte: `D:/ProjetoIA/codex/clicaepede/KAN-136/issue-snapshot.json`. [Catalogo detalhado](../../scripts/qa/kan136-catalog.json) preservado integralmente: passos, precondicoes, provas UI/API/DB/infra, esperado, risco, limites, UUIDs e variantes por ID. Este Markdown e o indice humano; nao substitui os roteiros.

Os IDs `KAN-n-ACxx` seguem a ordem do checklist. KAN-129/131 usam checklist `[x]` sem UUID; os demais UUIDs constam no JSON. Nenhum criterio foi fundido ou omitido. Usuario informa 27 issues em teste; snapshot registra 27 em analise e KAN-136 em andamento. Checkmarks/relatos historicos nao comprovam execucao atual.

Main informou login QA corrigido; scan16 indica React418/hidratacao com inputs/tabs operacionais. Controle sem tema ainda em investigacao. Login, varredura UI e unitarios nao aprovam criterio funcional/E2E nem confirmam bug.

## Execucao e precondicoes

- **Main:** acoes reais no browser via Playwright e caminho bot sem LLM. **Outro agente autorizado:** consequencias DB/infra sanitizadas por ID. Este agente somente documenta; nao executa SSH/DB/env/Jira/envio real, compra, billing, pagamento ou testes imutaveis com custos.
- Antes: confirmar commit/deployment, tenant QA, usuario/permissao, consentimento, fixture IDs e baseline. Falta de auth, acesso, fixture ou delegacao mantem NOT_RUN; nao e automaticamente BLOCKED.
- **Store9 ja conectado:** preservar numero, instance_id e session_id sem gerar/renovar/ler QR, reconectar, desconectar, excluir ou trocar numero. QR, sessao invalida, queda, reboot e desconexao exigem fixture/clone separado autorizado.
- **Cadastro:** distinguir numero existente conectado, mesmo numero normalizado (sem duplicidade) e numero novo cadastrado mas nao pareado. Cadastro/QR exibido nao comprovam conexao ou transporte real.
- **Persistencia:** salvar/agir, recarregar, navegar para outra loja e voltar; comparar campos, IDs, contagens e isolamento. Pedido: todas as transicoes configuradas, delivery/retirada/cancelamento e visoes cliente/loja.
- **Opt-out/handoff:** conferir confirmacao cliente e estado loja apos reload; separar promocional de transacional, modo human de respostas automaticas e retorno ao bot autorizado/auditado.
- **Sem LLM:** testar contratos, tools/dados, templates fixos, gates, isolamento, fallback e handoff. Geracao/inteligencia/provedor LLM original fica nao comprovado; parte deterministica funcional nao aprova o criterio completo.

## Bloqueio de inbound real

**BLOCKED significa falta de identidade WhatsApp remetente distinta e autorizada, nao necessariamente falta de outro aparelho.** Uma conta/identidade diferente pode viabilizar o remetente sem exigir um segundo dispositivo fisico. O requisito e origem cliente distinta da identidade conectada da loja; disponibilidade e consentimento devem ser confirmados antes de executar.

Os cinco casos bloqueados mantem seu estado sem alegar falha do produto: quatro criterios abaixo e `KAN-136-X-REAL-INBOUND-DISTINCT`. Mensagem para si, fromMe, replay HTTP, adapter e mock nao substituem inbound real de cliente. O JSON foi preservado conforme solicitado; onde disser 'segundo telefone/remetente fisico', ler como **identidade WhatsApp distinta**, nao como exigencia de aparelho adicional. A correcao de terminologia nao acrescenta evidencias nem desbloqueia casos por presuncao.

Envio real exige autorizacao separada e receipt do destinatario correlacionado ao evento/DB/provider. Aqui nao e executado. `sent` ou HTTP2xx nao prova `delivered`, `read` ou recebimento real.

## Provas e limites

| Canal | Prova minima aplicavel |
| --- | --- |
| UI | Acao Playwright real; screenshot antes/depois, trace e video por variante; esperado versus observado e reload. |
| API | Network/action/callback sanitizados, resultado, horario e correlation_id; ausencia de mutacao em consulta/cancelamento. |
| DB | Agente autorizado: campos/IDs/store_id/contagens/relacoes antes/depois; persistencia e ausencia de duplicidade. |
| Infra | Agente autorizado: sessao/provider/worker/health/configuracao efetiva ou ausencia de chamada externa; evidencia sanitizada. |

Registrar owner, data, commit/deployment, variante e referencias de artefatos por ID. Correlacionar contato/conversa/pedido/evento/tentativa/provider quando pertinente. Contar mensagens logicas e retries separadamente. NAO_APLICAVEL exige justificativa por canal; nao inventar tela, consulta ou evidencia. Interceptacao visual valida somente o segmento visual; replay/mock/unitario nao comprova transporte ou DB real. PASS futuro requer todos os segmentos/variantes aplicaveis, nunca apenas uma varredura.

Riscos prioritarios: vazamento entre lojas/segredos, perda de sessao, consentimento ignorado, respostas durante handoff, status/beneficios falsos, duplicidade/loops e falso aceite. Infra mutavel/destrutiva somente em clone autorizado. Cleanup somente dos IDs criados pelo teste; preservar store9, dados e edits alheios. Nao versionar telefone real, QR, senha, token ou payload bruto. Publicacao Jira e delegada separadamente.

## Cobertura UI

**52 casos independentes:** 13 superficies x 4 variantes; todos NOT_RUN. IDs: `KAN-136-UI-{superficie}-{variante}` (variante em maiusculas). Inventariar novas telas/modais e acrescentar quatro variantes; nao assumir tela inexistente.

| Variante no ID | Viewport | Tema |
| --- | --- | --- |
| DESKTOP-LIGHT | 1440x900 | light |
| DESKTOP-DARK | 1440x900 | dark |
| MOBILE-LIGHT | 390x844 | light |
| MOBILE-DARK | 390x844 | dark |

| Superficie no ID | Tela/area | Criterio relacionado |
| --- | --- | --- |
| CONNECTION | Conexao | KAN-83-AC01 |
| NUMBER-FORM | Cadastro numero | KAN-82-AC01 |
| QR-DIALOG | Dialogo QR | KAN-82-AC02 |
| DISCONNECT-CONFIRM | Confirmacao desconexao | KAN-83-AC02 |
| PERSONALITY | Personalidade | KAN-84-AC01 |
| PERSONALITY-PREVIEW | Preview personalidade | KAN-84-AC03 |
| HANDOFF | Fila Handoff | KAN-90-AC03 |
| HANDOFF-CONTEXT | Contexto e retorno bot | KAN-90-AC05 |
| DIAGNOSTICS | Diagnostico | KAN-94-AC01 |
| DIAGNOSTICS-DETAIL | Detalhe mensagem/evento/tentativa | KAN-94-AC02 |
| STORE-ORDER-STATUS | Pedido/status loja | KAN-92-AC01 |
| CUSTOMER-ORDER-STATUS | Status pedido cliente | KAN-92-AC02 |
| CTA-MENU | CTA e cardapio destino | KAN-89-AC03 |

Conferir overflow, texto cortado/sobreposicao, contraste, foco/teclado, toque, scroll, controles e vazio/loading/erro; verificar reload e navegacao ida/volta. Estados interceptados devem ser rotulados. Nao repetir efeitos irreversiveis para capturar outra resolucao/tema.

## Criterios (189)

**Scope:** S = funcional sem LLM; P = parcial sem LLM, aceite original dependente de LLM permanece pendente; I = infra delegada. A coluna criterio e o esperado original, integral. Roteiro/provas/risco especificos: localizar o mesmo ID no JSON.

### KAN-81 - Modelar domínio de dados do robô de WhatsApp

| ID | Criterio / esperado original | Estado | Scope |
| --- | --- | --- | --- |
| KAN-81-AC01 | Todas as entidades possuem store_id e restrições de integridade adequadas | NOT_RUN | S |
| KAN-81-AC02 | O mesmo telefone pode existir em lojas diferentes sem compartilhar histórico | NOT_RUN | S |
| KAN-81-AC03 | É impossível vincular sessão, conversa ou mensagem a uma loja incompatível | NOT_RUN | S |
| KAN-81-AC04 | Migrações podem ser aplicadas com segurança e possuem estratégia de reversão | NOT_RUN | S |
| KAN-81-AC05 | Índices cobrem consultas por loja, telefone, conversa, status e evento | NOT_RUN | S |

### KAN-82 - Implementar conexão do WhatsApp por QR Code e gestão da sessão

| ID | Criterio / esperado original | Estado | Scope |
| --- | --- | --- | --- |
| KAN-82-AC01 | Uma loja conecta pelo menos um número e o painel recebe o estado correto da sessão | NOT_RUN | S |
| KAN-82-AC02 | QR Code expirado pode ser renovado sem criar conexão duplicada | NOT_RUN | S |
| KAN-82-AC03 | Queda temporária inicia reconexão automática controlada | NOT_RUN | S |
| KAN-82-AC04 | Sessão inválida solicita nova leitura e informa o motivo | NOT_RUN | S |
| KAN-82-AC05 | A sessão de uma loja nunca envia ou recebe em nome de outra | NOT_RUN | S |

### KAN-83 - Criar painel de conexão e controle do robô de WhatsApp

| ID | Criterio / esperado original | Estado | Scope |
| --- | --- | --- | --- |
| KAN-83-AC01 | O status exibido acompanha a sessão sem exigir recarregamento manual | NOT_RUN | S |
| KAN-83-AC02 | Ações destrutivas ou de desconexão exigem confirmação | NOT_RUN | S |
| KAN-83-AC03 | Usuário sem permissão não consegue alterar a conexão | NOT_RUN | S |
| KAN-83-AC04 | Erros apresentam mensagem acionável sem expor credenciais | NOT_RUN | S |
| KAN-83-AC05 | Pausar interrompe respostas automáticas e preserva configurações | NOT_RUN | S |

### KAN-84 - Implementar configuração e teste da personalidade do assistente

| ID | Criterio / esperado original | Estado | Scope |
| --- | --- | --- | --- |
| KAN-84-AC01 | Configurações são salvas e isoladas por loja | NOT_RUN | S |
| KAN-84-AC02 | Alterações passam a valer em novas mensagens sem reconectar o WhatsApp | NOT_RUN | P |
| KAN-84-AC03 | Modo de teste usa dados e personalidade da loja sem falar com cliente real | NOT_RUN | P |
| KAN-84-AC04 | Campos possuem limites e validação contra instruções inseguras | NOT_RUN | S |
| KAN-84-AC05 | Quando perguntado, o robô informa que é o assistente virtual da loja | NOT_RUN | P |

### KAN-85 - Processar mensagens recebidas e cadastrar contatos automaticamente

| ID | Criterio / esperado original | Estado | Scope |
| --- | --- | --- | --- |
| KAN-85-AC01 | Primeira mensagem cria apenas um contato para o telefone naquela loja | BLOCKED | S |
| KAN-85-AC02 | Mensagens seguintes atualizam o contato sem duplicidade | NOT_RUN | S |
| KAN-85-AC03 | O mesmo telefone em outra loja permanece como cadastro independente | NOT_RUN | S |
| KAN-85-AC04 | Nome disponível é utilizado na saudação quando apropriado | NOT_RUN | S |
| KAN-85-AC05 | Opt-out promocional fica registrado e pode ser consultado | NOT_RUN | S |

### KAN-86 - Implementar orquestrador de atendimento conectado à LLM

| ID | Criterio / esperado original | Estado | Scope |
| --- | --- | --- | --- |
| KAN-86-AC01 | Mensagens elegíveis recebem resposta contextual da LLM | NOT_RUN | P |
| KAN-86-AC02 | Trocar o provedor não exige reconstruir os demais módulos | NOT_RUN | P |
| KAN-86-AC03 | Histórico recente mantém coerência sem misturar clientes ou lojas | NOT_RUN | P |
| KAN-86-AC04 | Timeout ou falha do provedor usa fallback seguro | NOT_RUN | P |
| KAN-86-AC05 | O orquestrador não responde quando a conversa está pausada para humano | NOT_RUN | S |

### KAN-87 - Criar ferramentas da IA para consultar dados reais da loja

| ID | Criterio / esperado original | Estado | Scope |
| --- | --- | --- | --- |
| KAN-87-AC01 | Preço e disponibilidade retornados correspondem ao estado atual do cardápio | NOT_RUN | S |
| KAN-87-AC02 | Produto indisponível não é apresentado como disponível | NOT_RUN | S |
| KAN-87-AC03 | Consulta nunca aceita store_id fornecido livremente pelo cliente | NOT_RUN | S |
| KAN-87-AC04 | Horários, pagamentos e modalidades refletem a configuração da loja | NOT_RUN | S |
| KAN-87-AC05 | Ausência de dados retorna resultado conhecido e não informação inventada | NOT_RUN | S |

### KAN-88 - Implementar guardrails, fallback e proteção contra respostas inventadas

| ID | Criterio / esperado original | Estado | Scope |
| --- | --- | --- | --- |
| KAN-88-AC01 | Testes adversariais não revelam prompt, credenciais ou dados de outra loja | NOT_RUN | P |
| KAN-88-AC02 | Pergunta sem fonte confiável recebe resposta de limitação, cardápio e opção humana | NOT_RUN | P |
| KAN-88-AC03 | A IA não inventa produto, preço, desconto, taxa ou prazo | NOT_RUN | P |
| KAN-88-AC04 | Falhas consecutivas de entendimento acionam o fallback | NOT_RUN | P |
| KAN-88-AC05 | Respostas inseguras são bloqueadas e registradas com motivo | NOT_RUN | P |

### KAN-89 - Implementar CTA do cardápio digital e atribuição de conversão

| ID | Criterio / esperado original | Estado | Scope |
| --- | --- | --- | --- |
| KAN-89-AC01 | Toda nova conversa elegível recebe o cardápio correto da loja | NOT_RUN | S |
| KAN-89-AC02 | Nova intenção de compra pode reenviar o CTA de forma contextual | NOT_RUN | P |
| KAN-89-AC03 | O link nunca direciona para estabelecimento diferente | NOT_RUN | S |
| KAN-89-AC04 | O tom do CTA respeita a personalidade configurada | NOT_RUN | P |
| KAN-89-AC05 | Origem pode ser consultada para medir cliques e pedidos gerados | NOT_RUN | S |

### KAN-90 - Implementar transferência e pausa para atendimento humano

| ID | Criterio / esperado original | Estado | Scope |
| --- | --- | --- | --- |
| KAN-90-AC01 | Pedido explícito de atendente interrompe respostas automáticas | NOT_RUN | S |
| KAN-90-AC02 | O cliente recebe confirmação de encaminhamento | NOT_RUN | S |
| KAN-90-AC03 | Atendente visualiza o contexto necessário da conversa | NOT_RUN | S |
| KAN-90-AC04 | Nenhuma resposta da IA é enviada enquanto o modo humano estiver ativo | NOT_RUN | S |
| KAN-90-AC05 | Conversa pode voltar ao modo automático de forma controlada | NOT_RUN | S |

### KAN-91 - Criar fila de mensagens transacionais com retentativa e idempotência

| ID | Criterio / esperado original | Estado | Scope |
| --- | --- | --- | --- |
| KAN-91-AC01 | O mesmo evento não gera duas mensagens para o mesmo cliente | NOT_RUN | S |
| KAN-91-AC02 | Falha temporária é reenfileirada sem loop infinito | NOT_RUN | S |
| KAN-91-AC03 | Sessão de outra loja nunca é usada como alternativa | NOT_RUN | S |
| KAN-91-AC04 | Notificação transacional funciona mesmo com a IA pausada | NOT_RUN | S |
| KAN-91-AC05 | Falha definitiva fica disponível para diagnóstico e ação | NOT_RUN | S |

### KAN-92 - Integrar notificações automáticas de status do pedido

| ID | Criterio / esperado original | Estado | Scope |
| --- | --- | --- | --- |
| KAN-92-AC01 | Cada alteração configurada dispara uma única mensagem | NOT_RUN | S |
| KAN-92-AC02 | Mensagem contém loja, pedido e status corretos | NOT_RUN | S |
| KAN-92-AC03 | Pedido de retirada não recebe mensagem de saiu para entrega | NOT_RUN | S |
| KAN-92-AC04 | Cancelamento usa texto adequado sem prometer estorno não confirmado | NOT_RUN | S |
| KAN-92-AC05 | Eventos fora de ordem são tratados sem regredir indevidamente a jornada | NOT_RUN | S |

### KAN-93 - Integrar notificações de cashback e programa de fidelidade

| ID | Criterio / esperado original | Estado | Scope |
| --- | --- | --- | --- |
| KAN-93-AC01 | Mensagem de cashback informa valores reais e saldo correto | NOT_RUN | S |
| KAN-93-AC02 | Mensagem de fidelidade informa pontos ganhos e saldo correto | NOT_RUN | S |
| KAN-93-AC03 | Validade ou próxima recompensa só aparecem quando confirmadas pela base | NOT_RUN | S |
| KAN-93-AC04 | Evento sem benefício não gera mensagem fictícia | NOT_RUN | S |
| KAN-93-AC05 | A mesma concessão não é notificada mais de uma vez | NOT_RUN | S |

### KAN-94 - Implementar logs, métricas e diagnóstico operacional do robô

| ID | Criterio / esperado original | Estado | Scope |
| --- | --- | --- | --- |
| KAN-94-AC01 | Suporte consegue identificar onde uma mensagem falhou | NOT_RUN | S |
| KAN-94-AC02 | Logs possuem loja, conversa ou evento, data, resultado e motivo | NOT_RUN | S |
| KAN-94-AC03 | Dados sensíveis e credenciais não aparecem nos registros | NOT_RUN | S |
| KAN-94-AC04 | Usuário da loja enxerga somente seu estabelecimento | NOT_RUN | S |
| KAN-94-AC05 | Métricas distinguem atendimento da IA, handoff, CTA e notificações | NOT_RUN | S |

### KAN-95 - Aplicar segurança, permissões e requisitos de LGPD ao robô

| ID | Criterio / esperado original | Estado | Scope |
| --- | --- | --- | --- |
| KAN-95-AC01 | Testes de autorização bloqueiam acesso cruzado entre lojas | NOT_RUN | S |
| KAN-95-AC02 | Credenciais não são expostas no banco, logs, respostas ou interface | NOT_RUN | S |
| KAN-95-AC03 | Opt-out promocional é respeitado pelos fluxos aplicáveis | NOT_RUN | S |
| KAN-95-AC04 | Política de retenção e exclusão está implementada e documentada | NOT_RUN | S |
| KAN-95-AC05 | Ações administrativas sensíveis geram auditoria rastreável | NOT_RUN | S |

### KAN-96 - Criar testes automatizados e validar jornada ponta a ponta do robô

| ID | Criterio / esperado original | Estado | Scope |
| --- | --- | --- | --- |
| KAN-96-AC01 | Fluxo conectar, receber, cadastrar, responder e enviar cardápio passa ponta a ponta | BLOCKED | P |
| KAN-96-AC02 | Nenhum cenário multiempresa cruza dados ou sessões | NOT_RUN | S |
| KAN-96-AC03 | Eventos repetidos não geram mensagens duplicadas | NOT_RUN | S |
| KAN-96-AC04 | Falhas de LLM e WhatsApp usam fallback seguro | NOT_RUN | P |
| KAN-96-AC05 | Evidências de QA cobrem pedido, cashback, fidelidade e atendimento humano | NOT_RUN | S |

### KAN-97 - Preparar rollout controlado e plano de reversão do robô

| ID | Criterio / esperado original | Estado | Scope |
| --- | --- | --- | --- |
| KAN-97-AC01 | Robô pode ser ativado para lojas específicas sem liberar toda a base | NOT_RUN | S |
| KAN-97-AC02 | Desativação interrompe novas respostas sem perder rastreabilidade | NOT_RUN | S |
| KAN-97-AC03 | Rollback de aplicação e dados possui procedimento documentado | NOT_RUN | S |
| KAN-97-AC04 | Critérios de expansão e interrupção estão definidos | NOT_RUN | S |
| KAN-97-AC05 | Piloto possui responsáveis e indicadores mínimos de sucesso | NOT_RUN | S |

### KAN-98 - Documentar arquitetura, regras e operação do robô de WhatsApp

| ID | Criterio / esperado original | Estado | Scope |
| --- | --- | --- | --- |
| KAN-98-AC01 | Documentação acompanha a versão entregue | NOT_RUN | S |
| KAN-98-AC02 | Exemplos não contêm dados reais sensíveis | NOT_RUN | S |
| KAN-98-AC03 | Equipe consegue conectar e diagnosticar uma loja sem apoio do desenvolvimento | NOT_RUN | S |
| KAN-98-AC04 | Regras de negócio e situações de fallback estão explícitas | NOT_RUN | S |
| KAN-98-AC05 | Runbook contém ações para sessão caída, fila parada e falha de provedor | NOT_RUN | S |

### KAN-127 - Inventariar arquitetura e definir baseline da VPS Hostinger

| ID | Criterio / esperado original | Estado | Scope |
| --- | --- | --- | --- |
| KAN-127-AC01 | Plano, região, CPU, RAM, disco e sistema operacional da VPS registrados. | NOT_RUN | I |
| KAN-127-AC02 | Componentes e redes representados em diagrama: EasyPanel, Evolution API, PostgreSQL, Redis, app Next.js e serviços externos. | NOT_RUN | I |
| KAN-127-AC03 | Supabase e Clerk identificados explicitamente como externos. | NOT_RUN | I |
| KAN-127-AC04 | Produção e staging possuem nomes, domínios, variáveis e dados separados. | NOT_RUN | I |
| KAN-127-AC05 | Endpoints, portas públicas e portas exclusivamente internas foram definidos. | NOT_RUN | I |
| KAN-127-AC06 | Dependências atuais da Vercel, incluindo crons, foram inventariadas. | NOT_RUN | I |
| KAN-127-AC07 | RPO, RTO, responsáveis operacionais e janela de manutenção foram definidos. | NOT_RUN | I |
| KAN-127-AC08 | Estimativa de consumo e margem de capacidade foram registradas. | NOT_RUN | I |

### KAN-128 - Conectar o MCP oficial da Hostinger ao Codex

| ID | Criterio / esperado original | Estado | Scope |
| --- | --- | --- | --- |
| KAN-128-AC01 | Confirmar o uso do MCP oficial da Hostinger. | NOT_RUN | I |
| KAN-128-AC02 | Registrar os módulos Hostinger necessários no Codex. | NOT_RUN | I |
| KAN-128-AC03 | Armazenar a credencial fora do Git e do arquivo TOML. | NOT_RUN | I |
| KAN-128-AC04 | Concluir autorização da conta administrativa. | NOT_RUN | I |
| KAN-128-AC05 | Validar inicialização dos servidores MCP e descoberta das operações. | NOT_RUN | I |
| KAN-128-AC06 | Confirmar que a conta autorizada exibe a VPS e os recursos contratados. | NOT_RUN | I |
| KAN-128-AC07 | Validar leitura real de VPS, DNS, domínios, assinatura e métricas. | NOT_RUN | I |
| KAN-128-AC08 | Executar uma operação controlada e reversível para validar escrita. | NOT_RUN | I |
| KAN-128-AC09 | Aplicar o menor conjunto de módulos necessário. | NOT_RUN | I |
| KAN-128-AC10 | Documentar reconexão, expiração, revogação e resposta a credencial comprometida. | NOT_RUN | I |
| KAN-128-AC11 | Garantir que tokens e credenciais não sejam registrados no Git ou Jira. | NOT_RUN | I |

### KAN-129 - Provisionar a VPS Hostinger e instalar o EasyPanel

| ID | Criterio / esperado original | Estado | Scope |
| --- | --- | --- | --- |
| KAN-129-AC01 | VPS provisionada na região e plano definidos no baseline. | NOT_RUN | I |
| KAN-129-AC02 | Sistema operacional suportado e atualizado. | NOT_RUN | I |
| KAN-129-AC03 | Hostname e timezone America/Sao_Paulo configurados. | NOT_RUN | I |
| KAN-129-AC04 | EasyPanel instalado a partir de fonte oficial. | NOT_RUN | I |
| KAN-129-AC05 | Painel acessível somente pelo endereço e método definidos. | NOT_RUN | I |
| KAN-129-AC06 | Portas 80 e 443 disponíveis para o proxy reverso. | NOT_RUN | I |
| KAN-129-AC07 | CPU, RAM e armazenamento reconhecidos corretamente. | NOT_RUN | I |
| KAN-129-AC08 | Reinicialização da VPS testada sem perda de configuração. | NOT_RUN | I |
| KAN-129-AC09 | Estado inicial e procedimento de recuperação documentados. | NOT_RUN | I |

### KAN-130 - Aplicar hardening da VPS e governança de segredos

| ID | Criterio / esperado original | Estado | Scope |
| --- | --- | --- | --- |
| KAN-130-AC01 | Usuário administrativo nominal criado. | NOT_RUN | I |
| KAN-130-AC02 | SSH por chave validado antes de restringir acessos alternativos. | NOT_RUN | I |
| KAN-130-AC03 | Login remoto direto como root e autenticação por senha restringidos. | NOT_RUN | I |
| KAN-130-AC04 | Firewall permite apenas portas públicas justificadas. | NOT_RUN | I |
| KAN-130-AC05 | PostgreSQL e Redis não estão expostos à internet. | NOT_RUN | I |
| KAN-130-AC06 | Proteção contra brute force e política de atualizações configuradas. | NOT_RUN | I |
| KAN-130-AC07 | Segredos armazenados no cofre/variáveis do ambiente, nunca no Git. | NOT_RUN | I |
| KAN-130-AC08 | Chaves e tokens separados entre staging e produção. | NOT_RUN | I |
| KAN-130-AC09 | Procedimento de rotação e acesso emergencial documentado. | NOT_RUN | I |
| KAN-130-AC10 | Varredura externa confirma ausência de portas indevidas. | NOT_RUN | I |

### KAN-131 - Configurar DNS, subdomínios e certificados TLS

| ID | Criterio / esperado original | Estado | Scope |
| --- | --- | --- | --- |
| KAN-131-AC01 | Autoridade DNS de clicaepede.com.br identificada e documentada. | NOT_RUN | I |
| KAN-131-AC02 | evolution-staging.clicaepede.com.br criado e apontado para a VPS de QA. | NOT_RUN | I |
| KAN-131-AC03 | Subdomínio de staging criado e isolado. | NOT_RUN | I |
| KAN-131-AC04 | Domínio futuro do app em produção reservado. | NOT_RUN | I |
| KAN-131-AC05 | Certificados TLS válidos emitidos e renovação automática testada. | NOT_RUN | I |
| KAN-131-AC06 | HTTP redireciona para HTTPS. | NOT_RUN | I |
| KAN-131-AC07 | Painel EasyPanel não fica exposto em endereço previsível sem proteção adicional. | NOT_RUN | I |
| KAN-131-AC08 | TTL e procedimento de rollback DNS documentados. | NOT_RUN | I |
| KAN-131-AC09 | Nenhuma alteração interrompe o site/app atual. | NOT_RUN | I |

### KAN-132 - Implantar Evolution API v2 com PostgreSQL e Redis

| ID | Criterio / esperado original | Estado | Scope |
| --- | --- | --- | --- |
| KAN-132-AC01 | Versão estável e específica da Evolution API v2 selecionada e fixada. | NOT_RUN | I |
| KAN-132-AC02 | PostgreSQL criado com volume persistente e credenciais exclusivas. | NOT_RUN | I |
| KAN-132-AC03 | Redis criado com persistência/configuração adequada ao uso. | NOT_RUN | I |
| KAN-132-AC04 | Evolution API conectada ao PostgreSQL e Redis pela rede interna. | NOT_RUN | I |
| KAN-132-AC05 | Portas 5432 e 6379 não estão publicamente acessíveis. | NOT_RUN | I |
| KAN-132-AC06 | API protegida por chave forte armazenada como segredo. | NOT_RUN | I |
| KAN-132-AC07 | Healthchecks dos três serviços configurados. | NOT_RUN | I |
| KAN-132-AC08 | Política de reinício e limites de recursos configurados. | NOT_RUN | I |
| KAN-132-AC09 | Reinício completo comprova persistência da configuração e das sessões. | NOT_RUN | I |
| KAN-132-AC10 | Versões, variáveis e procedimento de atualização documentados. | NOT_RUN | I |

### KAN-133 - Configurar backups, restauração e observabilidade da plataforma

| ID | Criterio / esperado original | Estado | Scope |
| --- | --- | --- | --- |
| KAN-133-AC01 | Backup automático do PostgreSQL configurado. | NOT_RUN | I |
| KAN-133-AC02 | Volumes e configurações essenciais possuem estratégia de backup. | NOT_RUN | I |
| KAN-133-AC03 | Cópias são enviadas para armazenamento externo à própria VPS. | NOT_RUN | I |
| KAN-133-AC04 | Retenção, criptografia e descarte foram definidos. | NOT_RUN | I |
| KAN-133-AC05 | Uma restauração completa foi executada em ambiente isolado. | NOT_RUN | I |
| KAN-133-AC06 | Monitoramento cobre CPU, RAM, disco, disponibilidade e reinícios de containers. | NOT_RUN | I |
| KAN-133-AC07 | Alertas cobrem falha de backup, pouco espaço e indisponibilidade da Evolution. | NOT_RUN | I |
| KAN-133-AC08 | Logs têm retenção definida e não expõem segredos ou conteúdo sensível. | NOT_RUN | I |
| KAN-133-AC09 | RPO/RTO definidos no baseline foram comprovados ou ajustados. | NOT_RUN | I |

### KAN-134 - Conectar a instância Evolution ao bot WhatsApp já desenvolvido

| ID | Criterio / esperado original | Estado | Scope |
| --- | --- | --- | --- |
| KAN-134-AC01 | Instância de QA criada na Evolution. | NOT_RUN | S |
| KAN-134-AC02 | Número autorizado de QA conectado por QR Code. | NOT_RUN | S |
| KAN-134-AC03 | URL, instance ID, API key e webhook secret configurados por ambiente. | NOT_RUN | S |
| KAN-134-AC04 | Webhook aponta para o endpoint existente do aplicativo. | NOT_RUN | S |
| KAN-134-AC05 | Somente eventos necessários foram habilitados. | NOT_RUN | S |
| KAN-134-AC06 | Autenticação/assinatura do webhook foi validada. | NOT_RUN | S |
| KAN-134-AC07 | Mensagem recebida chega ao endpoint e é persistida uma única vez. | BLOCKED | S |
| KAN-134-AC08 | Envio de mensagem pelo app chega ao WhatsApp real. | NOT_RUN | S |
| KAN-134-AC09 | Reconexão após reinício e perda temporária de rede foi testada. | NOT_RUN | S |
| KAN-134-AC10 | Proteções contra loop e eventos duplicados foram confirmadas. | NOT_RUN | S |
| KAN-134-AC11 | Telefone de QA não foi registrado permanentemente no Jira ou no código. | NOT_RUN | S |

### KAN-135 - Migrar crons e filas da Vercel para workers na VPS

| ID | Criterio / esperado original | Estado | Scope |
| --- | --- | --- | --- |
| KAN-135-AC01 | Todos os crons e processadores atuais foram inventariados. | NOT_RUN | S |
| KAN-135-AC02 | Rotina diária de billing possui equivalente documentado. | NOT_RUN | S |
| KAN-135-AC03 | Fila transacional do WhatsApp possui worker/scheduler com frequência adequada. | NOT_RUN | S |
| KAN-135-AC04 | Chamadas internas utilizam autenticação e segredo dedicados. | NOT_RUN | S |
| KAN-135-AC05 | Lock impede execução simultânea do mesmo job. | NOT_RUN | S |
| KAN-135-AC06 | Idempotência impede mensagens e operações duplicadas. | NOT_RUN | S |
| KAN-135-AC07 | Retry com backoff e destino de falhas permanentes foram definidos. | NOT_RUN | S |
| KAN-135-AC08 | Execução manual e execução agendada foram testadas. | NOT_RUN | S |
| KAN-135-AC09 | Reinício da VPS não perde jobs pendentes. | NOT_RUN | S |
| KAN-135-AC10 | Logs e alertas permitem identificar job atrasado ou interrompido. | NOT_RUN | S |

### KAN-136 - Executar QA funcional ponta a ponta do bot sem LLM

| ID | Criterio / esperado original | Estado | Scope |
| --- | --- | --- | --- |
| KAN-136-AC01 | Ambiente e dados de QA preparados sem contaminar produção. | NOT_RUN | S |
| KAN-136-AC02 | Mensagem real recebida pelo WhatsApp é persistida no banco. | BLOCKED | S |
| KAN-136-AC03 | Contato e conversa são associados à loja correta. | NOT_RUN | S |
| KAN-136-AC04 | Resposta automática determinística é enviada ao telefone de QA. | NOT_RUN | S |
| KAN-136-AC05 | Mudanças de status de pedido geram as notificações esperadas. | NOT_RUN | S |
| KAN-136-AC06 | Retry, idempotência e deduplicação foram testados. | NOT_RUN | S |
| KAN-136-AC07 | Opt-out e pausa/transferência para atendimento humano foram testados. | NOT_RUN | S |
| KAN-136-AC08 | Diagnóstico operacional e logs permitem rastrear cada mensagem. | NOT_RUN | S |
| KAN-136-AC09 | Banco foi conferido para validar reflexos e ausência de duplicidade. | NOT_RUN | S |
| KAN-136-AC10 | Screenshots, trace, vídeo e relatório foram anexados ou referenciados no Jira. | NOT_RUN | S |
| KAN-136-AC11 | Dados pessoais temporários foram removidos após a execução. | NOT_RUN | S |
| KAN-136-AC12 | Resultado final registrado como passou ou falhou, com bugs separados quando necessário. | NOT_RUN | S |

## Complementares (10)

Todos sem execucao; passos e provas completos no JSON.

| ID | Cenario | Estado |
| --- | --- | --- |
| KAN-136-X-NUMBER-EXISTING | Cadastro numero existente conectado versus duplicidade | NOT_RUN |
| KAN-136-X-NUMBER-NEW-UNPAIRED | Cadastro numero novo sem parear | NOT_RUN |
| KAN-136-X-NUMBER-VALIDATION | Cadastro validacao e recuperacao | NOT_RUN |
| KAN-136-X-RELOAD-ALL | Persistencia/reload/troca loja | NOT_RUN |
| KAN-136-X-OPTOUT-BOUNDARY | Opt-out cliente/loja: promocional versus transacional | NOT_RUN |
| KAN-136-X-HANDOFF-BOUNDARY | Handoff status cliente/loja e corrida | NOT_RUN |
| KAN-136-X-ORDER-DELIVERY | Pedido delivery todas transicoes cliente/loja | NOT_RUN |
| KAN-136-X-ORDER-PICKUP-CANCEL | Retirada/cancelamento cliente/loja | NOT_RUN |
| KAN-136-X-REAL-INBOUND-DISTINCT | Transporte inbound real remetente distinto | BLOCKED |
| KAN-136-X-EVIDENCE-CLEANUP | Evidencia/cleanup preservando store9 | NOT_RUN |

## Leitura do resultado

A matriz e um plano, nao um relatorio de testes passados. Preservar NOT_RUN/BLOCKED ate evidencia por caso; observacao parcial, login, scan UI e unitario nao viram aceite completo. Esta revisao altera somente o Markdown, sem alterar estados ou conteudo do JSON.

## Execucao reportada pelo main (separada do plano)

Atualizacao recebida em 2026-10-09 via usuario. Este agente nao executou nem verificou os artefatos desses testes. O plano permanece congelado: 246 NOT_RUN + 5 BLOCKED, inclusive no JSON. Os resultados abaixo nao sao mapeados automaticamente aos 189 criterios nem aos 251 casos.

| Recorte reportado | Resultado informado | Limite de conclusao |
| --- | --- | --- |
| Contrato actual do main | 10 PASS, 1 FAIL | Contagem do recorte, nao aceite E2E; IDs, variantes e artefatos devem constar no relatorio de execucao do main. |
| Personalidade: salvar, recarregar, rejeitar invalido e restaurar baseline | PASS funcional dessas acoes reais | Nao aprova geracao LLM, transporte WhatsApp ou o fluxo completo. Correlacao DB/evidencias fica no relatorio do executor. |
| Fluxo de personalidade/runtime | FAIL por React141 conhecido, conforme main | Sucesso das acoes funcionais nao elimina falha runtime; fluxo nao recebe PASS. |

O relato mais recente identifica React141; o scan anterior mencionava React418. Nao presumir equivalencia, causa comum ou resolucao sem stack/trace e controle de tema do executor.

Pendencias de execucao continuam sem falso PASS: LLM ausente (aceite de geracao fora do escopo sem LLM), inbound real fresco sem identidade WhatsApp remetente distinta autorizada, e pareamento com QR novo nao executado. QR novo exige fixture/identidade autorizada separada; nunca gerar/renovar/ler QR ou reparear a sessao store9 ja conectada. Nao transformar falta de fixture ou escopo LLM em novo BLOCKED no plano congelado; registrar esses limites no relatorio de execucao.

Para conclusao funcional completa, o main deve referenciar por caso os artefatos sanitizados, commit/deployment, variantes, esperado/observado e provas UI/API/DB/infra aplicaveis. Nenhuma contagem agregada, unitario ou scan UI substitui esses registros.
