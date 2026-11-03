# KAN-152 - Fonte real de beneficios

## Fronteiras da entrega

O motor persiste concessoes, participacoes e saldos; nao cria carteira publica,
prova de posse do telefone, resgate no checkout ou voucher. Essas interfaces
continuam nas KAN-157/158. Nao envia mensagens diretamente: eventos confirmados
entram na fila transacional existente. Bot pessoal permanece pausado.

Somente o checkout do cardapio, com precos/totais calculados no servidor, opta
explicitamente pela captura. A criacao do PDV nao e fonte de beneficios nesta
fase, mesmo se uma requisicao informar canal DIGITAL_MENU ou snapshot forjado.
Pedidos anteriores a entrega nao recebem creditos retroativos ao mudar status.

## Contrato de identidade e dinheiro

- Identidade por telefone normalizado, isolada por restaurante. O telefone
  capturado na origem nao e prova de posse para gastar saldo.
- Valores monetarios de origem sao os totais persistidos do pedido, nao ganhos,
  saldo ou percentuais informados no snapshot do cliente.
- Base de cashback: produtos pagos apos descontos e uso de cashback, excluindo
  entrega. Dinheiro e calculado com Decimal, nunca ponto flutuante binario.
- Para a futura KAN-157, order.totalPrice e o total original apos promocao,
  antes do pagamento por carteira. Debito deve ocorrer antes da captura, na
  mesma transacao; a captura desconta o debito persistido e a entrega da base.
  Novo debito apos captura e rejeitado, nunca recalcula ganho historico nem
  permite cashback sobre cashback. A interface de resgate e integrada pela KAN-157.
- Ganho em centavos arredondado para baixo; nao ha arredondamento que conceda
  mais do que o percentual configurado. Limites tecnicos de data devem impedir
  vencimentos invalidos sem comprometer pedidos sem elegibilidade.
- Prazo comeca na confirmacao/disponibilidade, usando timestamptz UTC e dias
  de 24 horas. Pendente nao fica disponivel nem libera premio.

## Invariantes de integracao

- Captura na criacao fixa versao, identidade e elegibilidade. Confirmacao e
  cancelamento usam os registros capturados, nao as regras mais recentes.
- Atomicidade com a transacao do pedido: falhar a criacao reverte tambem o
  beneficio; confirmar nao pode publicar ganho que nao foi persistido.
- Cada pedido/tipo/transicao tem identidade unica; retry ou concorrencia nao
  cria dinheiro/participacao/recompensa duas vezes.
- Notificacoes leem concessoes reais do ledger. snapshot.benefits arbitrario
  nao e fonte autoritativa, mesmo em pedido com status COMPLETED.
- Estorno de ganho e devolucao de cashback usado sao movimentos distintos.
  Divida de ajuste e compensada por ganhos futuros, sem cobrar dinheiro nem
  bloquear pedidos; saldo vencido ou pendente nao e gasto disponivel.
- Devolucao preserva lotes e validade original, ou sete dias se ja vencida.
- Devolucao nao e ganho futuro: retorna o valor utilizado sem amortizar outras
  dividas de ajuste. Lote de recompensa suspensa permanece suspenso tambem
  quando devolvido; nao pode ser usado para pagar divida nem gastar saldo.
- O motor nao altera automaticamente as permissoes, modulos ou configuracoes
  do restaurante, nem reativa o bot para entregar notificacoes de teste.

## Cancelamento de pedido finalizado

O cancelamento comum continua considerando COMPLETED terminal. A KAN-159 deste
conjunto oferece um comando separado para proprietario/gerente, com motivo,
conciliacao manual e conservacao do historico financeiro. O motor recebe o
cancelamento na mesma transacao e registra compensacoes sem prometer reembolso
financeiro. Reversao por SQL continua sendo integracao, nao prova do fluxo de UI.

## Verificacao obrigatoria

Testar dados persistidos e extrato na criacao/finalizacao/cancelamento,
idempotencia, ganho ja consumido, expiracao, novos ganhos compensatorios,
recompensa monetaria/produto, reinicio/cancelamento de ciclo, mudanca de regra,
pedidos concorrentes, outra loja, telefone equivalente e snapshot malicioso.
Testes de transporte simulado nao comprovam recebimento fisico. Evidencias
devem distinguir testes unitarios, PostgreSQL real, navegador e entrega real.
