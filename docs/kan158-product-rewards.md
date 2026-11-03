# KAN-158 - Produto-premio de fidelidade

## Contrato

O direito nasce no ledger da KAN-152, somente apos as participacoes necessarias
serem confirmadas. O voucher `FID-<grant UUID>` identifica esse mesmo direito;
nao e senha, autorizacao ou outro premio. Imediato significa disponivel para
resgate agora, nao entrega automatica nem alteracao de pedido finalizado.

O cliente acessa Meus beneficios no cardapio e comprova posse do telefone pela
carteira existente. A sessao e vinculada ao navegador, loja e telefone. Telefone
ou voucher informado sozinho nao autoriza consultar/consumir direito alheio.

No checkout pode selecionar um produto-premio. O servidor reserva o grant,
insere uma unidade gratuita identificada no pedido e baixa seu estoque na mesma
transacao. Valor pago e frete continuam calculados pelo servidor; o produto
gratuito nao gera cashback. Pedido apenas de premio, sem base efetivamente paga,
nao gera nova participacao, mesmo se N=1 e minimo=0. Continuam valendo as regras
existentes de disponibilidade, horario e modalidade do checkout, inclusive
minimo de entrega configurado; nao se cria minimo adicional para o resgate.

## Estados e concorrencia

- Direito pendente nunca pode ser reservado. Confirmacao preserva ciclo, loja,
  conta, produto original, versao e validade da regra.
- Disponivel pode ser reservado em um unico pedido. Finalizacao consome a
  reserva; rejeicao/cancelamento devolve o mesmo direito com historico.
- Replay retorna a mesma reserva; o checkout idempotente nao reinsere o item.
- Locks de pedido/conta e indice unico de reserva ativa protegem duas abas,
  eventos repetidos e duas compras concorrentes.
- O extrato conserva consumidos, expirados e suspensos. Nao apagar historico
  para liberar novo premio ou simular devolucao.

## Cancelamentos e catalogo

Cancelar o pedido de resgate nao cria grant nem estende a validade. Se o prazo
original ja venceu, o direito continua visivel como expirado. A extensao de sete
dias do cashback nao foi aprovada para produto e nao e aplicada aqui.

Cancelar uma origem suspende o premio ainda nao usado. Se o produto ja foi
consumido, nao se cobra produto/dinheiro: a participacao faltante e compensada
antes da proxima recompensa, reaproveitando a reconciliacao de ciclos existente.
Uma reserva ja aceita nao e retirada silenciosamente do pedido por esse ajuste.

Produto excluido, sem estoque, categoria/oferta desabilitada ou que exige escolha
de adicionais fica indisponivel para este resgate. Preservar direito e snapshots;
nao trocar por outro produto nem creditar dinheiro sem nova decisao comercial.
O premio nesta entrega corresponde ao produto base, sem adicionais escolhidos
automaticamente. Caso seja necessaria alternativa, o produto deve decidir e
aprovar regra especifica, nao o backend presumir substituicao.

Cancelamento nao reponha estoque automaticamente nem declare reembolso de
dinheiro; continuam as regras operacionais da KAN-159 e a conciliacao manual.

## Notificacao e seguranca

Notificacao de premio usa concessao real, confirmada e vigente, com voucher e
produto. Reutiliza a fila/adaptador transacional com chave idempotente por grant.
Snapshot enviado pelo cliente nao e fonte de concessao. Testar fila nao comprova
recebimento fisico; bot pessoal, webhook e worker permanecem pausados sem nova
autorizacao explicita.

Tabela de resgates privada, historico protegido, referencias compostas de loja e
conta. Nenhum endpoint permite debitar por telefone/voucher sem a carteira.
Testes usam fixtures proprias; provas PostgreSQL, concorrencia e navegador sao
registradas separadamente, sem confundir mocks de infraestrutura com transporte.
