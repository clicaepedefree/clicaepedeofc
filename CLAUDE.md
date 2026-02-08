# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Development Commands

```bash
# Development (uses Turbopack)
bun dev

# Production build
bun run build

# Linting
bun run lint

# Database
bun run db                      # Opens Drizzle Studio
bunx --bun drizzle-kit generate --name <descriptive_name> # Generate migration (ALWAYS use --name with a descriptive snake_case name, e.g. "add_option_groups_tables")
bunx --bun drizzle-kit migrate  # Run migrations
```

## Architecture Overview

This is a **Clica Pedidos POS system** built with Next.js 15 (App Router), React 19, and PostgreSQL via Drizzle ORM.

### Project Structure

```
src/
├── app/                    # Next.js App Router
│   ├── (admin)/           # Protected admin routes (dashboard, menu, pos, settings)
│   ├── (user-auth-pages)/ # Auth pages (login, onboarding)
│   └── api/               # Minimal API routes (webhooks, file uploads only)
├── features/              # Domain modules (self-contained)
│   └── [feature]/
│       ├── api.ts         # Server Actions (business logic + auth)
│       ├── db.ts          # Database queries (pure DB operations)
│       ├── types.ts       # TypeScript types
│       ├── cache-keys.ts  # React Query cache keys
│       ├── state.ts       # Jotai atoms (client state)
│       ├── hooks/         # Custom React hooks
│       ├── components/    # Feature UI components
│       └── form-validation/ # Zod schemas
├── services/              # Infrastructure layer
│   ├── db/schema/         # Drizzle table definitions (36 files)
│   ├── auth/              # Clerk auth utilities
│   └── [service]/         # Third-party integrations (ifood, files-manager)
├── shared/                # Reusable UI components and utilities
└── lib/                   # Core utilities (encryption, etc.)
```

### Data Flow Pattern

**Server Actions** (not REST) are the primary API layer:

```
Feature Hook (useMenu) → useQuery → Server Action (api.ts) → DB Query (db.ts) → Drizzle → PostgreSQL
```

All mutations follow this pattern:
1. Permission check first (`validateUserPermissionsForStore`)
2. Use `db.transaction()` for multi-step operations
3. DB functions accept `dbSession` parameter for transaction support

### State Management

- **Server state**: TanStack Query (staleTime: 60s, retry: max 2)
- **Client state**: Jotai atoms (e.g., `selectedStoreIdAtom`)
- **Persistent client state**: `atomWithStorage` for localStorage

### Key Patterns

**Server Action structure** (`features/*/api.ts`):
```typescript
'use server'

export const createItem = async (data: NewItem) => {
  await validateUserPermissionsForStore(data.storeId, 'admin')  // Always first

  return await db.transaction(async tx => {
    // Use tx (dbSession) for all operations
  })
}
```

**DB functions** (`features/*/db.ts`) are transaction-aware:
```typescript
type DbSession = typeof db | DbTransaction

export const createItemOnDb = async ({ item, dbSession }: { item: InsertItem; dbSession: DbSession }) => {
  return await dbSession.insert(itemsTable).values(item).returning()
}
```

**Cache key convention** (`cache-keys.ts`):
```typescript
export const menuCacheKey = (storeId: number | null, menuName?: string) =>
  menuName ? ['stores', storeId, 'menus', menuName] : ['stores', storeId, 'menus']
```

### Authentication Layers

1. **Middleware** (`middleware.ts`): Clerk route protection
2. **Auth service** (`services/auth`): `requireAuth()`, `getAuthenticatedUser()`
3. **Permission checks**: `validateUserPermissionsForStore(storeId, role)` in every server action

### Third-Party Integrations Pattern

Services (`/services/[name]/`) handle ONLY API communication. Features (`/features/[name]/`) contain all business logic:

```
services/ifood/  → API client, OAuth, response parsing (NO business logic)
features/ifood/  → Matching rules, DB ops, server actions, UI components
```

Tokens are encrypted with AES-256-GCM before storage. Generate encryption key: `openssl rand -hex 32`

### Database Schema

All tables in `src/services/db/schema/`. Key tables:
- `stores`, `users`, `user_store_permissions` (multi-tenant RBAC)
- `categories`, `items`, `item_offerings` (menu hierarchy)
- `orders`, `order_items`, `order_payments` (transactions)
- `ifood_integrations` (encrypted OAuth tokens)

Types are inferred from schema:
```typescript
export type InsertItem = Omit<typeof itemsTable.$inferInsert, 'createdAt' | 'updatedAt'>
export type SelectItem = typeof itemsTable.$inferSelect
```

### UI Stack

- **Components**: Radix UI primitives + Tailwind CSS v4
- **Forms**: TanStack Form + Zod validation
- **Toasts**: Sonner via `dispatchToast({ message, type })`
- **Path alias**: `@/*` → `./src/*`

### Code Style

- Prettier: no semicolons, single quotes, trailing comma es5
- Forms validate on submit with Zod schemas
- Error classes: `AuthError`, `PermissionsError`, `UseCaseError`
