# KAN-75 - Preparacao da migracao dos dados existentes

Esta etapa prepara a migracao para o modelo administrativo novo sem alterar dados.
O objetivo e gerar um relatorio idempotente que pode ser executado em uma copia
da producao antes de qualquer backfill real.

## Como executar

Preferencialmente aponte para uma copia da producao:

```bash
KAN75_DATABASE_URL="postgresql://..." bun run internal:migration-readiness -- --format=markdown --output=artifacts/kan75-readiness.md
```

Se for necessario usar `POSTGRES_URL` ou `DATABASE_URL` do `.env.local`, a flag
explicita evita rodar no banco errado por acidente:

```bash
bun run internal:migration-readiness -- --format=json --allow-default-database
```

## O que o relatorio valida

- Mapeia lojas, assinaturas, modulos, vinculos plano-modulo e faturas para o
  modelo novo.
- Concilia totais antes e projecoes depois do backfill.
- Isola registros ambiguos para decisao manual antes de qualquer escrita.

## Decisoes manuais esperadas

Registros com severidade `blocking` devem ser resolvidos antes do backfill:

- loja ativa sem assinatura aberta;
- loja com mais de uma assinatura aberta;
- assinatura sem loja ou plano;
- fatura sem loja/assinatura ou vinculada a outra loja;
- direito de modulo sem loja/modulo ou com vinculo plano-modulo invalido;
- entitlement ativo duplicado.

Registros com severidade `warning` podem exigir backfill controlado:

- fatura com divergencia de subtotal/desconto/total;
- entitlement de plano ausente para um modulo que o plano ativo deveria liberar.

## Estrategia de backfill

1. Criar ou revisar catalogo de planos, modulos e vinculos plano-modulo.
2. Preencher uma fonte de decisao manual para lojas ambiguas, incluindo plano,
   valor contratado, status de assinatura, proxima cobranca e regra de fatura
   inicial.
3. Executar backfill transacional e rerunnable apenas para registros resolvidos.
4. Gerar novamente este relatorio e comparar os totais antes/depois.
