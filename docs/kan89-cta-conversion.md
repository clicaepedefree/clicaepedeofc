# KAN-89: origem do cardapio e consulta de conversao

## Medida e escopo

Reutiliza CTA contextual, conversa, mensagem, pedido publico e Relatorios existentes. Nao ativa bot, transporte, LLM, cron ou gateway.

- Acesso medido = POST de uma visita tecnica consentida a um CTA persistido, enviado pelo bot e pertencente a mesma loja/conversa/mensagem. Nao significa um clique fisico comprovado, pessoa unica, entrega WhatsApp ou compra.
- VisitId e UUID aleatorio, mantido em sessionStorage por loja/CTA. Recarregamento e repeticao de evento conservam um acesso; browser/sessao ou CTA diferentes podem contar novamente. Nunca autentica cliente, carteira ou pedido.
- Carrinho iniciado = primeiro evento com produto adicionado associado ao acesso existente. Nao cria acesso retroativo.
- Pedido gerado = pedido persistido com origem exata `whatsapp-bot-digital-menu-cta`. Concluidos, cancelados e receita concluida aparecem separadamente. Outras integracoes nao se misturam ao WhatsApp.
- Pedidos atribuidos sem acesso medido incluem historicos, visitas sem medicao ou cuja retencao expirou. Nao inventar visita para melhorar a conversao.
- Periodos usam o fuso e as datas do relatorio existente. Pedidos usam criacao; acessos usam criacao e carrinhos usam primeiro cartAt. Sao totais independentes, nao coorte nem percentual de conversao.

## Privacidade e seguranca

Metrica publica opcional, apos Permitir. Agora nao, DNT e GPC impedem esta medicao; o cliente pode reabrir Privacidade da origem. Recusa, armazenamento indisponivel ou falha de analytics nao impedem comprar. A resposta atrasada de outra loja/decisao nao publica atribuicao no checkout.

A tabela guarda apenas UUID de visita, loja, conversa, identificador tecnico da mensagem, criacao e inicio do carrinho. Nao guarda telefone, IP, user agent, URL bruta ou credenciais. Correlacao com conversa continua sendo dado tecnico relacionavel e nao equivale a anonimizacao. EntryUrl recebida nao e persistida na atribuicao validada; parametros arbitrarios nao chegam ao relatorio. IDs dos links nao substituem autorizacao.

Validacao backend exige mensagem outbound/bot sent/delivered/read, metadata CTA enviada, destino canonico da loja e parametros coerentes. Conversa/mensagem/visita cruzadas ou forjadas nao vinculam pedidos. A compra sem atribuicao continua valida. Limite tecnico de 100 novos IDs por mensagem/24h, serializado, reduz abuso; pode subcontar links muito compartilhados e nao limita compras. Replays existentes nao consomem nova cota.

Consulta somente apos `reports.view` na loja; DTO agregado, sem IDs de clientes/conversas/mensagens. RLS forcada e permissoes diretas revogadas de PUBLIC, anon, authenticated e service_role.

## Retencao e compatibilidade

Visitas antigas sao excluidas logicamente da leitura apos 30 dias, inclusive se o worker estiver pausado. A exclusao fisica usa a mesma transacao/auditoria/escopo do worker de retencao existente; nao o ativa. Conversas removidas tambem removem os acessos por FK composta. Pausa operacional pode adiar exclusao fisica; nao se promete execucao de job que esteja desligado.

Auditoria v2 acrescenta `digitalMenuAttributionDays: 30` ao snapshot e `deletedAttributionAccesses` as contagens. Migration aditiva preserva historicos e aceita escritores v1 legados e v2 com seus snapshots correspondentes durante o deploy. DELETE/TRUNCATE da auditoria e finalizacao repetida continuam proibidos.

Analytics nao participa da identidade comercial do requestHash. A primeira atribuicao persistida nao e alterada no replay. Pedidos anteriores ao deploy usam o snapshot original para compatibilidade com o hash legado, reconstruindo a ordem de campos apos leitura JSONB. Alteracoes comerciais ainda conflitam.

## Aceite

Validar CTA real gerado pela politica e persistido no limite de transporte de QA -> link -> consentimento -> acesso -> carrinho -> pedido -> consulta UI/DB. Fixture de mensagem com ACK simulado nao prova envio fisico; pedido e snapshot nao podem ser injetados para provar conversao. Evidencias devem identificar SHA, limites, rollback/cleanup e bot pausado. Done exige merge/deploy e aceite conforme processo.
