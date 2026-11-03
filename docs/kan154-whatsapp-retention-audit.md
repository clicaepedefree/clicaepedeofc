# KAN-154 - Auditoria da retencao automatica

## Contrato

`pruneWhatsappBotRetainedHistory` continua retornando as seis contagens existentes.
A rotina agora registra intencao duravel em `whatsapp_retention_runs` antes da
limpeza. Mutacoes e finalizacao da auditoria usam a mesma transacao PostgreSQL:
nao existe limpeza confirmada sem sua confirmacao duravel de auditoria.

O log administrativo existente exige identidade Clerk/email e estados comerciais
de loja. Nao e apropriado inventar um usuario humano para um job; esta tabela
privada e tipada registra exclusivamente a identidade `system:whatsapp-retention`.

Cada execucao guarda UUID, UUID de correlacao, job, politica/versao, escopo de IDs
tecnicos de lojas, marco temporal, inicio/fim, resultado e contagens. Nao guarda
telefone/JID, corpo de mensagem, IDs dos registros removidos, QR, prompt, token,
credencial, erro SQL livre ou copia de dado excluido. Erro usa apenas `prune_failed`.

## Resultados e atomicidade

- `running`: intencao registrada; resultado ainda nao confirmado. Pode indicar
  execucao ativa ou interrompida. Nunca interpretar como sucesso ou zero removidos.
- `succeeded`: houve alteracao e as seis contagens foram confirmadas no mesmo commit.
- `noop`: operacao confirmada sem alteracoes, inclusive escopo vazio.
- `failed`: transacao desfeita e falha registrada separadamente, com contagens zero.

Falha intermediaria nao deixa uma limpeza parcialmente aplicada: todos os passos
sao revertidos. Se a conexao cair durante o ACK do commit, a rotina rele a auditoria
sob o mesmo lock antes de decidir o resultado. Uma confirmacao existente nao pode
ser sobrescrita por falha. Se nem a verificacao puder ser persistida/lida, a rotina
falha fechada; a intencao continua sem resultado confirmado. Nao fabricar sucesso.

## Retry, concorrencia e worker

Um lock transacional PostgreSQL serializa limpezas de escopos potencialmente
sobrepostos; funciona tambem com pooler transacional. `runId` e idempotente:
resultado terminal confirmado e reaproveitado, falha terminal nao executa de novo,
e contexto divergente e rejeitado. Retentar uma falha exige novo UUID de execucao;
preservar o UUID de correlacao quando fizer parte da mesma operacao superior.
Uma intencao interrompida pode ser retomada com o mesmo UUID, pois qualquer limpeza
anterior sem finalizacao no mesmo commit foi revertida. O marco temporal fica
congelado na primeira intencao; se explicitado no retry, precisa ser identico.

O lock duravel do scheduler fornece seu UUID ao callback do worker. Esse UUID
correlaciona a retencao ao job real e e usado como `runId` no processamento da fila.
Chamadas internas sem scheduler recebem UUID proprio. Falha da auditoria/retencao
interrompe o processamento antes de reivindicar ou enviar mensagens.

## Preservacao de escopo e dados

`storeIds` e normalizado/validado. `undefined` usa o rollout vigente; `[]` significa
nenhuma loja, nunca todas. Piloto intersecta o pedido com sua allowlist; rollout
off nao limpa nenhuma loja. Esta funcao nao amplia o conjunto de tenants liberados.

Mantidas as janelas existentes: QR15min, mensagens90dias, conversas fechadas30dias,
eventos/tentativas180dias, contatos365dias. Guardas conservadores impedem que uma
exclusao de pai provoque cascata de filhos recentes ou pendentes:

Antes de excluir pais candidatos, a transacao os bloqueia com `FOR UPDATE` na
ordem contato/conversa/evento e por ID. A exclusao usa uma nova consulta e somente
os IDs bloqueados. Isso impede que uma insercao concorrente de filho, invisivel no
snapshot anterior, seja apagada por cascata sem entrar nas contagens. Escritores
que ja obtiveram o lock FK terminam primeiro e seus filhos sao reavaliados; um
novo escritor nao pode confirmar referencia a um pai excluido enquanto ele esta
bloqueado. Deadlock/timeout desfaz a limpeza e produz falha auditada, nao parcial.

- QR de sessao conectada e preservado.
- Tentativas antigas de eventos ainda nao terminais sao preservadas.
- Evento terminal so e excluido quando nao tem tentativas remanescentes.
- Mensagem queued e preservada, mesmo antiga.
- Conversa fechada so e excluida quando nao tem mensagens ou eventos remanescentes.
- Contato com opt-out ou referencias remanescentes nao e excluido.

As contagens correspondem a linhas efetivamente alteradas/excluidas, sem somar
candidatos ou esconder exclusoes em cascata.

## Seguranca e retencao da auditoria

Tabela privada, RLS forcada, sem acesso de anon/authenticated/service_role pela
Data API. Inicio imutavel; finalizacao permitida uma unica vez; resultado terminal
nao editavel. DELETE/TRUNCATE bloqueados, inclusive pelo papel de aplicacao.
Nao existe expurgo automatico desta trilha: manter metadados tecnicos sem PII ate
uma politica de retencao de auditoria ser aprovada separadamente. Nao apagar
historico real ou reescrever Git como parte desta story.

## Operacao e diagnostico

Consulta somente por acesso administrativo autorizado ao banco, sem endpoint
publico novo:

```sql
select id, correlation_id, actor_id, job_name, policy_version, store_ids,
       effective_at, started_at, finished_at, status, counts, error_code
from public.whatsapp_retention_runs
order by started_at desc
limit 20;
```

Investigar `running` antigo junto do estado do job/lease e conexoes, sem concluir
que dados foram removidos. Nao repetir comandos de limpeza real para diagnosticar.
Nao reativar bot, webhook ou worker pausados. A migracao adiciona somente estrutura
e protecoes; nao executa retencao de dados existentes.

## Aceite

Testar com PostgreSQL e fixtures isoladas: exclusao/contagens/auditoria reais,
no-op, rollback em falha intermediaria e finalizacao, retry, concorrencia, escopo
vazio/piloto/tenant cruzado, opt-out e dados recentes. Mocks de contrato nao substituem
essas provas. Nenhuma UI nova exige redesenho ou referencia visual.

Esta entrega supre a fonte de auditoria pendente da KAN-95 e a divergencia de
retencao na KAN-98; nao homologa as demais permissoes, LLM ou operacao dessas tarefas.
