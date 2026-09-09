# KAN-95 - Seguranca e LGPD do robo WhatsApp

## Escopo

Esta politica protege a operacao multiempresa do robo WhatsApp. Ela cobre credenciais, dados pessoais, opt-out promocional, retencao de historico e auditoria das acoes sensiveis.

## Controle de acesso

Todas as server actions administrativas do robo validam permissao da loja antes de ler, alterar ou executar operacoes. O acesso usa `validateUserPermissionsForStore` com `integrations.manage`, mantendo isolamento por `storeId` e evitando acesso cruzado entre lojas.

## Credenciais e dados sensiveis

Credenciais do provedor ficam cifradas no backend. Tokens, secrets, QR codes, payloads brutos e metadados sensiveis sao redigidos antes de aparecerem em diagnosticos, logs operacionais ou respostas de webhook. Respostas publicas de webhook retornam apenas telefone mascarado.

## Opt-out

Mensagens promocionais respeitam `promotional_opt_out_at`. O opt-out bloqueia campanhas e mensagens manuais/promocionais, mas nao bloqueia mensagens transacionais relacionadas ao pedido, como recebido, preparo, entrega e acompanhamento.

## Retencao

A rotina `pruneWhatsappBotRetainedHistory` aplica as janelas abaixo:

- QR Code expirado: removido apos 15 minutos quando a sessao nao esta conectada.
- Conversas fechadas ou bloqueadas: removidas apos 30 dias.
- Mensagens de conversas abertas: removidas apos 90 dias.
- Eventos transacionais finalizados: removidos apos 180 dias.
- Tentativas de entrega: removidas apos 180 dias.
- Contatos inativos: removidos apos 365 dias quando nao possuem conversa, fila ou opt-out pendente.

## Auditoria

Acoes sensiveis geram eventos em `internal_operation_audit_logs` com loja, ator, estado anterior, novo estado e motivo operacional:

- Conectar numero do WhatsApp.
- Renovar QR Code.
- Pausar robo.
- Desconectar robo.
- Atualizar configuracao do assistente.
- Retornar conversa do atendimento humano para o robo.

## Validacao

A KAN-95 fica pronta quando os testes confirmam:

- Bloqueio de acesso cruzado por loja nas actions administrativas.
- Ausencia de credenciais em banco aberto, logs, respostas e interface.
- Respeito ao opt-out promocional.
- Retencao e exclusao documentadas e implementadas.
- Auditoria rastreavel para acoes administrativas sensiveis.
