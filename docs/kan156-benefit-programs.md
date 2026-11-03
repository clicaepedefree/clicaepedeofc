# KAN-156 - Configuracao dos programas de beneficios

## Limites

Esta entrega configura cashback e fidelidade por restaurante. Nao cria carteira,
creditos, resgate, vouchers, integracao PDV nem ativa o bot. O motor de concessoes
e a KAN-152; uso de cashback e premios em produto pertencem a KAN-157/158.

## Contrato de versoes

- Ausencia de configuracao nao habilita programa nem escolhe valores comerciais.
- Cada salvamento valido cria uma versao imutavel por loja, com ator e data.
- O cliente informa a versao que editou; alteracao concorrente exige recarregar,
  nao substitui silenciosamente o trabalho de outro gestor.
- Versoes anteriores permanecem consultaveis no banco, inclusive quando o
  produto do premio deixa de fazer parte das opcoes atuais.
- Esta entrega nao altera pedidos, ciclos ou ganhos anteriores. A KAN-152 deve
  fixar a versao aplicavel ao criar o pedido/ciclo e reutiliza-la nas transicoes.
  Mudanca retroativa/migracao de ciclos requer decisao de produto especifica.

## Regras de negocio aprovadas

- Programas cumulativos, identidade por telefone com isolamento por loja.
- Criacao de pedido elegivel: ganho e participacao pendentes; finalizacao:
  credito disponivel e participacao confirmada. So participacao confirmada
  libera premio. A configuracao por si so nao concede esses beneficios.
- Cashback: percentual, validade e minimo definidos pelo restaurante.
- Fidelidade: quantidade de pedidos, minimo, premio cashback fixo ou produto do
  proprio catalogo e validade definidos pelo restaurante; novo ciclo ao completar.
- Cancelamentos e compensacoes seguem o contrato aprovado da KAN-152.
- Nenhuma mudanca nesta tarefa liga/desliga o modulo comercial KAN-53; o
  servidor consulta o acesso efetivo existente antes de habilitar um programa.

## Matriz de verificacao

| Cenario | Resultado esperado |
| --- | --- |
| Primeiro acesso | Desabilitado e campos sem valores comerciais predefinidos |
| Cashback completo | Salvar percentual, dias e minimo; reabrir e conferir banco |
| Fidelidade cashback | Salvar numero de pedidos, minimo, valor e validade |
| Fidelidade produto | Somente item da loja; valor monetario nao pode sobrar no ramo produto |
| Entradas invalidas | Rejeitar vazios obrigatorios, negativos, NaN, precisao excessiva e IDs invalidos |
| Sem permissao | Negar leitura/escrita antes de acessar configuracoes da loja |
| Modulo inativo | Nao habilitar programa nem conceder entitlement implicitamente |
| Outra loja | Nao ler/escrever configuracao ou produto de terceiro |
| Duas edicoes | Uma versao ganha; outra recebe conflito explicito |
| Pedido concorrente | Configurar nao altera pedido existente nem suas informacoes |
| Auditoria | Versoes diferentes, ator/data presentes, historico anterior intacto |
| Tema e viewport | Desktop/mobile, claro/escuro, sem overflow horizontal |
| Troca de loja | Sem rascunho ou resultado de salvamento aplicado a outra loja |
| Falha de rede | Sem falso sucesso; formulario recuperavel e erro acionavel |

Unidade e integracao nao substituem o fluxo funcional autenticado em preview.
Registrar as evidencias por criterio no Jira; manter pendencias explicitamente
abertas ate verificadas. Build/merge nao sao motivo para mover para Done.
