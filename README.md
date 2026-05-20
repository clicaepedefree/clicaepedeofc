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
- Node.js 22.17.1 or newer
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

Copy the example environment file and fill in your values:

```bash
cp .env.example .env.local
```

**Required variables:**

```env
# Database
POSTGRES_URL=postgresql://...

# Authentication (Clerk)
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_...
CLERK_SECRET_KEY=sk_...

# Supabase Storage
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=...
```

**Domain configuration (optional - defaults work for local dev):**

```env
# Main application domain (default: localhost)
NEXT_PUBLIC_APP_DOMAIN=localhost

# Admin subdomain prefix (default: admin)
NEXT_PUBLIC_ADMIN_SUBDOMAIN=admin
```

**For production, set these to your actual domain:**

```env
NEXT_PUBLIC_APP_DOMAIN=clicapedidos.com.br
NEXT_PUBLIC_ADMIN_SUBDOMAIN=admin
# Results in admin panel at: https://admin.clicapedidos.com.br
```

See `.env.example` for a complete list of all available variables.

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

### Routing and Access Methods

The app supports both **path-based** and **subdomain-based** routing. Both methods are fully functional and can be used interchangeably:

**Path-based routing (default):**
- `http://localhost:3000/dashboard` - Dashboard
- `http://localhost:3000/pos` - Point of Sale
- `http://localhost:3000/menu` - Menu Management
- `http://localhost:3000/settings` - Settings

**Subdomain-based routing:**
- `http://admin.localhost:3000/dashboard` - Dashboard (admin subdomain)
- `http://admin.localhost:3000/pos` - Point of Sale (admin subdomain)

Both access methods work identically:
- Authentication via Clerk works on both
- All routes remain functional
- Session persists across both methods
- The subdomain context is detected automatically for conditional rendering

**Route Domain Separation:**

Some routes are only served from the main domain and will redirect if accessed from the admin subdomain:

| Route | Domain | Description |
|-------|--------|-------------|
| `/login` | Main only | Authentication pages |
| `/admin-onboarding` | Main only | Onboarding flow |
| `/unauthorized` | Main only | Access denied page |
| `/` | Main only | Public landing page |
| `/dashboard` | Both | Admin dashboard |
| `/pos` | Both | Point of Sale |
| `/menu` | Both | Menu management |
| `/settings` | Both | Store settings |
| `/reports` | Both | Sales reports |
| `/invoices` | Both | Invoice management |

Non-admin routes accessed via `admin.localhost:3000` will automatically redirect to `localhost:3000`.

Modern browsers (Chrome 73+, Firefox, Safari) automatically resolve `*.localhost` to `127.0.0.1`, so no hosts file configuration is needed for subdomain testing.

**Troubleshooting:**

If `admin.localhost` doesn't resolve in your browser, add this to your hosts file:

```bash
# macOS/Linux: /etc/hosts
# Windows: C:\Windows\System32\drivers\etc\hosts
127.0.0.1 admin.localhost
```

**How it works:**

The middleware (`src/middleware.ts`) detects subdomain context from the request hostname and sets an `x-subdomain-context` header. Components can read this via `getSubdomainContext()` from `@/shared/lib/subdomain`.

Supported hostname formats:
- `admin.localhost:3000` (development)
- `admin.127.0.0.1:3000` (alternative)
- `admin.yourdomain.com` (production)

## Production Deployment

This section covers deploying Clica Pedidos with subdomain routing to production.

### Environment Variables for Production

Set these environment variables in your hosting platform:

```env
# Required - Domain Configuration
NEXT_PUBLIC_APP_DOMAIN=clicapedidos.com.br
NEXT_PUBLIC_ADMIN_SUBDOMAIN=admin

# Required - Database
POSTGRES_URL=postgresql://user:pass@host:5432/database

# Required - Authentication (Clerk)
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_xxx
CLERK_SECRET_KEY=sk_live_xxx

# Required - Supabase Storage
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=xxx

# iFood Integration (if enabled)
NEXT_PUBLIC_IFOOD_CLIENT_ID=xxx
IFOOD_CLIENT_SECRET=xxx
IFOOD_REDIRECT_URI=https://clicapedidos.com.br/api/integrations/ifood/callback
IFOOD_TOKEN_ENCRYPTION_KEY=xxx

# NFe Integration (if enabled)
NFE_IO_API_KEY=xxx
```

### DNS Configuration

Configure DNS records for both your main domain and admin subdomain:

| Type | Host | Value | TTL |
|------|------|-------|-----|
| A/CNAME | @ | Your hosting IP/domain | 300 |
| A/CNAME | admin | Your hosting IP/domain | 300 |

**Example for Vercel:**

```
# Main domain
CNAME @ cname.vercel-dns.com

# Admin subdomain
CNAME admin cname.vercel-dns.com
```

**Example for self-hosted (with IP 203.0.113.10):**

```
A @ 203.0.113.10
A admin 203.0.113.10
```

### Vercel Deployment

#### 1. Connect Repository

Link your GitHub/GitLab repository to Vercel.

#### 2. Configure Domains

In Project Settings > Domains, add both:
- `clicapedidos.com.br` (main domain)
- `admin.clicapedidos.com.br` (admin subdomain)

Both domains should point to the same Vercel project.

#### 3. Environment Variables

In Project Settings > Environment Variables, add all required variables.

**Important:** Use different values for Preview vs Production:
- `NEXT_PUBLIC_APP_DOMAIN=preview-xxx.vercel.app` (Preview)
- `NEXT_PUBLIC_APP_DOMAIN=clicapedidos.com.br` (Production)

#### 4. Wildcard Domain (Optional)

For multi-tenant subdomain support (e.g., `store1.clicapedidos.com.br`):

1. Add `*.clicapedidos.com.br` to Vercel domains
2. Configure DNS:
   ```
   CNAME * cname.vercel-dns.com
   ```

### Clerk Configuration

Configure Clerk to work with subdomains:

#### 1. Add Domains in Clerk Dashboard

Go to Clerk Dashboard > Domains and add:
- `clicapedidos.com.br`
- `admin.clicapedidos.com.br`

#### 2. Configure Cookie Settings

In Clerk Dashboard > Sessions, set:
- **Session token cookie domain:** `.clicapedidos.com.br` (note the leading dot)

This allows session cookies to be shared across subdomains.

#### 3. Redirect URLs

Configure redirect URLs in Clerk Dashboard > Paths:
- Sign-in URL: `/login`
- After sign-in: `/dashboard`
- After sign-up: `/admin-onboarding`

### Other Hosting Platforms

#### AWS Amplify

1. Configure domains in Amplify Console > Domain Management
2. Add both main domain and admin subdomain
3. Set environment variables in App Settings > Environment Variables

#### Railway

1. Configure custom domains in Settings > Domains
2. Add both domains pointing to the same service
3. Set environment variables in Variables tab

#### DigitalOcean App Platform

1. Add domains in Settings > Domains
2. Configure both main and admin subdomain
3. Set environment variables in App-Level Environment Variables

### SSL/TLS Certificates

Most platforms (Vercel, Railway, etc.) automatically provision SSL certificates for custom domains. If self-hosting:

1. Use Let's Encrypt with certbot
2. Generate certificates for both domains:
   ```bash
   certbot --nginx -d clicapedidos.com.br -d admin.clicapedidos.com.br
   ```
3. Or use a wildcard certificate:
   ```bash
   certbot --nginx -d clicapedidos.com.br -d *.clicapedidos.com.br
   ```

### Deployment Troubleshooting

#### Admin subdomain redirects to main domain login

**Cause:** Clerk cookies not shared across subdomains.

**Solution:** Ensure cookie domain in Clerk is set to `.yourdomain.com` (with leading dot).

#### CORS errors when calling API from admin subdomain

**Cause:** CORS headers not configured correctly.

**Solution:** Verify `NEXT_PUBLIC_APP_DOMAIN` and `NEXT_PUBLIC_ADMIN_SUBDOMAIN` are set correctly. The `next.config.ts` automatically configures CORS based on these values.

#### Subdomain not resolving

**Cause:** DNS not propagated or misconfigured.

**Solutions:**
1. Check DNS propagation: `dig admin.yourdomain.com`
2. Verify DNS records point to your hosting
3. Wait for DNS propagation (up to 48 hours, typically 5-30 minutes)

#### "Invalid host header" error

**Cause:** Next.js rejecting requests from unexpected hostnames.

**Solution:** Ensure all domains are properly configured in your hosting platform and that your middleware doesn't block the hostname.

#### Authentication fails on admin subdomain

**Cause:** Cross-subdomain auth not configured.

**Solutions:**
1. Verify Clerk cookie domain includes subdomain (`.yourdomain.com`)
2. Check that both domains are added to Clerk dashboard
3. Ensure `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` matches the domain configuration

### Health Checks

After deployment, verify:

1. **Main domain loads:** `https://clicapedidos.com.br`
2. **Admin subdomain loads:** `https://admin.clicapedidos.com.br`
3. **API health endpoint:** `https://clicapedidos.com.br/api/health`
4. **Authentication works on both domains**
5. **Session persists when navigating between domains**

### Monitoring

Set up monitoring for both domains:
- Uptime monitoring (Pingdom, UptimeRobot, etc.)
- Error tracking (Sentry, LogRocket, etc.)
- Performance monitoring (Vercel Analytics, PostHog, etc.)

## Current Development: iFood Connection Flow Improvements

The current development focus is improving the iFood integration connection flow:
- Moving OAuth from separate pages to a multi-step modal
- Adding merchant catalog selection
- Securing OAuth tokens server-side (AES-256-GCM)
- Cleaning up the connected state UI

See `.autoforge/prompts/app_spec.txt` for the full specification.
