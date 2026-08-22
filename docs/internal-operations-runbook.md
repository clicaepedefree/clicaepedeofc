# Operacao Interna: APIs, Regras De Negocio E Guia Administrativo

Este documento acompanha a versao entregue da area de operacao interna do
Clica e Pede. Ele serve para suporte, financeiro, implantacao e administradores
internos executarem fluxos sem depender do time de desenvolvimento.

Os exemplos usam dados ficticios. Nao coloque senhas, chaves, tokens,
documentos reais de clientes ou URLs privadas neste arquivo.

## Escopo

A area interna cobre:

- Cadastro administrativo de lojas.
- Implantacao e ativacao comercial.
- Reativacao, inativacao, cancelamento, arquivamento e recuperacao.
- Bloqueio e desbloqueio de acesso.
- Planos, valores contratados, descontos, modulos e faturas.
- Eventos de cobranca, webhooks do gateway e conciliacao.
- Usuarios vinculados a lojas, convites, bloqueios e recuperacao de senha.
- Auditoria das operacoes feitas pelo time interno.

Ficam fora deste documento:

- Operacao diaria da loja no PDV.
- Cadastro comum feito pelo proprio cliente no onboarding.
- Integracoes externas ainda nao homologadas.
- Dados sigilosos de ambiente, como secrets de Clerk, Supabase, Vercel ou
  gateway de pagamento.

## Acessos E Rotas

As rotas internas ficam protegidas por Clerk e por role interna:

- `/internal/stores`: lista de lojas e filtros administrativos.
- `/internal/stores/new`: cadastro interno de uma nova loja.
- `/internal/stores/[storeId]`: detalhe administrativo da loja.
- `/internal/monitoring`: monitoramento operacional, quando habilitado.
- `/internal-operations`: entrada administrativa no painel principal.

As telas administrativas chamam Server Actions. Elas nao sao uma API publica
para terceiros. O operador deve usar a interface interna, e nao chamadas diretas
por ferramenta externa.

## Modelo De Permissao Interna

O acesso interno e definido no Clerk, no campo privado:

```json
{
  "internalRole": "superadmin"
}
```

Roles aceitas:

| Role | Uso esperado |
| --- | --- |
| `superadmin` | Administracao total da operacao interna. |
| `finance` | Cobranca, faturas, descontos, cancelamentos e modulos. |
| `support` | Visualizacao interna, reativacao e bloqueio de acesso. |
| `sales` | Cadastro de lojas, perfil comercial, implantacao, descontos e modulos. |
| `implementation` | Implantacao, checklist, perfil da loja, ativacao e modulos. |
| `viewer` | Consulta interna sem alteracao. |
| `ops_admin` | Papel legado tratado como `superadmin`. |

Permissoes principais:

| Permissao | O que libera |
| --- | --- |
| `view_internal_operations` | Entrar na area interna. |
| `view_personal_data` | Ver dados pessoais mascarados/desmascarados conforme tela. |
| `export_personal_data` | Exportar dados pessoais quando permitido. |
| `create_store` | Cadastrar loja pela area interna. |
| `manage_store_profile` | Alterar dados cadastrais da loja. |
| `manage_implementation_checklist` | Marcar itens de implantacao. |
| `activate_implemented_store` | Ativar loja depois da implantacao. |
| `manage_store_lifecycle` | Ativar, inativar, cancelar ou reativar comercialmente. |
| `reactivate_store` | Recuperar loja pendente. |
| `archive_store` | Arquivar loja manualmente. |
| `manage_billing_values` | Alterar valores, descontos e condicoes de cobranca. |
| `manage_billing_invoices` | Criar, remarcar, cancelar, reembolsar e baixar faturas. |
| `apply_billing_discounts` | Aplicar descontos comerciais. |
| `cancel_billing` | Cancelar cobranca/assinatura. |
| `manage_store_modules` | Ativar ou remover modulos contratados. |
| `block_store` | Bloquear ou desbloquear acesso da loja. |

Regra de seguranca: se o operador nao tiver a permissao da acao, a Server
Action deve negar a operacao mesmo que a tela seja acessada manualmente.

## Estados Da Loja

| Estado | Significado operacional |
| --- | --- |
| `implementing` | Loja criada internamente, ainda em implantacao. |
| `active` | Loja liberada para uso normal. |
| `inactive` | Loja pausada/inativa por decisao comercial ou operacional. |
| `pending_recovery` | Loja ficou sem responsavel ativo apos evento de conta apagada. |
| `archived` | Loja arquivada e fora do fluxo comercial comum. |

Regras importantes:

- Loja `pending_recovery` nao deve ser associada automaticamente por e-mail.
- Recuperacao de loja e uma decisao manual do time interno.
- Arquivamento e reversao precisam de motivo registrado.
- Uma loja bloqueada por cobranca pode continuar existindo como `active`, mas
  o acesso operacional fica impedido pelo bloqueio.

## Estados De Cobranca

Assinatura:

| Estado | Significado |
| --- | --- |
| `trialing` | Loja em periodo inicial/teste. |
| `active` | Assinatura ativa. |
| `past_due` | Cobranca vencida ou com pendencia. |
| `paused` | Assinatura pausada. |
| `canceled` | Assinatura encerrada. |

Fatura:

| Estado | Significado |
| --- | --- |
| `pending` | Fatura aberta aguardando pagamento. |
| `paid` | Fatura paga. |
| `overdue` | Fatura vencida. |
| `cancelled` | Fatura cancelada. |
| `refunded` | Fatura reembolsada. |

Pagamento:

| Estado | Significado |
| --- | --- |
| `pending` | Pagamento recebido em processamento ou aguardando confirmacao. |
| `confirmed` | Pagamento confirmado. |
| `failed` | Tentativa de pagamento falhou. |
| `cancelled` | Pagamento cancelado. |
| `refunded` | Pagamento reembolsado. |

Metodos de pagamento registrados:

- `pix`
- `credit_card`
- `boleto`
- `manual`
- `external`

## Estados De Modulos E Plano

Origem do modulo na loja:

| Origem | Quando usar |
| --- | --- |
| `plan` | Modulo incluso no plano contratado. |
| `addon` | Modulo adicional cobrado a parte. |
| `courtesy` | Cortesia temporaria ou comercial. |
| `manual` | Liberacao manual excepcional. |

Estado do modulo:

| Estado | Significado |
| --- | --- |
| `active` | Modulo disponivel para a loja. |
| `inactive` | Modulo desativado sem revogacao definitiva. |
| `expired` | Prazo de uso encerrado. |
| `revoked` | Acesso revogado manualmente. |

Mudanca de plano:

- Timing `immediate`: aplica agora.
- Timing `next_renewal`: agenda para a proxima renovacao.
- Tratamento de modulos `sync_to_new_plan`: sincroniza com o novo plano.
- Tratamento de modulos `keep_current`: mantem liberacoes atuais.
- Tratamento de modulos `manual_review`: exige revisao manual.
- Status `scheduled`, `applied` e `cancelled` controlam a mudanca agendada.

## Usuarios Da Loja

Roles de loja:

| Role | Uso esperado |
| --- | --- |
| `owner` | Proprietario, acesso total e responsavel por regras protegidas. |
| `manager` | Gerente operacional. |
| `attendant` | Atendimento e pedidos. |
| `cashier` | Caixa e PDV. |
| `waiter` | Salao, quando o modulo estiver ativo. |
| `courier` | Entregas e status de rota. |

Permissoes de loja:

- `store.access`
- `store.settings.manage`
- `store.users.manage`
- `menu.manage`
- `orders.manage`
- `pos.operate`
- `fiscal.manage`
- `integrations.manage`
- `reports.view`
- `delivery.operate`

Regras protegidas:

- Nao pode revogar ou bloquear o ultimo usuario ativo da loja.
- Nao pode remover o ultimo `owner` ativo.
- Responsavel principal precisa ser `owner`.
- Para rebaixar ou revogar o responsavel principal, transfira primeiro a
  responsabilidade para outro `owner` ativo.
- Convite pendente nao equivale a permissao ativa.

## Superficies Tecnicas

### Server Actions Administrativas

Estas acoes sao acionadas pela interface interna:

| Acao | Finalidade |
| --- | --- |
| `createInternalStoreAction` | Cria loja internamente com responsavel, plano, modulos e convite. |
| `lookupInternalPostalCodeAction` | Consulta CEP para preencher endereco. |
| `resendStoreAccessInviteAction` | Reenvia convite de acesso. |
| `updateInternalStoreProfileAction` | Atualiza perfil, empresa, endereco e dados comerciais. |
| `reactivateStoreAction` | Reativa loja pendente de recuperacao. |
| `updateStoreImplementationChecklistItemAction` | Atualiza checklist de implantacao. |
| `activateStoreAfterImplementationAction` | Ativa loja apos implantacao. |
| `archiveStoreAction` | Arquiva loja. |
| `blockStoreAccessAction` | Bloqueia acesso da loja. |
| `unblockStoreAccessAction` | Remove bloqueio da loja. |
| `updateStoreCommercialLifecycleAction` | Ativa, inativa, cancela ou reativa comercialmente. |
| `updateStoreSubscriptionTermsAction` | Altera condicoes da assinatura. |
| `changeStoreSubscriptionPlanAction` | Muda plano agora ou agenda mudanca. |
| `createManualBillingInvoiceAction` | Cria fatura manual. |
| `markManualBillingInvoicePaymentAction` | Baixa pagamento manual. |
| `rescheduleBillingInvoiceDueDateAction` | Remarca vencimento. |
| `adjustBillingInvoiceAmountAction` | Aplica ajuste de desconto ou acrescimo. |
| `cancelBillingInvoiceAction` | Cancela fatura. |
| `refundBillingInvoiceAction` | Registra reembolso. |
| `manageStoreModuleEntitlementAction` | Ativa ou remove modulo da loja. |

### Funcoes Administrativas De Usuarios Da Loja

Estas funcoes tambem fazem parte da operacao administrativa, embora fiquem no
modulo de usuarios da loja:

| Funcao | Finalidade |
| --- | --- |
| `inviteStoreUser` | Cria convite de acesso para um usuario da loja. |
| `updateStoreUser` | Atualiza nome, telefone, perfil e responsavel principal. |
| `blockStoreUserAccess` | Bloqueia acesso de um usuario especifico da loja. |
| `unblockStoreUserAccess` | Desbloqueia acesso de um usuario especifico. |
| `revokeStoreUser` | Revoga vinculo do usuario com a loja. |
| `revokeStoreUserInvite` | Revoga convite pendente. |
| `resendStoreUserInvite` | Gera/reenvia convite pendente. |
| `requestStoreUserPasswordReset` | Cria solicitacao de recuperacao de senha. |
| `completeStoreUserPasswordReset` | Conclui recuperacao de senha com token valido. |

Essas operacoes exigem permissao de gerenciamento de usuarios da loja e gravam
auditoria quando alteram convite, acesso, responsavel principal ou recuperacao.

### Rotas HTTP

| Rota | Metodo | Protecao | Finalidade |
| --- | --- | --- | --- |
| `/api/health` | `GET` | Sem segredo, retorna apenas saude tecnica | Valida conexao basica com banco. |
| `/api/webhooks/clerk` | `POST` | Assinatura do Clerk | Processa `user.deleted` e coloca lojas afetadas em fluxo seguro. |
| `/api/webhooks/billing` | `POST` | Provider permitido e HMAC | Enfileira eventos de pagamento do gateway. |
| `/api/cron/billing` | `GET` | `Authorization: Bearer <CRON_SECRET>` | Roda cobranca recorrente, mudancas agendadas, lembretes, bloqueios, fila de webhooks e conciliacao. |

Headers esperados no webhook de cobranca:

- `x-billing-provider`
- `x-clica-timestamp`
- `x-clica-signature`

O timestamp do webhook tem tolerancia curta. Eventos com assinatura invalida,
provider nao permitido ou payload fora do formato sao registrados para
auditoria/conciliacao.

## Eventos E Auditoria

Todas as operacoes administrativas relevantes devem gerar registro em
`internal_operation_audit_logs` com:

- acao executada;
- operador interno;
- loja afetada;
- usuario alvo, quando existir;
- status anterior e novo da loja;
- motivo informado;
- data/hora.

Acoes auditadas:

- `create_store`
- `create_store_access_invite`
- `accept_store_access_invite`
- `update_store_profile`
- `update_store_implementation_checklist`
- `activate_store_after_implementation`
- `activate_store_commercial`
- `reactivate_store_commercial`
- `inactivate_store_commercial`
- `cancel_store_commercial`
- `block_store_access`
- `unblock_store_access`
- `update_store_subscription_terms`
- `change_store_subscription_plan`
- `create_manual_billing_invoice`
- `mark_manual_billing_invoice_payment`
- `reschedule_billing_invoice_due_date`
- `adjust_billing_invoice_amount`
- `cancel_billing_invoice`
- `refund_billing_invoice`
- `auto_unblock_billing_access`
- `manage_store_module_entitlement`
- `create_store_user_invite`
- `resend_store_user_invite`
- `update_store_user`
- `block_store_user_access`
- `unblock_store_user_access`
- `revoke_store_user`
- `request_store_user_password_reset`
- `consume_store_user_password_reset`
- `complete_store_user_password_reset`
- `transfer_store_primary_responsible`
- `reactivate_store`
- `archive_store`

Eventos de cobranca registrados:

- `subscription_created`
- `subscription_changed`
- `subscription_cancelled`
- `invoice_created`
- `invoice_status_changed`
- `payment_registered`
- `payment_confirmed`
- `payment_failed`
- `payment_cancelled`
- `refund_registered`
- `billing_reconciliation_issue`
- `billing_adjustment_created`
- `billing_reminder_sent`
- `billing_access_blocked`
- `billing_access_unblocked`

Eventos de gateway podem ficar como:

- `queued`
- `processing`
- `processed`
- `failed`
- `ignored`

Tipos de evento do gateway:

- `payment_succeeded`
- `payment_failed`
- `payment_refunded`
- `payment_cancelled`
- `unknown`

## Guia Operacional

### Cadastrar Uma Loja Internamente

1. Acesse `/internal/stores/new`.
2. Preencha o responsavel:
   - nome;
   - e-mail;
   - telefone, se houver;
   - CPF, se houver.
3. Preencha a loja:
   - nome fantasia;
   - subdominio publico;
   - CNPJ e razao social, se ja existirem;
   - telefone/e-mail;
   - endereco completo.
4. Escolha plano, valor contratado e desconto, se houver.
5. Marque modulos adicionais, cortesias ou liberacoes manuais quando aplicavel.
6. Decida se o convite de acesso sera enviado imediatamente.
7. Revise o resumo e informe um motivo claro, por exemplo:
   `Cadastro interno solicitado pelo time comercial para inicio de implantacao.`
8. Confirme o cadastro.

Resultado esperado:

- A loja nasce em `implementing`.
- O responsavel e criado ou reaproveitado de forma segura.
- O usuario recebe permissao na loja quando o convite for aceito.
- A assinatura e a fatura inicial sao criadas quando ha plano/valor aplicavel.
- Modulos de plano e adicionais sao vinculados.
- O evento fica auditado.

Se aparecer alerta de possivel duplicidade, revise antes de confirmar. Use a
confirmacao de duplicidade apenas quando o cadastro for intencional.

### Ativar Uma Loja Apos Implantacao

1. Abra `/internal/stores/[storeId]`.
2. Revise dados de perfil, responsavel, endereco, plano e modulos.
3. Complete o checklist de implantacao.
4. Confirme que a loja tem condicoes comerciais e operacionais minimas.
5. Clique para ativar apos implantacao.
6. Informe motivo claro.

Resultado esperado:

- Status muda de `implementing` para `active`.
- A auditoria registra `activate_store_after_implementation`.

### Atualizar Dados Da Loja

1. Abra a loja na area interna.
2. Edite perfil, empresa, contato ou endereco.
3. Informe motivo quando a tela solicitar.
4. Salve.

Cuidados:

- Evite sobrescrever documento, telefone ou e-mail sem validacao com o cliente.
- Quando houver dados pessoais, respeite mascaramento e permissao de
  visualizacao.

### Reativar Loja Pendente De Recuperacao

1. Abra a loja com status `pending_recovery`.
2. Confirme com o suporte quem e o novo responsavel.
3. Vincule ou convide o novo usuario responsavel.
4. Reative a loja somente depois de validar identidade e autorizacao.
5. Informe o motivo da recuperacao.

Resultado esperado:

- A loja volta para um status operacional permitido.
- A associacao nao acontece apenas por e-mail.
- A auditoria registra o operador e o motivo.

### Inativar, Cancelar Ou Reativar Comercialmente

1. Abra o detalhe da loja.
2. Escolha a acao comercial correta:
   - ativar;
   - reativar;
   - inativar;
   - cancelar.
3. Informe motivo objetivo.
4. Confirme o impacto em cobranca e acesso antes de salvar.

Use `inactive` para pausas operacionais/comerciais. Use cancelamento quando a
relacao comercial foi encerrada. Use arquivamento apenas quando a loja nao deve
mais aparecer no fluxo comum de suporte.

### Arquivar Loja

1. Confirme que a loja nao esta em atendimento ativo.
2. Verifique pendencias de cobranca, suporte e acesso.
3. Use a acao de arquivamento.
4. Informe motivo.

Resultado esperado:

- Status muda para `archived`.
- A operacao fica registrada em auditoria.

### Bloquear Acesso Manualmente

1. Abra a loja.
2. Use a acao de bloqueio de acesso.
3. Escolha origem `manual`.
4. Informe motivo e se o responsavel deve ser notificado.
5. Confirme.

Resultado esperado:

- A loja fica impedida de operar normalmente.
- A auditoria registra `block_store_access`.
- O registro de bloqueio fica com operador, motivo e data.

### Desbloquear Acesso

1. Abra a loja bloqueada.
2. Confirme que o motivo do bloqueio foi resolvido.
3. Use a acao de desbloqueio.
4. Informe motivo.

Resultado esperado:

- O bloqueio ativo recebe `unblockedAt`.
- A auditoria registra `unblock_store_access`.
- Se o desbloqueio veio de pagamento confirmado, pode haver evento automatico
  `auto_unblock_billing_access`.

### Alterar Valor, Desconto Ou Condicoes Da Assinatura

1. Abra a aba de cobranca/assinatura da loja.
2. Edite valor contratado, intervalo, desconto, tolerancia ou excecao de acesso.
3. Informe validade de desconto quando aplicavel.
4. Informe motivo comercial.
5. Salve.

Cuidados:

- Desconto percentual nao deve passar de 100%.
- Excecoes de acesso por cobranca precisam ter prazo ou motivo claro.
- Alteracoes financeiras devem ser feitas por `finance`, `sales` ou
  `superadmin`, conforme permissao.

### Mudar Plano

1. Abra a area de plano da loja.
2. Escolha o novo plano.
3. Defina se a mudanca sera:
   - imediata; ou
   - na proxima renovacao.
4. Escolha o tratamento dos modulos:
   - sincronizar com novo plano;
   - manter modulos atuais;
   - mandar para revisao manual.
5. Confirme valor e motivo.

Resultado esperado:

- Mudanca imediata encerra a assinatura anterior e cria a nova.
- Mudanca para proxima renovacao cria agendamento.
- O cron de cobranca aplica mudancas agendadas vencidas.
- A auditoria registra `change_store_subscription_plan`.

### Gerenciar Modulos

1. Abra a area de modulos da loja.
2. Ative ou desative o modulo desejado.
3. Escolha origem adequada:
   - adicional;
   - cortesia;
   - manual.
4. Informe valor adicional e prazo quando aplicavel.
5. Informe motivo.

Cuidados:

- Modulos vindos do plano devem ser tratados junto com plano.
- Cortesias precisam de motivo e, preferencialmente, data final.
- Nao use liberacao manual para burlar regra comercial sem aprovacao.

### Criar Fatura Manual

1. Abra a area de faturas da loja.
2. Confirme que existe uma assinatura aberta para a loja.
3. Informe periodo, vencimento, valor e motivo.
4. Confirme.

Resultado esperado:

- O sistema usa a assinatura aberta da loja como referencia.
- Fatura nasce como `pending`.
- Evento `invoice_created` e auditoria sao registrados.

### Baixar Pagamento Manual

1. Abra a fatura `pending` ou `overdue`.
2. Confirme comprovante/conciliacao fora do sistema.
3. Registre pagamento manual.
4. Informe metodo, valor, data e motivo.

Resultado esperado:

- Pagamento fica `confirmed`.
- Fatura pode mudar para `paid` se o valor quitar a pendencia.
- Bloqueio por inadimplencia pode ser removido automaticamente quando a regra
  permitir.

### Remarcar Vencimento, Ajustar, Cancelar Ou Reembolsar Fatura

Use estas acoes apenas com motivo claro:

- Remarcar vencimento: quando houve acordo comercial.
- Ajustar valor: desconto ou acrescimo pontual.
- Cancelar: fatura indevida ou substituida.
- Reembolsar: devolucao confirmada.

Todas as acoes devem gerar evento de cobranca e auditoria.

## Rotinas Automaticas

### Cron De Cobranca

O endpoint `/api/cron/billing` executa:

1. Geracao de faturas recorrentes.
2. Aplicacao de mudancas de plano agendadas.
3. Envio de lembretes de cobranca.
4. Bloqueio automatico por inadimplencia.
5. Processamento da fila de webhooks do gateway.
6. Conciliacao de eventos de gateway pendentes ou inconsistentes.

Se o cron falhar:

1. Verifique se `CRON_SECRET` esta configurado no ambiente.
2. Verifique se a chamada usa `Authorization: Bearer <CRON_SECRET>`.
3. Verifique logs da Vercel.
4. Consulte eventos `failed` ou issues de reconciliacao.
5. Reexecute depois de corrigir a causa, evitando duplicar operacoes manuais.

### Webhook De Pagamento

O endpoint `/api/webhooks/billing`:

1. Valida provider permitido.
2. Valida assinatura HMAC.
3. Normaliza o evento.
4. Enfileira o evento.
5. Processa um item imediatamente quando nao for duplicado.

Se o gateway reenviar o mesmo evento, a chave unica de provider/evento evita
duplicidade operacional.

Eventos desconhecidos ou fora de ordem podem ser ignorados e registrados para
conciliacao, sem quebrar o fluxo principal.

### Webhook De Exclusao De Usuario Clerk

O endpoint `/api/webhooks/clerk` processa apenas `user.deleted`.

Quando um usuario e removido:

1. O usuario interno e marcado como removido.
2. A loja nao e automaticamente entregue para outra conta com o mesmo e-mail.
3. Lojas afetadas entram no fluxo seguro de recuperacao quando necessario.
4. O suporte precisa validar e reativar manualmente.

## Limitacoes Conhecidas

- A documentacao descreve a area interna entregue hoje. Fluxos futuros podem
  exigir novas secoes.
- O gateway de pagamento depende de provider permitido e secret de webhook no
  ambiente. Este documento nao registra esses valores.
- A integracao fiscal e integracoes externas podem ter documentacao propria.
- A migracao de dados historicos deve seguir o documento de prontidao de
  migracao quando aplicavel.
- A area interna e pensada para operadores confiaveis. Mesmo assim, todas as
  operacoes sensiveis precisam de permissao e auditoria.
- Exemplos de e-mail, documento, loja e fatura neste arquivo sao ficticios.

## Checklist Rapido De Suporte

Antes de agir em uma loja:

- Confirme a loja correta pelo nome, subdominio e identificador interno.
- Confirme se ha mais de uma loja parecida ou duplicada.
- Verifique status da loja, assinatura, faturas e bloqueios.
- Leia eventos/auditoria recentes.
- Use motivo claro e rastreavel.
- Nao exponha dados pessoais sem permissao.

Depois de agir:

- Confirme se o status esperado foi aplicado.
- Confirme se a auditoria foi registrada.
- Confirme se o cliente deve ser avisado.
- Em cobranca, confirme se fatura, pagamento e bloqueio ficaram consistentes.

## Checklist De Cadastro De Cliente

Use este roteiro quando um operador interno cadastrar uma loja para um cliente:

1. Dados do responsavel confirmados.
2. E-mail do responsavel validado.
3. Loja e subdominio revisados.
4. Endereco completo validado.
5. Plano e valor contratado conferidos.
6. Desconto documentado, se existir.
7. Modulos incluidos e adicionais revisados.
8. Convite enviado ou agendado.
9. Loja criada em `implementing`.
10. Checklist de implantacao iniciado.
11. Auditoria registrada com motivo compreensivel.

## Checklist De Bloqueio Por Cobranca

Use este roteiro quando houver inadimplencia:

1. Verifique faturas `pending` e `overdue`.
2. Confirme periodo de tolerancia da assinatura.
3. Confirme se existe excecao de acesso vigente.
4. Se for bloqueio automatico, confira evento `billing_access_blocked`.
5. Se for bloqueio manual, informe motivo e notificacao.
6. Ao receber pagamento, confirme se fatura mudou para `paid`.
7. Confirme se o desbloqueio automatico/manual foi registrado.

## Checklist De Recuperacao De Loja

Use este roteiro para lojas `pending_recovery`:

1. Confirme que a conta anterior foi removida ou perdeu acesso.
2. Confirme identidade/autorizacao do novo responsavel.
3. Crie ou reenvie convite para o usuario correto.
4. Garanta que o responsavel principal sera `owner`.
5. Reative a loja apenas apos validacao.
6. Registre motivo claro na auditoria.
