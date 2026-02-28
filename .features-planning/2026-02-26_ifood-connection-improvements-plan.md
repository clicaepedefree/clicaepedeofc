# Feature: iFood Connection Flow Improvements

**Created**: 2026-02-26
**Status**: Planning
**Owner**: -

## Feature Overview

### Goal

Improve the iFood integration experience by:
1. Moving the connection flow from separate pages to a single multi-step modal
2. Adding merchant menu/catalog selection as part of the connection flow
3. Ensuring tokens are never exposed to the frontend (security)
4. Cleaning up the connected state UI card

### User Value

- Smoother, more intuitive connection flow without page navigation
- Better security by keeping OAuth tokens server-side only
- Clear menu selection prevents connecting to the wrong catalog
- Cleaner UI when integration is active

### Scope

**Included:**
- New multi-step connection modal component
- Server-side OAuth session management (temporary state storage in DB)
- Merchant catalogs/menus listing API
- Catalog selection step in flow
- Updated database schema to store selected catalog ID
- Redesigned connected state card UI
- Cleanup of deprecated separate pages

**Excluded:**
- Menu mapping changes (existing flow is fine)
- Changes to token refresh logic
- PDV code sync changes

## Architecture Alignment

### Patterns to Follow

1. **Server Actions for API calls** - All iFood API communication via server actions in `features/ifood/api.ts`
2. **Dialog component for modal** - Use existing `@/shared/dialog` Radix primitives
3. **Multi-step state in component** - Use local useState for step management
4. **Permission validation** - All server actions start with `validateUserPermissionsForStore`
5. **DB functions with dbSession** - Transaction-aware DB functions in `features/ifood/db.ts`
6. **Encrypted token storage** - Use existing `encrypt()`/`decrypt()` from `@/lib/encryption`

### Technologies/Frameworks Used

- React Dialog (Radix UI) for modal
- TanStack Query for server state
- Server Actions for API layer
- Drizzle ORM for database operations

### Code Organization

- `src/features/ifood/components/ifood-connection-modal.tsx` - New multi-step modal
- `src/features/ifood/api.ts` - Extended with new server actions
- `src/features/ifood/db.ts` - Extended with session management
- `src/services/ifood/index.ts` - Extended with catalog listing
- `src/services/db/schema/ifood-integrations.ts` - Add catalogId field
- `src/services/db/schema/ifood-oauth-sessions.ts` - New table for temp session storage

## Implementation Tasks

### Core Tasks (Required for MVP)

#### TASK-001: Add OAuth Session Storage Table

- **Status**: ⏳ Pending
- **Type**: Core
- **Complexity**: Low
- **Dependencies**: None
- **Parallelizable With**: TASK-002, TASK-003
- **Files**:
  - Create: `src/services/db/schema/ifood-oauth-sessions.ts`
  - Modify: `src/services/db/schema/index.ts`
- **Implementation Notes**:
  - Store: `id`, `storeId`, `userCode`, `authorizationCodeVerifier`, `accessToken` (encrypted), `refreshToken` (encrypted), `expiresAt`, `createdAt`
  - Short-lived (10 min TTL) - use for OAuth flow only
  - Tokens stored encrypted, never sent to frontend
  - Delete session after successful connection

#### TASK-002: Add Catalog ID to Integration Schema

- **Status**: ⏳ Pending
- **Type**: Core
- **Complexity**: Low
- **Dependencies**: None
- **Parallelizable With**: TASK-001, TASK-003
- **Files**:
  - Modify: `src/services/db/schema/ifood-integrations.ts`
- **Implementation Notes**:
  - Add `catalogId` (text, nullable for backwards compat)
  - Add `catalogName` (text, nullable) for display purposes
  - Generate migration with descriptive name

#### TASK-003: Add Merchant Catalogs API to IFoodService

- **Status**: ⏳ Pending
- **Type**: Core
- **Complexity**: Low
- **Dependencies**: None
- **Parallelizable With**: TASK-001, TASK-002
- **Files**:
  - Modify: `src/services/ifood/index.ts`
  - Modify: `src/services/ifood/types.ts`
- **Implementation Notes**:
  - Add `getMerchantCatalogs(merchantId)` method
  - Endpoint: `/catalog/v2.0/merchants/{merchantId}/catalogs`
  - Returns array of `{ id, name, status, type }`
  - Add types for catalog response

#### TASK-004: Generate Database Migration

- **Status**: ⏳ Pending
- **Type**: Core
- **Complexity**: Low
- **Dependencies**: TASK-001, TASK-002
- **Parallelizable With**: None
- **Files**:
  - Create: `supabase/migrations/XXXX_add_ifood_oauth_sessions_and_catalog.sql`
- **Implementation Notes**:
  - Run: `bunx --bun drizzle-kit generate --name add_ifood_oauth_sessions_and_catalog`
  - Run: `bunx --bun drizzle-kit migrate`

#### TASK-005: Create Server-Side OAuth Session Management

- **Status**: ⏳ Pending
- **Type**: Core
- **Complexity**: Medium
- **Dependencies**: TASK-004
- **Parallelizable With**: TASK-006
- **Files**:
  - Modify: `src/features/ifood/db.ts`
  - Modify: `src/features/ifood/api.ts`
- **Implementation Notes**:
  - Add DB functions: `createOAuthSession`, `getOAuthSession`, `updateOAuthSession`, `deleteOAuthSession`
  - Server action: `initiateIFoodOAuth(storeId)` - creates session, returns userCode and verificationUrl (no verifier to client)
  - Server action: `exchangeIFoodCode(storeId, authorizationCode)` - exchanges code, stores tokens in session, returns merchants list
  - Server action: `getMerchantCatalogs(storeId, merchantId)` - gets catalogs using stored tokens
  - Server action: `completeIFoodConnection(storeId, merchantId, catalogId, catalogName)` - finalizes connection, deletes session
  - Never return tokens to client

#### TASK-006: Update Integration DB Functions

- **Status**: ⏳ Pending
- **Type**: Core
- **Complexity**: Low
- **Dependencies**: TASK-004
- **Parallelizable With**: TASK-005
- **Files**:
  - Modify: `src/features/ifood/db.ts`
- **Implementation Notes**:
  - Update `createIFoodIntegration` to accept catalogId and catalogName
  - Update `updateIFoodIntegration` to handle catalogId field
  - Use tokens from OAuth session during connection completion

#### TASK-007: Create Multi-Step Connection Modal Component

- **Status**: ⏳ Pending
- **Type**: Core
- **Complexity**: High
- **Dependencies**: TASK-005, TASK-006
- **Parallelizable With**: None
- **Files**:
  - Create: `src/features/ifood/components/ifood-connection-modal.tsx`
- **Implementation Notes**:
  - Use Dialog from `@/shared/dialog`
  - Step 1: Show userCode, copy button, "Open iFood Portal" button, input for authorization code
  - Step 2: Merchant selection (radio buttons)
  - Step 3: Catalog/menu selection (radio buttons)
  - Step 4: Confirmation and success
  - Handle loading states and errors
  - Call server actions at each step
  - Close modal on success and trigger connection refresh

#### TASK-008: Update IFoodConnectionCard to Use Modal

- **Status**: ⏳ Pending
- **Type**: Core
- **Complexity**: Medium
- **Dependencies**: TASK-007
- **Parallelizable With**: TASK-009
- **Files**:
  - Modify: `src/features/ifood/components/ifood-connection-card.tsx`
- **Implementation Notes**:
  - Replace `handleConnect` router.push with modal open
  - Keep disconnect functionality
  - Keep manage menu button
  - Trigger modal from "Conectar" button

#### TASK-009: Redesign Connected State UI

- **Status**: ⏳ Pending
- **Type**: Core
- **Complexity**: Low
- **Dependencies**: TASK-007
- **Parallelizable With**: TASK-008
- **Files**:
  - Modify: `src/features/ifood/components/ifood-connection-card.tsx`
- **Implementation Notes**:
  - Remove merchantId display (internal detail)
  - Remove lastSyncAt display (not useful)
  - Show: Connection status badge, merchant name (if available), catalog name
  - Keep actions: "Gerenciar Cardápio", "Desconectar"
  - Clean, minimal design

#### TASK-010: Deprecate Old API Routes

- **Status**: ⏳ Pending
- **Type**: Core
- **Complexity**: Low
- **Dependencies**: TASK-008
- **Parallelizable With**: TASK-011
- **Files**:
  - Delete: `src/app/api/integrations/ifood/initiate/route.ts`
  - Delete: `src/app/api/integrations/ifood/exchange-token/route.ts`
  - Delete: `src/app/api/integrations/ifood/connect/route.ts`
- **Implementation Notes**:
  - All functionality moved to server actions
  - Can delete after TASK-008 is verified working

#### TASK-011: Deprecate Old Pages

- **Status**: ⏳ Pending
- **Type**: Core
- **Complexity**: Low
- **Dependencies**: TASK-008
- **Parallelizable With**: TASK-010
- **Files**:
  - Delete: `src/app/(admin)/settings/integracoes/ifood/authorize/page.tsx`
- **Implementation Notes**:
  - This page is replaced by modal
  - setup page stays (used for menu mapping)

#### TASK-012: Fix Hardcoded Catalog ID in getMerchantMenu

- **Status**: ⏳ Pending
- **Type**: Core
- **Complexity**: Low
- **Dependencies**: TASK-006
- **Parallelizable With**: TASK-007, TASK-008, TASK-009
- **Files**:
  - Modify: `src/services/ifood/index.ts`
  - Modify: `src/features/ifood/api.ts`
- **Implementation Notes**:
  - Update `getMerchantMenu(merchantId, catalogId)` to accept catalogId parameter
  - Update `fetchIFoodMenu` server action to read catalogId from integration record
  - Remove hardcoded `ffca0022-eb43-4205-9a1b-73a72f8e3f95`

### Optional Tasks (Nice-to-Have Enhancements)

#### TASK-OPT-001: Add Merchant Name to Integration Record

- **Status**: ⏳ Pending
- **Type**: Optional
- **Complexity**: Low
- **Dependencies**: TASK-005
- **Value Add**: Display merchant name in connected card instead of just status
- **Files**:
  - Modify: `src/services/db/schema/ifood-integrations.ts`
  - Modify: `src/features/ifood/api.ts`
- **Implementation Notes**:
  - Add `merchantName` field
  - Store during connection completion
  - Display in card UI

#### TASK-OPT-002: Add Session Cleanup Cron Job

- **Status**: ⏳ Pending
- **Type**: Optional
- **Complexity**: Medium
- **Dependencies**: TASK-005
- **Value Add**: Automatically clean up expired OAuth sessions
- **Files**:
  - Create: `src/app/api/cron/cleanup-ifood-sessions/route.ts`
- **Implementation Notes**:
  - Delete sessions older than 10 minutes
  - Run via Vercel Cron or similar
  - Not critical - sessions are small and don't cause issues

## Task Dependency Graph

```
Parallel Stream 1 (Schema):
├─ TASK-001 (OAuth session table) ─┐
├─ TASK-002 (Catalog ID field)    ─┼─→ TASK-004 (Migration)
└─ TASK-003 (Catalogs API)         │
                                   │
                                   ↓
Parallel Stream 2 (Backend):       │
├─ TASK-005 (OAuth session mgmt) ──┼─→ TASK-007 (Modal) ─→ TASK-008 (Card update) ─┬─→ TASK-010 (Delete routes)
├─ TASK-006 (Integration DB)      ─┘                                               ├─→ TASK-011 (Delete pages)
└─ TASK-012 (Fix hardcoded ID) ────────────────────────────────────────────────────┘
                                                          ↓
                                              TASK-009 (Redesign UI)

Optional (after core):
├─ TASK-OPT-001 (Merchant name)
└─ TASK-OPT-002 (Session cleanup)
```

## Implementation Guidelines

### Keep It Simple

- Single modal with step state (no complex state machine)
- Steps rendered conditionally based on `currentStep` number
- No animation library - use CSS transitions if needed
- Error handling shows inline error message, allows retry

### Security Requirements

1. **Never return tokens to frontend** - tokens stay in OAuth session table
2. **Encrypt tokens at rest** - use existing `encrypt()` function
3. **Short session TTL** - OAuth sessions expire in 10 minutes
4. **Delete sessions on completion** - no orphaned token data
5. **All auth checks** - every server action validates permissions

### Testing Strategy

- Manual testing: full connection flow with real iFood account
- Verify tokens never appear in network tab
- Verify old pages/routes return 404 after deletion
- Test edge cases: session expiry, multiple merchants, no catalogs

### Rollout Considerations

- Database migration adds new table and field (backwards compatible)
- Existing integrations will have null catalogId
- Old pages can be removed after modal is verified working
- No feature flags needed - direct replacement

## Progress Tracking

| Task ID      | Title                           | Type     | Status     | Started | Completed | Notes |
| ------------ | ------------------------------- | -------- | ---------- | ------- | --------- | ----- |
| TASK-001     | OAuth Session Table             | Core     | ⏳ Pending | -       | -         | -     |
| TASK-002     | Catalog ID Field                | Core     | ⏳ Pending | -       | -         | -     |
| TASK-003     | Merchant Catalogs API           | Core     | ⏳ Pending | -       | -         | -     |
| TASK-004     | Database Migration              | Core     | ⏳ Pending | -       | -         | -     |
| TASK-005     | OAuth Session Management        | Core     | ⏳ Pending | -       | -         | -     |
| TASK-006     | Update Integration DB           | Core     | ⏳ Pending | -       | -         | -     |
| TASK-007     | Multi-Step Connection Modal     | Core     | ⏳ Pending | -       | -         | -     |
| TASK-008     | Update Card to Use Modal        | Core     | ⏳ Pending | -       | -         | -     |
| TASK-009     | Redesign Connected UI           | Core     | ⏳ Pending | -       | -         | -     |
| TASK-010     | Delete Old API Routes           | Core     | ⏳ Pending | -       | -         | -     |
| TASK-011     | Delete Old Pages                | Core     | ⏳ Pending | -       | -         | -     |
| TASK-012     | Fix Hardcoded Catalog ID        | Core     | ⏳ Pending | -       | -         | -     |
| TASK-OPT-001 | Add Merchant Name               | Optional | ⏳ Pending | -       | -         | -     |
| TASK-OPT-002 | Session Cleanup Cron            | Optional | ⏳ Pending | -       | -         | -     |

## Open Questions

- [ ] Should we store the OAuth session in the database or use Redis/memory? (Plan assumes DB for simplicity)
- [ ] What should happen if user already has a connection and tries to connect again? (Probably disconnect first or update)
- [ ] Should the menu mapping step be part of the connection modal or keep it separate? (Plan keeps it separate for simplicity)

## Notes & Learnings

- Current implementation returns tokens to frontend in `/api/integrations/ifood/exchange-token` - this is the main security issue
- The hardcoded catalog ID `ffca0022-eb43-4205-9a1b-73a72f8e3f95` in `getMerchantMenu` needs to be dynamic
- iFood API structure: authenticate → get merchants → get catalogs per merchant → get items per catalog
