# KAN-81 - Dominio de dados do robo de WhatsApp

## Escopo

A KAN-81 cria a fundacao de dados multiempresa para o robo de WhatsApp:

- numeros conectados por loja;
- sessoes tecnicas do provedor;
- configuracao de identidade e personalidade do assistente;
- contatos por loja;
- conversas em modo automatico ou humano;
- mensagens recebidas, enviadas e internas;
- eventos transacionais idempotentes;
- tentativas de envio e diagnostico.

## Decisoes

- Todas as tabelas possuem `store_id` obrigatorio.
- Entidades filhas usam chaves estrangeiras compostas com `store_id` para impedir vinculo com outra loja.
- Contatos usam `UNIQUE (store_id, phone_number)`, permitindo que o mesmo telefone exista em lojas diferentes sem compartilhar historico.
- Eventos transacionais usam `UNIQUE (store_id, idempotency_key)` para impedir duplicidade somente dentro da loja correta.
- O acesso inicial fica restrito ao servidor via `service_role`; `anon` e `authenticated` nao recebem grants diretos.
- RLS e `FORCE ROW LEVEL SECURITY` ficam habilitados desde a criacao das tabelas.

## Estrategia de reversao

Como a migration apenas cria tabelas novas e nao altera dados existentes, a reversao segura em ambiente sem dados produtivos do robo e remover as tabelas na ordem inversa de dependencia:

1. `whatsapp_bot_delivery_attempts`
2. `whatsapp_bot_transactional_events`
3. `whatsapp_bot_messages`
4. `whatsapp_bot_conversations`
5. `whatsapp_bot_contacts`
6. `whatsapp_bot_assistant_configs`
7. `whatsapp_bot_sessions`
8. `whatsapp_bot_numbers`

Se ja houver piloto ativo, a reversao deve ser logica: desativar o modulo `whatsapp_bot`, pausar sessoes, interromper filas e preservar as tabelas para auditoria ate exportacao ou retencao definida.
