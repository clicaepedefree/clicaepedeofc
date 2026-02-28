# Clica Pedidos

A modern, multi-tenant Point of Sale (POS) system for restaurants and retail businesses built with Next.js 15, React 19, and PostgreSQL.

## Features

- **Menu Management** - Create and organize categories, items, and option groups
- **Order Processing** - Full POS terminal for creating and managing orders
- **Fiscal Compliance** - NFe (Brazilian electronic invoice) integration
- **iFood Integration** - Connect with iFood marketplace for menu syncing and order management
- **Reports & Analytics** - Sales reports with charts and filtering
- **Multi-tenant** - Multiple stores with role-based access control
- **Receipt Printing** - Customizable receipt templates

## Tech Stack

| Layer | Technologies |
|-------|-------------|
| **Frontend** | Next.js 15.5 (App Router), React 19, TypeScript |
| **Styling** | Tailwind CSS 4, Radix UI, CVA |
| **State** | Jotai (client), TanStack React Query (server) |
| **Forms** | TanStack React Form, Zod validation |
| **Backend** | Next.js Server Actions, Drizzle ORM |
| **Database** | PostgreSQL (Supabase) |
| **Auth** | Clerk |
| **Package Manager** | Bun |

## Prerequisites

- [Bun](https://bun.sh) runtime
- PostgreSQL database (Supabase recommended)
- [Clerk](https://clerk.dev) account for authentication
- iFood API credentials (for iFood integration)

## Getting Started

### 1. Clone and install

```bash
git clone <repository-url>
cd clica_pedidos_app
```

### 2. Set up environment variables

Create a `.env.local` file with:

```env
POSTGRES_URL=postgresql://...
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_...
CLERK_SECRET_KEY=sk_...
NEXT_PUBLIC_IFOOD_CLIENT_ID=...
IFOOD_CLIENT_SECRET=...
ENCRYPTION_KEY=...
UPLOADTHING_TOKEN=...
```

### 3. Run the setup script

```bash
./init.sh
```

This will:
- Install dependencies with Bun
- Generate and apply database migrations
- Start the development server at http://localhost:3000

### Alternative: Manual setup

```bash
bun install
bunx --bun drizzle-kit generate
bunx --bun drizzle-kit migrate
bun run dev
```

## Project Structure

```
src/
├── app/                    # Next.js App Router
│   ├── (admin)/           # Admin layout (dashboard, menu, POS, settings)
│   ├── (user-auth-pages)/ # Auth pages
│   └── api/               # API routes (cron jobs, webhooks)
├── features/              # Feature-based modules
│   ├── ifood/             # iFood integration (OAuth, menu sync, mapping)
│   ├── menu/              # Menu and category management
│   ├── order/             # Order creation and management
│   ├── pos/               # Point of sale terminal
│   ├── fiscal/            # NFe fiscal invoicing
│   ├── reports/           # Sales analytics
│   ├── store/             # Store configuration
│   └── ...                # Other feature modules
├── services/              # Shared services
│   ├── db/                # Database (Drizzle ORM schema, connection)
│   ├── ifood/             # iFood API client
│   └── auth/              # Auth utilities
├── shared/                # Shared UI components (Radix-based)
└── lib/                   # Utilities (encryption, helpers)
```

### Feature Module Pattern

Each feature follows a consistent structure:

```
features/[feature]/
├── api.ts              # Server actions (mutations + business logic)
├── db.ts               # Database queries (pure DB operations)
├── types.ts            # TypeScript types
├── cache-keys.ts       # React Query cache key factories
├── state.ts            # Jotai atoms (client state)
├── hooks/              # Custom React hooks
├── components/         # Feature-specific UI components
└── form-validation/    # Zod schemas
```

### Three-Layer Backend Pattern

1. **Schema** (`services/db/schema/`) - Drizzle table definitions
2. **DB Functions** (`feature/db.ts`) - Pure database operations
3. **Server Actions** (`feature/api.ts`) - Authorization, business logic, transactions

## Development

```bash
# Start dev server
bun run dev

# Build for production
bun run build

# Start production server
bun run start

# Open Drizzle Studio (database GUI)
bun run db

# Lint
bun run lint
```

## Current Development: iFood Connection Flow Improvements

The current development focus is improving the iFood integration connection flow:
- Moving OAuth from separate pages to a multi-step modal
- Adding merchant catalog selection
- Securing OAuth tokens server-side (AES-256-GCM)
- Cleaning up the connected state UI

See `.autoforge/prompts/app_spec.txt` for the full specification.
