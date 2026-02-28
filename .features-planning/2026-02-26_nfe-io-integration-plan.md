# Feature: NFe.io Integration for Nota Fiscal (NFC-e)

**Created**: 2026-02-26
**Updated**: 2026-02-27
**Status**: Planning
**Owner**: -

## Feature Overview

### Goal

Integrate with NFe.io to enable automatic Nota Fiscal Consumidor (NFC-e) generation for POS orders. This includes:

1. Company management on NFe.io (create, update, certificate upload)
2. Invoice number control with series (we provide the number, not NFe.io)
3. Automatic invoice generation based on configurable payment method triggers
4. Store-scoped fiscal configuration (each store manages its own settings independently)

### User Value

- Legal compliance: Brazilian businesses need to issue Notas Fiscais
- Automation: Auto-generate NFs based on payment methods (e.g., always for PIX/card payments)
- Independence: Multi-tenant stores don't affect each other's fiscal configurations
- Number Control: Invoice numbers are sequential per series, no gaps

### Scope

**Included:**

- NFe.io SDK integration (nfe-io npm package)
- Store-scoped fiscal configuration (API key, company, certificate, settings)
- Company creation/update on NFe.io
- Certificate upload to NFe.io
- NFC-e generation for POS orders with explicit invoice number control
- Auto-emission configuration by payment method (as POS feature, not fiscal)
- Invoice tracking and status with race condition prevention
- Customer CPF input at POS checkout (optional)

**Excluded:**

- NF-e (full invoice for B2B) - can be added later (type field supports it)
- Batch invoice processing
- Invoice cancellation UI
- XML/SPED export

## Current Implementation Analysis

### Database Issues

Current schema has isolation problems:

```
legal_entities (global)          stores_legal_entity (join)
├── id                           ├── store_id (unique)
├── federalTaxNumber (unique)    └── legal_entity_id
├── name, tradeName, address...
└── createdBy
```

**Problems:**

1. `federalTaxNumber` (CNPJ) is unique globally - can't have same company in multiple stores
2. Updating company info affects ALL stores sharing that legal entity
3. No NFe.io-specific fields (API key, company ID, certificate status)
4. No fiscal configuration storage (environment, series numbers)
5. No invoice tracking table
6. Auto-emission stored as JSONB - hard to maintain and type

### Solution: Store-Scoped Architecture

Replace shared legal entities with per-store fiscal configuration:

```
store_fiscal_configs (one per store)
├── id
├── store_id (unique, FK)
├── nfeio_api_key (encrypted)
├── nfeio_company_id (from NFe.io)
├── environment (sandbox | production)
├── status (pending_setup | pending_certificate | active | error)
│
├── Company Info (denormalized per store)
│   ├── federal_tax_number (CNPJ)
│   ├── name, trade_name
│   ├── tax_regime
│   ├── address fields...
│   └── contact info...
│
├── Fiscal Settings
│   ├── state_registration (IE)
│   ├── csc_id, csc_code
│   ├── nfce_series
│   ├── next_nfce_number (for invoice number control)
│   └── accountant_email
│
└── timestamps
```

```
store_auto_emission_payment_methods (POS feature, not fiscal)
├── id
├── store_id (FK)
├── payment_method (enum: CASH, PIX, CREDIT, etc.)
└── timestamps

Note: This is a junction table - one row per payment method per store
No "enabled" boolean needed - row existence = enabled, delete = disabled
```

```
service_invoices (tracks issued NFs)
├── id
├── store_id (FK)
├── order_id (FK)
├── type (enum: NFCE) -- extensible for NFE later
├── series
├── invoice_number (the number we control)
├── nfeio_invoice_id (from NFe.io response)
├── status (pending | processing | issued | error | cancelled)
├── customer_cpf (optional - for identified invoices)
├── pdf_url, xml_url
├── error_message
└── timestamps
```

### Invoice Number Control Strategy

**Critical Requirement**: We control invoice numbers, not NFe.io.

**Race Condition Prevention**:

1. Before calling NFe.io API, INSERT invoice record with status='pending' and the next invoice number
2. Use DB transaction with row locking on `next_nfce_number`
3. If NFe.io returns duplicate number error, increment and retry
4. On success, update status to 'issued' with PDF/XML URLs
5. On unrecoverable error, update status to 'error' (number is "burned")

```
Flow:
1. BEGIN TRANSACTION
2. SELECT next_nfce_number FROM store_fiscal_configs WHERE store_id = ? FOR UPDATE
3. INSERT service_invoice (status='pending', invoice_number=next_number, series=config.nfce_series)
4. UPDATE store_fiscal_configs SET next_nfce_number = next_number + 1
5. COMMIT
6. Call NFe.io API with explicit series + invoice_number
7. UPDATE service_invoice SET status='issued'|'error' based on result
8. If duplicate number error from NFe.io: repeat from step 1
```

**Why denormalize company info?**

- Each store owns its fiscal identity completely
- No accidental cross-store data sharing
- Simpler queries (no joins)
- Matches NFe.io model (each API key = separate company)

## Architecture Alignment

### Patterns to Follow

1. **Service Layer** (`services/nfeio/`): Thin wrapper around nfe-io SDK

   - Only API communication, no business logic
   - Similar to `services/ifood/index.ts`

2. **Feature Layer** (`features/fiscal/`): All business logic

   - Server actions with permission checks
   - Transaction-aware DB functions
   - Similar to `features/ifood/api.ts`

3. **Encryption**: Rename `IFOOD_TOKEN_ENCRYPTION_KEY` to `TOKEN_ENCRYPTION_KEY` and use for all sensitive data

4. **Configuration Pattern**: Store-scoped like `ifood_integrations`

5. **Auto-emission**: Part of POS/store settings, not fiscal (separate concern)

### Code Organization

```
src/
├── services/nfeio/
│   ├── index.ts          # NFe.io client wrapper
│   └── types.ts          # API response types
│
├── features/fiscal/
│   ├── api.ts            # Server actions (company + invoice)
│   ├── db.ts             # DB queries
│   ├── types.ts          # Feature types
│   ├── cache-keys.ts     # React Query keys
│   ├── hooks/
│   │   ├── use-fiscal-config.ts
│   │   └── use-service-invoices.ts
│   ├── components/
│   │   ├── company-settings-form.tsx
│   │   ├── fiscal-settings-form.tsx
│   │   └── certificate-upload.tsx
│   └── form-validation/
│       └── fiscal-schemas.ts
│
├── features/store/  (or features/pos/)
│   └── components/
│       └── auto-emission-config.tsx  # POS feature, not fiscal
│
└── services/db/schema/
    ├── store-fiscal-configs.ts
    ├── store-auto-emission-payment-methods.ts
    └── service-invoices.ts
```

## Implementation Tasks

### Core Tasks (Required for MVP)

#### TASK-001: Database Schema - Store Fiscal Configs

- **Status**: ⏳ Pending
- **Type**: Core
- **Complexity**: Medium
- **Dependencies**: None
- **Parallelizable With**: TASK-002, TASK-002b
- **Files**:
  - Create: `src/services/db/schema/store-fiscal-configs.ts`
  - Create: `src/services/db/schema/store-fiscal-configs-relations.ts`
  - Modify: `src/services/db/schema/index.ts`
- **Implementation Notes**:
  - Store all fiscal config per store (no shared entities)
  - `nfeio_api_key` encrypted with AES-256-GCM
  - `status` enum: `pending_setup | pending_certificate | active | error`
  - `nfce_series` integer for series number
  - `next_nfce_number` integer for invoice number control (starts at 1)
  - No JSONB fields - all typed columns
  - Add relation to stores table

#### TASK-002: Database Schema - Service Invoices

- **Status**: ⏳ Pending
- **Type**: Core
- **Complexity**: Low
- **Dependencies**: None
- **Parallelizable With**: TASK-001, TASK-002b
- **Files**:
  - Create: `src/services/db/schema/service-invoices.ts`
  - Create: `src/services/db/schema/service-invoices-relations.ts`
  - Modify: `src/services/db/schema/index.ts`
  - Modify: `src/services/db/schema/orders-relations.ts`
- **Implementation Notes**:
  - `type` enum: `NFCE` (extensible for `NFE` later)
  - `series` integer - copied from config at creation time
  - `invoice_number` integer - the number we control
  - `nfeio_invoice_id` text - returned from NFe.io after success
  - `status` enum: `pending | processing | issued | error | cancelled`
  - `customer_cpf` text nullable - for identified invoices
  - Link to `orders` table (one invoice per order)
  - Store PDF/XML URLs once issued
  - Include error tracking for failed emissions

#### TASK-002b: Database Schema - Auto-Emission Payment Methods

- **Status**: ⏳ Pending
- **Type**: Core
- **Complexity**: Low
- **Dependencies**: None
- **Parallelizable With**: TASK-001, TASK-002
- **Files**:
  - Create: `src/services/db/schema/store-auto-emission-payment-methods.ts`
  - Create: `src/services/db/schema/store-auto-emission-payment-methods-relations.ts`
  - Modify: `src/services/db/schema/index.ts`
- **Implementation Notes**:
  - Junction table: one row per (store_id, payment_method) combination
  - `payment_method` uses same enum as `order_payments.method`
  - No "enabled" boolean - row existence = enabled, delete = disabled
  - Unique constraint on (store_id, payment_method)
  - This is a POS feature, not strictly fiscal

#### TASK-003: Generate Database Migration

- **Status**: ⏳ Pending
- **Type**: Core
- **Complexity**: Low
- **Dependencies**: TASK-001, TASK-002, TASK-002b
- **Parallelizable With**: None
- **Files**:
  - Create: `supabase/migrations/XXXX_add_fiscal_and_invoice_tables.sql` (generated)
- **Implementation Notes**:
  - Run: `bunx --bun drizzle-kit generate --name add_fiscal_and_invoice_tables`
  - Review generated migration
  - No data migration needed (current legal_entities is placeholder)

#### TASK-004: NFe.io Service Layer

- **Status**: ⏳ Pending
- **Type**: Core
- **Complexity**: Medium
- **Dependencies**: None
- **Parallelizable With**: TASK-001, TASK-002, TASK-002b
- **Files**:
  - Create: `src/services/nfeio/index.ts`
  - Create: `src/services/nfeio/types.ts`
- **Implementation Notes**:
  - Install `nfe-io` package
  - Wrap SDK with typed client class
  - Methods: `createCompany`, `updateCompany`, `uploadCertificate`, `createNfce` (with explicit series + invoice number), `getInvoiceStatus`
  - `createNfce` must accept `series` and `invoiceNumber` as explicit parameters
  - Handle sandbox vs production environments
  - No business logic - just API communication

#### TASK-004b: Rename Encryption Key

- **Status**: ⏳ Pending
- **Type**: Core
- **Complexity**: Low
- **Dependencies**: None
- **Parallelizable With**: TASK-001, TASK-002, TASK-004
- **Files**:
  - Modify: `src/lib/encryption.ts`
  - Modify: `.env.example` (if exists)
- **Implementation Notes**:
  - Rename `IFOOD_TOKEN_ENCRYPTION_KEY` to `TOKEN_ENCRYPTION_KEY`
  - Update all references
  - Document in README/env example

#### TASK-005: Fiscal Feature - DB Layer

- **Status**: ⏳ Pending
- **Type**: Core
- **Complexity**: Medium
- **Dependencies**: TASK-001, TASK-002, TASK-002b, TASK-003
- **Parallelizable With**: TASK-004
- **Files**:
  - Create: `src/features/fiscal/db.ts`
  - Create: `src/features/fiscal/types.ts`
  - Create: `src/features/fiscal/cache-keys.ts`
- **Implementation Notes**:
  - Transaction-aware functions (`dbSession` parameter)
  - CRUD for `store_fiscal_configs`
  - CRUD for `service_invoices`
  - CRUD for `store_auto_emission_payment_methods`
  - **Critical**: `reserveNextInvoiceNumber` function with row locking:
    ```typescript
    async function reserveNextInvoiceNumber(
      storeId: number,
      orderId: number,
      customerCpf: string | null,
      dbSession: DbTransaction
    ) {
      // SELECT ... FOR UPDATE to lock the row
      // Get series and next_nfce_number from config
      // INSERT pending invoice with series, invoice_number, customer_cpf
      // UPDATE next_nfce_number in config
      // Return { invoiceId, series, invoiceNumber }
    }
    ```
  - Query helpers: `getFiscalConfigByStoreId`, `getInvoicesByOrderId`, `getAutoEmissionMethods`

#### TASK-006: Fiscal Feature - Server Actions (Company Management)

- **Status**: ⏳ Pending
- **Type**: Core
- **Complexity**: High
- **Dependencies**: TASK-004, TASK-004b, TASK-005
- **Parallelizable With**: None
- **Files**:
  - Create: `src/features/fiscal/api.ts`
- **Implementation Notes**:
  - `saveFiscalConfig`: Create/update store's fiscal configuration
  - `createNfeioCompany`: Register company on NFe.io and save company ID
  - `updateNfeioCompany`: Update company info on NFe.io
  - `uploadCertificate`: Upload .pfx certificate to NFe.io
  - All actions require `validateUserPermissionsForStore(storeId, 'admin')`
  - Encrypt API key before storing using renamed `TOKEN_ENCRYPTION_KEY`

#### TASK-007: Fiscal Feature - Server Actions (Invoice Generation)

- **Status**: ⏳ Pending
- **Type**: Core
- **Complexity**: High
- **Dependencies**: TASK-006
- **Parallelizable With**: None
- **Files**:
  - Modify: `src/features/fiscal/api.ts`
- **Implementation Notes**:
  - `generateNfce`: Create NFC-e for an order with number control
  - **Flow**:
    1. Start DB transaction
    2. Call `reserveNextInvoiceNumber` (locks row, creates pending invoice with customer_cpf)
    3. Commit transaction (invoice number is now reserved)
    4. Call NFe.io `createNfce` with explicit series + number + customer CPF
    5. On success: Update invoice status='issued', save PDF/XML URLs, nfeio_invoice_id
    6. On duplicate number error: Increment and retry (should be rare)
    7. On other error: Update invoice status='error', save error message
  - Map order data to NFe.io format
  - Handle errors gracefully (don't break order flow)

#### TASK-008: Integrate Invoice Generation into Order Creation

- **Status**: ⏳ Pending
- **Type**: Core
- **Complexity**: Medium
- **Dependencies**: TASK-007
- **Parallelizable With**: None
- **Files**:
  - Modify: `src/features/order/api.ts`
  - Modify: `src/features/order/types.ts` (add customerCpf to NewOrder)
- **Implementation Notes**:
  - Add optional `customerCpf` field to order creation
  - After order creation, check auto-emission payment methods table
  - If any order payment method matches enabled auto-emission methods, trigger NFC-e
  - Call `generateNfce` with order + customerCpf (non-blocking, catch errors)
  - Don't fail order creation if invoice generation fails
  - Return invoice status/ID with order response

#### TASK-009: Company Settings Form Component

- **Status**: ⏳ Pending
- **Type**: Core
- **Complexity**: Medium
- **Dependencies**: TASK-006
- **Parallelizable With**: TASK-010, TASK-011, TASK-012
- **Files**:
  - Rewrite: `src/features/legal-entity/components/company-settings.tsx` → `src/features/fiscal/components/company-settings-form.tsx`
  - Create: `src/features/fiscal/form-validation/company-schema.ts`
  - Create: `src/features/fiscal/hooks/use-fiscal-config.ts`
- **Implementation Notes**:
  - Replace placeholder with functional form
  - Use TanStack Form + Zod validation
  - CNPJ validation (format + check digit)
  - CEP auto-fill integration (fetch address from ViaCEP)
  - Save to `store_fiscal_configs` via server action

#### TASK-010: Fiscal Settings Form Component

- **Status**: ⏳ Pending
- **Type**: Core
- **Complexity**: Medium
- **Dependencies**: TASK-006
- **Parallelizable With**: TASK-009, TASK-011, TASK-012
- **Files**:
  - Rewrite: `src/features/legal-entity/components/legal-settings.tsx` → `src/features/fiscal/components/fiscal-settings-form.tsx`
  - Create: `src/features/fiscal/form-validation/fiscal-schema.ts`
- **Implementation Notes**:
  - Environment selector (sandbox/production)
  - Tax regime combobox
  - State registration (IE) input
  - CSC ID and code inputs
  - NFC-e series input (integer)
  - Starting invoice number (for initial setup only)
  - Accountant email (optional)
  - Save to `store_fiscal_configs`

#### TASK-011: Certificate Upload Component

- **Status**: ⏳ Pending
- **Type**: Core
- **Complexity**: Medium
- **Dependencies**: TASK-006
- **Parallelizable With**: TASK-009, TASK-010, TASK-012
- **Files**:
  - Create: `src/features/fiscal/components/certificate-upload.tsx`
- **Implementation Notes**:
  - File input for .pfx/.p12 certificate
  - Password input for certificate
  - Upload via server action to NFe.io
  - Show certificate status (valid until date, or not uploaded)
  - Certificate stored only on NFe.io, not in our DB
  - Use existing file upload patterns from `shared/file-upload.tsx`

#### TASK-012: Auto-Emission Configuration Component (POS Feature)

- **Status**: ⏳ Pending
- **Type**: Core
- **Complexity**: Low
- **Dependencies**: TASK-005
- **Parallelizable With**: TASK-009, TASK-010, TASK-011
- **Files**:
  - Create: `src/features/store/components/auto-emission-config.tsx` (or `features/pos/`)
  - Modify: `src/features/store/api.ts` (add auto-emission CRUD)
- **Implementation Notes**:
  - List of payment methods with toggle switches
  - Toggle ON = insert row in `store_auto_emission_payment_methods`
  - Toggle OFF = delete row
  - Use payment methods from `order/shared/payment-methods.tsx`
  - This is a POS/store feature, separate from fiscal settings

#### TASK-013: Update Settings Page to Use New Components

- **Status**: ⏳ Pending
- **Type**: Core
- **Complexity**: Low
- **Dependencies**: TASK-009, TASK-010, TASK-011, TASK-012
- **Parallelizable With**: None
- **Files**:
  - Modify: `src/app/(admin)/settings/[settingId]/page.tsx`
- **Implementation Notes**:
  - Import new fiscal components
  - Replace `CompanySettings` and `LegalSettings` imports
  - Add auto-emission to appropriate settings section (store or POS tab)
  - Optionally split into more tabs if needed

#### TASK-014: CPF Input at POS Checkout

- **Status**: ⏳ Pending
- **Type**: Core
- **Complexity**: Low
- **Dependencies**: TASK-008
- **Parallelizable With**: None
- **Files**:
  - Modify: POS checkout component (location TBD based on existing code)
- **Implementation Notes**:
  - Optional CPF input field at checkout
  - CPF validation (format + check digit)
  - Pass to order creation, then to invoice generation
  - Only show if store has fiscal config active

### Optional Tasks (Nice-to-Have Enhancements)

#### TASK-OPT-001: Invoice History View

- **Status**: ⏳ Pending
- **Type**: Optional
- **Complexity**: Medium
- **Dependencies**: TASK-007
- **Value Add**: View past invoices, download PDFs, check status
- **Files**:
  - Create: `src/features/fiscal/components/invoice-history.tsx`
  - Create: `src/features/fiscal/hooks/use-service-invoices.ts`
- **Implementation Notes**:
  - DataTable with invoice list
  - Show: invoice number, series, status, customer CPF, order link, date
  - Filter by date range, status
  - Download PDF/XML buttons
  - Link to order

#### TASK-OPT-002: Invoice Cancellation

- **Status**: ⏳ Pending
- **Type**: Optional
- **Complexity**: Medium
- **Dependencies**: TASK-OPT-001
- **Value Add**: Cancel issued invoices when needed (legal requirement within 24h)
- **Files**:
  - Modify: `src/features/fiscal/api.ts`
  - Modify: `src/services/nfeio/index.ts`
- **Implementation Notes**:
  - Add `cancelInvoice` method to service
  - Add `cancelNfce` server action
  - Update invoice status to 'cancelled'
  - Show cancellation button in invoice history

#### TASK-OPT-003: NFe.io API Key Setup Wizard

- **Status**: ⏳ Pending
- **Type**: Optional
- **Complexity**: Low
- **Dependencies**: TASK-009
- **Value Add**: Guide users through getting their NFe.io API key
- **Files**:
  - Create: `src/features/fiscal/components/api-key-setup-wizard.tsx`
- **Implementation Notes**:
  - Step-by-step instructions with screenshots
  - Link to NFe.io dashboard
  - Test API key connectivity before saving

#### TASK-OPT-004: Cleanup Legacy Tables

- **Status**: ⏳ Pending
- **Type**: Optional
- **Complexity**: Low
- **Dependencies**: All core tasks complete
- **Value Add**: Remove unused tables and code
- **Files**:
  - Delete: `src/services/db/schema/legal-entities.ts`
  - Delete: `src/services/db/schema/store-legal-entity.ts`
  - Delete: `src/features/legal-entity/` (entire folder)
  - Create migration to drop tables
- **Implementation Notes**:
  - Only after confirming no production data needs migration
  - Create migration: `drop_legacy_legal_entity_tables`

## Task Dependency Graph

```
Parallel Stream 1 (Database + Config):
TASK-001 (fiscal configs) ───┬── TASK-003 (migration) ── TASK-005 (db layer)
TASK-002 (invoices) ─────────┤
TASK-002b (auto-emission) ───┘
TASK-004b (rename encryption key) ─────────────────────────────┐
                                                                │
Parallel Stream 2 (Service):                                   │
TASK-004 (NFe.io service) ─────────────────────────────────────┤
                                                                │
Integration Point:                                              │
TASK-005 + TASK-004 + TASK-004b ── TASK-006 (company actions) ─┤
                                        │                       │
                                        v                       │
                                  TASK-007 (invoice actions) ───┤
                                        │                       │
                                        v                       │
                                  TASK-008 (order integration)  │
                                        │                       │
                                        v                       │
                                  TASK-014 (CPF at checkout)    │
                                                                │
Parallel Stream 3 (UI - after TASK-005/006):                   │
TASK-009 (company form) ────────┬                              │
TASK-010 (fiscal form) ─────────┼── TASK-013 (settings page)   │
TASK-011 (certificate upload) ──┤                              │
TASK-012 (auto-emission) ───────┘                              │

Optional (after core):
TASK-OPT-001 (invoice history) ── TASK-OPT-002 (cancellation)
TASK-OPT-003 (API key wizard)
TASK-OPT-004 (cleanup legacy)
```

## Implementation Guidelines

### Keep It Simple

- Use synchronous invoice generation (`createAndWait`) - async adds complexity
- Store-scoped everything - no shared entities across stores
- Denormalize company data in fiscal config (simpler than maintaining relations)
- Don't over-abstract the NFe.io service - it's a thin wrapper

### Invoice Number Control

- **Always reserve number BEFORE calling API** - prevents race conditions
- Use `SELECT ... FOR UPDATE` for row locking during reservation
- Invoice numbers should never have gaps in normal operation
- On API failure, the number is "burned" (status='error'), which is acceptable
- Series + Number together form the unique invoice identifier
- Store series in the invoice record at creation time (immutable)

### What NOT to Do

- Don't try to share legal entities across stores (the current broken approach)
- Don't implement batch processing or async queues - keep it simple
- Don't build a full invoice management system - just issue and track
- Don't add NF-e (B2B) support yet - focus on NFC-e (retail)
- Don't use JSONB for auto-emission rules - use proper relational table
- Don't store certificate in our DB - only on NFe.io

### Testing Strategy

**Manual Testing Checklist:**

- [ ] Create fiscal config for a store
- [ ] Register company on NFe.io (sandbox)
- [ ] Upload test certificate
- [ ] Enable auto-emission for PIX payment method
- [ ] Create order with PIX payment (with customer CPF)
- [ ] Verify invoice created with correct number and series
- [ ] Verify customer CPF appears on invoice
- [ ] Verify invoice appears in NFe.io dashboard
- [ ] Verify PDF/XML URLs work
- [ ] Create second order - verify invoice number incremented
- [ ] Test with two stores using same CNPJ (should be independent)
- [ ] Test concurrent order creation (race condition prevention)
- [ ] Test order without CPF (anonymous invoice)

### Rollout Considerations

**Database Migrations:**

- New tables only (no data migration needed)
- Legacy tables can remain until cleanup task

**Environment Variables:**

- Rename `IFOOD_TOKEN_ENCRYPTION_KEY` to `TOKEN_ENCRYPTION_KEY`
- Update deployment configs accordingly

**Feature Flags:**

- Not needed - feature only activates when store has fiscal config

## Progress Tracking

| Task ID      | Title                                  | Type     | Status     | Started | Completed | Notes |
| ------------ | -------------------------------------- | -------- | ---------- | ------- | --------- | ----- |
| TASK-001     | Store Fiscal Configs Schema            | Core     | ⏳ Pending | -       | -         | -     |
| TASK-002     | Service Invoices Schema                | Core     | ⏳ Pending | -       | -         | -     |
| TASK-002b    | Auto-Emission Payment Methods Schema   | Core     | ⏳ Pending | -       | -         | -     |
| TASK-003     | Generate Migration                     | Core     | ⏳ Pending | -       | -         | -     |
| TASK-004     | NFe.io Service Layer                   | Core     | ⏳ Pending | -       | -         | -     |
| TASK-004b    | Rename Encryption Key                  | Core     | ⏳ Pending | -       | -         | -     |
| TASK-005     | Fiscal DB Layer                        | Core     | ⏳ Pending | -       | -         | -     |
| TASK-006     | Company Management Actions             | Core     | ⏳ Pending | -       | -         | -     |
| TASK-007     | Invoice Generation Actions             | Core     | ⏳ Pending | -       | -         | -     |
| TASK-008     | Order Integration                      | Core     | ⏳ Pending | -       | -         | -     |
| TASK-009     | Company Settings Form                  | Core     | ⏳ Pending | -       | -         | -     |
| TASK-010     | Fiscal Settings Form                   | Core     | ⏳ Pending | -       | -         | -     |
| TASK-011     | Certificate Upload                     | Core     | ⏳ Pending | -       | -         | -     |
| TASK-012     | Auto-Emission Config (POS)             | Core     | ⏳ Pending | -       | -         | -     |
| TASK-013     | Update Settings Page                   | Core     | ⏳ Pending | -       | -         | -     |
| TASK-014     | CPF Input at POS Checkout              | Core     | ⏳ Pending | -       | -         | -     |
| TASK-OPT-001 | Invoice History View                   | Optional | ⏳ Pending | -       | -         | -     |
| TASK-OPT-002 | Invoice Cancellation                   | Optional | ⏳ Pending | -       | -         | -     |
| TASK-OPT-003 | API Key Setup Wizard                   | Optional | ⏳ Pending | -       | -         | -     |
| TASK-OPT-004 | Cleanup Legacy Tables                  | Optional | ⏳ Pending | -       | -         | -     |

## Decisions Made

- [x] Rename `IFOOD_TOKEN_ENCRYPTION_KEY` to generic `TOKEN_ENCRYPTION_KEY`
- [x] Support optional customer CPF input at POS checkout
- [x] Certificate stored only on NFe.io, not in our DB
- [x] Auto-emission as junction table (not JSONB)
- [x] Invoice type enum starting with NFCE
- [x] Series and invoice number controlled by us, sent explicitly to NFe.io

## Notes & Learnings

_(Space for capturing insights during implementation)_
