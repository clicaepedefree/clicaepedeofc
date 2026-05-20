#!/bin/bash
set -e

# ============================================================
# Clica Pedidos - Development Environment Setup
# ============================================================
# This script installs dependencies, applies database migrations,
# and starts the Next.js development server.
#
# Prerequisites:
#   - Bun runtime (https://bun.sh)
#   - Node.js >= 22.17.1
#   - PostgreSQL database (Supabase)
#   - .env.local file with required environment variables
#
# Required environment variables in .env.local:
#   POSTGRES_URL          - PostgreSQL connection string
#   NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY - Clerk auth public key
#   CLERK_SECRET_KEY      - Clerk auth secret key
#   NEXT_PUBLIC_IFOOD_CLIENT_ID - iFood OAuth client ID
#   IFOOD_CLIENT_SECRET   - iFood OAuth client secret
#   IFOOD_TOKEN_ENCRYPTION_KEY - AES-256-GCM encryption key for token storage
#   SUPABASE_URL          - Supabase project URL for Storage uploads
#   SUPABASE_SERVICE_ROLE_KEY - Server-only key for Supabase Storage uploads
# ============================================================

echo "============================================================"
echo "  Clica Pedidos - Development Environment Setup"
echo "============================================================"
echo ""

# --------------------------------------------------
# 1. Check prerequisites
# --------------------------------------------------
echo "[1/5] Checking prerequisites..."

# Check for Bun
if ! command -v bun &> /dev/null; then
    echo "ERROR: Bun is not installed."
    echo "Install it with: curl -fsSL https://bun.sh/install | bash"
    exit 1
fi
echo "  Bun: $(bun --version)"

# Check for Node.js (needed by Next.js and supporting tools)
if ! command -v node &> /dev/null; then
    echo "ERROR: Node.js is not installed."
    echo "Install Node.js 22.17.1 or newer."
    exit 1
fi

NODE_VERSION="$(node --version)"
NODE_MAJOR="$(echo "$NODE_VERSION" | sed 's/^v//' | cut -d. -f1)"
NODE_MINOR="$(echo "$NODE_VERSION" | sed 's/^v//' | cut -d. -f2)"
NODE_PATCH="$(echo "$NODE_VERSION" | sed 's/^v//' | cut -d. -f3)"

if [ "$NODE_MAJOR" -lt 22 ] || { [ "$NODE_MAJOR" -eq 22 ] && [ "$NODE_MINOR" -lt 17 ]; } || { [ "$NODE_MAJOR" -eq 22 ] && [ "$NODE_MINOR" -eq 17 ] && [ "$NODE_PATCH" -lt 1 ]; }; then
    echo "ERROR: Node.js $NODE_VERSION is not supported."
    echo "Install Node.js 22.17.1 or newer."
    exit 1
fi

echo "  Node.js: $NODE_VERSION"

# Check for .env.local
if [ ! -f .env.local ]; then
    echo ""
    echo "WARNING: .env.local file not found!"
    echo "Create .env.local with the required environment variables."
    echo "See the header of this script for the list of required variables."
    echo ""
fi

echo ""

# --------------------------------------------------
# 2. Install dependencies
# --------------------------------------------------
echo "[2/5] Installing dependencies with Bun..."
bun install
echo ""

# --------------------------------------------------
# 3. Generate database migrations (if schema changed)
# --------------------------------------------------
echo "[3/5] Checking database migrations..."
if [ -f .env.local ]; then
    # Generate migration if there are schema changes
    bunx --bun drizzle-kit generate 2>/dev/null || echo "  No new schema changes to migrate."

    # Apply pending migrations
    echo "  Applying pending migrations..."
    bunx --bun drizzle-kit migrate 2>/dev/null || echo "  Migration skipped (check database connection)."
else
    echo "  Skipping migrations (.env.local not found - no database connection)."
fi
echo ""

# --------------------------------------------------
# 4. Type check (optional, non-blocking)
# --------------------------------------------------
echo "[4/5] Running type check..."
bunx tsc --noEmit 2>/dev/null || echo "  Type check completed with warnings (non-blocking)."
echo ""

# --------------------------------------------------
# 5. Start the development server
# --------------------------------------------------
echo "[5/5] Starting Next.js development server..."
echo ""
echo "============================================================"
echo "  App running at: http://localhost:3000"
echo "  Mode: Development (Turbopack)"
echo "============================================================"
echo ""
echo "  Routes:"
echo "    /dashboard          - Main dashboard"
echo "    /menu               - Menu management"
echo "    /pos                - Point of sale"
echo "    /settings           - App settings"
echo "    /settings/integracoes - Integrations (iFood connection)"
echo ""
echo "  Press Ctrl+C to stop the server."
echo ""

bun run dev
