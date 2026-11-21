# KAN-161 - Integridade semantica do Redis restaurado

## Causa comprovada

O verificador da KAN-133 comparava hashes de DUMP antes/depois de converter
RDB para AOF e reiniciar o Redis. DUMP serializa objetos; nao e uma forma
canonica do seu conteudo. Um hash em hashtable pode ser serializado em outra
ordem apos reconstruir o dicionario num processo novo.

O teste com Redis 7.4.11 fixado pelo digest da KAN-132 comprovou:

- 100 campos com valores suficientemente grandes para usar hashtable;
- HGETALL identico antes/depois do reinicio;
- DUMP diferente, provocando erro no comparador antigo;
- comparador corrigido aceita essa equivalencia e rejeita alteracoes reais.

A reproducao usa exclusivamente dados sinteticos em container sem rede,
sem portas publicadas, com limites de recursos e volume de ownership unico.
Nao e uma restauracao de producao nesse teste de regressao.

## Correcao

Em scripts/infra/kan133/restore.py:

- Strings: bytes exatos; hashes: campos ordenados com o valor correspondente.
- Sets: membros ordenados; listas: ordem e duplicatas preservadas.
- Sorted sets: pares membro/score do Redis, sem conversao de score para float.
- Streams: DUMP estrito, preservando verificacao de metadados/entrega. Nao
  substituir por XRANGE nem alegar normalizacao semantica completa de streams.
- Tipos, cardinalidades, campos e valores delimitados por comprimento.
- SCAN deduplicado por chave real, nao pelo digest da chave.
- PEXPIRETIME e HPEXPIRETIME preservam deadlines absolutos, incluindo -1.
  Formatar inteiros sem arredondamento; valores fora do intervalo inteiro
  seguro da Lua sao recusados, nao aproximados.
- Canary excluido somente no DB0, nunca por coincidencia em outro database.
- Trabalho limitado por chaves, elementos e bytes. MEMORY USAGE SAMPLES 0
  precede a leitura completa de colecoes; falhas retornam codigos sanitizados.

O formato publico do snapshot continua contagem + digest agregado. Nunca
publicar campos, valores, chaves, dump, credenciais ou fingerprints por chave.
Nao remover gates de isolamento, pin, canary, contagem, sessao ou cleanup.

## Expiracao conservadora

O ensaio recusa chave/campo que possa expirar dentro da janela restante de
verificacao: redis-expiry-window. Isso significa prova inconclusiva por
expiracao, nao comprovacao de corrupcao. Nao retirar TTL, estender prazo,
ignorar dados volateis ou aceitar desaparecimentos arbitrarios para obter PASS.

redis-expiry-range recusa deadlines que nao podem ser comparados exatamente.
redis-fingerprint-limit recusa conjuntos alem do orcamento de verificacao.
redis-unsupported-type e redis-fingerprint-unavailable falham fechado.

## Validacao e implantacao

Testes offline:

    python -B scripts/infra/kan133/redis-fingerprint.test.py
    python -B scripts/infra/kan133/restore.test.py

Regressao real, somente em host Linux Docker autorizado com os pins instalados:

    KAN161_REDIS_INTEGRATION=true python3 -B scripts/infra/kan133/redis-fingerprint.test.py

CI executa os contratos offline e a regressao Redis com dados sinteticos,
imagem publica fixada e containers sem rede. Nao usa credenciais ou backups.

O aceite inclui repetir restore-offsite com a identidade privada por stdin,
sem grava-la na VPS. Usar diretorio candidato separado; nao substituir o
verificador agendado enquanto o codigo nao estiver revisado/mergeado.
Registrar hash dos arquivos, gates, cleanup, estado dos servicos e pausa do bot.

Apos merge: instalar somente o restore.py aprovado na localizacao canonica
KAN-133, preservar copia anterior e repetir restore completo. Nao reiniciar
Evolution, reativar worker/webhook ou executar cutover KAN-140 neste hotfix.

## Fontes

- [Redis DUMP](https://redis.io/docs/latest/commands/dump/)
- [Redis HPEXPIRETIME](https://redis.io/docs/latest/commands/hpexpiretime/)
- [Serializer Redis 7.4.11](https://github.com/redis/redis/blob/7.4.11/src/rdb.c)
