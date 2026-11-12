# Teste interno do assistente (KAN-153)

## Intencao

O teste interno deve usar o mesmo nucleo de geracao do atendimento real,
com dados atuais da loja autorizada, sem executar o transporte ou persistir
uma conversa. O rascunho informado no formulario e validado no servidor e
nao substitui a personalidade salva. Salvar continua sendo uma acao separada.

O teste nao exige pareamento, QR Code ou bot ativo. Nao altera o estado da
sessao, numero, contato, conversa, pedido ou fila transacional.

## Fronteiras

- A action exige `integrations.manage` para o `storeId` solicitado. Somente
  mensagem e configuracao validadas chegam ao teste; o cliente nao escolhe
  contexto, ferramenta, credencial ou provedor.
- Contexto e ferramentas sao construidos no servidor para aquela loja.
  O teste nao le historico de conversas reais nem recebe telefone de cliente.
- Geracao e politica de saida sao compartilhadas com o orquestrador real.
  Decisoes de encaminhamento no teste sao resultados, nao notificacoes ou
  mudancas de modo da conversa.
- A resposta publica deve indicar `dry_run`, ausencia de envio e ausencia
  de efeitos de negocio. Prompts, instrucoes internas, payloads de erro,
  tokens e credenciais nao pertencem ao DTO do cliente.
- Rascunhos e resultados sao temporarios no navegador. Troca de loja ou
  edicao invalida o resultado anterior; uma resposta atrasada nao pode
  reaparecer associada a outra loja/configuracao.

## Dependencia de provedor e orcamento

Nenhum modelo/provedor novo foi escolhido ou autorizado nesta entrega.
O teto aprovado de US$ 10 e global para os testes iniciais, nao mensal e
nao por loja. Uma credencial existente, por si so, nao autoriza consumo.

Sem configuracao aprovada e contabilizacao global efetiva, o caminho publico
do dry-run deve falhar fechado e informar indisponibilidade. Nao apresentar
texto estatico ou provedor fake como resposta real da IA. Provedores
injetados em testes servem somente para contratos e verificacao das regras.

Antes de liberar geracao real, ainda sao necessarios: escolha e aprovacao
do provedor/modelo, credencial por canal seguro, reserva/contabilizacao
duravel do teto global com tratamento de concorrencia e timeout, e aceite
real de identidade, precos, personalidade, custo e latencia. Nao configurar
um toggle que burle esses requisitos. A meta de cinco segundos nao e SLA
comprovado pelos testes de contrato.

## UX e referencia

Mantem a tela existente de personalidade e os componentes/tokens do app,
incluindo modo escuro e telas estreitas. Referencia consultada no Dribbble:
[AI Chatbot Builder Dashboard - Settings Message, Kretya](https://dribbble.com/shots/27174086-AI-Chatbot-Builder-Dashboard-Settings-Message).
A referencia orienta a separacao entre configuracao e teste; nao substitui
o design system existente nem autoriza copiar identidade ou assets.

## Aceite e limites

Separar evidencias de contrato, consultas reais de dados e browser real.
O teste de banco deve usar transacao somente leitura; snapshots e spies
complementam, mas nao substituem o bloqueio de escrita. No navegador,
verificar rascunho sem salvamento, estado indisponivel honesto, limites,
erros, acessibilidade, isolamento e comportamento responsivo/claro/escuro.

O aceite com LLM real continua pendente ate a configuracao acima. Nao
encerrar KAN-84, KAN-85 ou KAN-86 apenas por esta entrega. Nao marcar o
criterio de geracao real da KAN-153 como testado usando um fake.

## Operacao e reversao

Nao ha necessidade de ativar respostas automaticas para testar a tela.
O bot deve permanecer pausado. Nao alterar DNS, imagem/pareamento da
Evolution, credenciais de producao ou dados comerciais nesta tarefa.
Rollback de codigo deve preservar esses estados; nao restaurar o banco
nem reconectar o telefone como parte de uma reversao de interface.
