# Deployment Guide

This document provides detailed instructions for deploying Clica Pedidos with subdomain routing.

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Pre-Deployment Checklist](#pre-deployment-checklist)
- [Environment Configuration](#environment-configuration)
- [DNS Setup](#dns-setup)
- [Vercel Deployment](#vercel-deployment)
- [Self-Hosted Deployment](#self-hosted-deployment)
- [Clerk Authentication Setup](#clerk-authentication-setup)
- [Post-Deployment Verification](#post-deployment-verification)
- [Troubleshooting](#troubleshooting)

## Architecture Overview

Clica Pedidos uses a subdomain-based architecture:

```
clicapedidos.com.br          → Public pages (login, landing)
admin.clicapedidos.com.br    → Admin panel (dashboard, POS, menu)
```

Both domains are served by the same Next.js application. The middleware detects the subdomain and sets appropriate headers for conditional rendering.

### How Subdomain Detection Works

1. **Request arrives** at either domain
2. **Middleware** (`src/middleware.ts`) extracts hostname
3. **Domain config** (`src/shared/lib/domain-config.ts`) checks against env variables
4. **Header set** (`x-subdomain-context: admin|public`)
5. **Components** read header for conditional rendering

## Pre-Deployment Checklist

Before deploying, ensure you have:

- [ ] Production PostgreSQL database
- [ ] Clerk production account with domains configured
- [ ] UploadThing production token
- [ ] iFood production credentials (if using iFood integration)
- [ ] NFe.io production API key (if using fiscal integration)
- [ ] Domain name registered and DNS access
- [ ] SSL certificates (usually automatic on platforms like Vercel)

## Environment Configuration

### Required Environment Variables

```env
# ============================================
# DOMAIN CONFIGURATION
# ============================================
# Your main domain (without protocol or www)
NEXT_PUBLIC_APP_DOMAIN=clicapedidos.com.br

# Admin subdomain prefix (default: admin)
NEXT_PUBLIC_ADMIN_SUBDOMAIN=admin

# ============================================
# DATABASE
# ============================================
# Production PostgreSQL connection string
POSTGRES_URL=postgresql://user:password@host:5432/database?sslmode=require

# ============================================
# AUTHENTICATION (CLERK)
# ============================================
# Get from Clerk Dashboard > API Keys
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_xxx
CLERK_SECRET_KEY=sk_live_xxx

# Redirect URLs (adjust paths if needed)
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/login
NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/dashboard
NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL=/dashboard
NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL=/dashboard
NEXT_PUBLIC_CLERK_SIGN_IN_FORCE_REDIRECT_URL=/admin-onboarding
NEXT_PUBLIC_CLERK_SIGN_UP_FORCE_REDIRECT_URL=/admin-onboarding

# ============================================
# FILE UPLOADS (UPLOADTHING)
# ============================================
UPLOADTHING_TOKEN=xxx

# ============================================
# IFOOD INTEGRATION (Optional)
# ============================================
NEXT_PUBLIC_IFOOD_CLIENT_ID=xxx
IFOOD_CLIENT_SECRET=xxx
IFOOD_REDIRECT_URI=https://clicapedidos.com.br/api/integrations/ifood/callback
IFOOD_TOKEN_ENCRYPTION_KEY=xxx  # Generate with: openssl rand -hex 32
IFOOD_API_BASE_URL=https://merchant-api.ifood.com.br

# ============================================
# NFE INTEGRATION (Optional)
# ============================================
NFE_IO_API_KEY=xxx
```

### Environment Variable Security

- **Never commit** `.env.local` or any file with secrets
- Use your hosting platform's **secret management**
- Rotate secrets periodically
- Use different values for **staging vs production**

## DNS Setup

### Required DNS Records

You need DNS records for both the main domain and admin subdomain:

| Type | Host/Name | Target/Value | TTL |
|------|-----------|--------------|-----|
| A or CNAME | @ (root) | Your hosting IP or CNAME | 300 |
| A or CNAME | admin | Your hosting IP or CNAME | 300 |

### DNS for Vercel

```
# Root domain
CNAME @ cname.vercel-dns.com

# Admin subdomain
CNAME admin cname.vercel-dns.com
```

### DNS for Self-Hosted (Example IP: 203.0.113.50)

```
A @ 203.0.113.50
A admin 203.0.113.50
```

### DNS for Cloudflare (Proxied)

```
A @ 203.0.113.50 (Proxied)
A admin 203.0.113.50 (Proxied)
```

### Verifying DNS

Check DNS propagation:

```bash
# Check main domain
dig clicapedidos.com.br

# Check admin subdomain
dig admin.clicapedidos.com.br

# Or use online tools
# https://dnschecker.org
```

## Vercel Deployment

### Step 1: Import Project

1. Go to [vercel.com/new](https://vercel.com/new)
2. Import your Git repository
3. Select "Next.js" as framework preset

### Step 2: Configure Environment Variables

In Project Settings > Environment Variables:

1. Add all required variables from the section above
2. Ensure `NEXT_PUBLIC_APP_DOMAIN` matches your production domain
3. Set different values for Preview/Development if needed

### Step 3: Add Domains

In Project Settings > Domains:

1. Add `clicapedidos.com.br`
   - Follow Vercel's instructions to verify ownership
2. Add `admin.clicapedidos.com.br`
   - This should auto-verify if main domain is verified

### Step 4: Deploy

1. Push to your main branch
2. Vercel will automatically build and deploy
3. Verify both domains work

### Vercel-Specific Notes

- **Edge Runtime**: The middleware runs on Edge by default
- **Automatic SSL**: Vercel provisions SSL certificates automatically
- **Preview Deployments**: Each PR gets a preview URL (update env vars accordingly)

## Self-Hosted Deployment

### Using Docker

```dockerfile
# Dockerfile
FROM oven/bun:1 AS base

WORKDIR /app

# Install dependencies
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# Copy source
COPY . .

# Build
ENV NODE_ENV=production
RUN bun run build

# Production image
FROM oven/bun:1-slim AS runner
WORKDIR /app

ENV NODE_ENV=production

COPY --from=base /app/public ./public
COPY --from=base /app/.next/standalone ./
COPY --from=base /app/.next/static ./.next/static

EXPOSE 3000
ENV PORT=3000

CMD ["bun", "server.js"]
```

### Nginx Configuration

```nginx
# /etc/nginx/sites-available/clicapedidos

# Redirect HTTP to HTTPS
server {
    listen 80;
    server_name clicapedidos.com.br admin.clicapedidos.com.br;
    return 301 https://$server_name$request_uri;
}

# Main configuration
server {
    listen 443 ssl http2;
    server_name clicapedidos.com.br admin.clicapedidos.com.br;

    # SSL certificates
    ssl_certificate /etc/letsencrypt/live/clicapedidos.com.br/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/clicapedidos.com.br/privkey.pem;

    # Proxy to Next.js
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### PM2 Process Manager

```javascript
// ecosystem.config.js
module.exports = {
  apps: [{
    name: 'clica-pedidos',
    script: 'bun',
    args: 'start',
    env: {
      NODE_ENV: 'production',
      PORT: 3000,
    },
    instances: 'max',
    exec_mode: 'cluster',
  }]
}
```

Start with:
```bash
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

## Clerk Authentication Setup

### Step 1: Create Production Instance

1. Go to [Clerk Dashboard](https://dashboard.clerk.com)
2. Create a new application for production
3. Note the API keys

### Step 2: Configure Domains

In Clerk Dashboard > Domains:

1. Add `clicapedidos.com.br`
2. Add `admin.clicapedidos.com.br`
3. Verify domain ownership (usually via DNS TXT record)

### Step 3: Configure Session Settings

In Clerk Dashboard > Sessions:

1. Set **Cookie domain** to `.clicapedidos.com.br`
   - The leading dot is important - it allows cookie sharing across subdomains
2. Configure session lifetime as needed

### Step 4: Configure Social Providers (Optional)

If using Google, GitHub, etc.:

1. Update OAuth redirect URLs to include both domains
2. Example for Google:
   - `https://clicapedidos.com.br/sso-callback`
   - `https://admin.clicapedidos.com.br/sso-callback`

## Post-Deployment Verification

### Automated Health Checks

Run these checks after deployment:

```bash
# Main domain
curl -I https://clicapedidos.com.br
# Expected: HTTP/2 200

# Admin subdomain
curl -I https://admin.clicapedidos.com.br
# Expected: HTTP/2 200 (or 307 redirect to login)

# API health
curl https://clicapedidos.com.br/api/health
# Expected: {"status":"ok"}
```

### Manual Verification Checklist

- [ ] Main domain loads without errors
- [ ] Admin subdomain redirects to login for unauthenticated users
- [ ] Login works on main domain
- [ ] After login, can access admin subdomain
- [ ] Session persists when switching between domains
- [ ] POS terminal loads on admin subdomain
- [ ] File uploads work
- [ ] Database operations work (create/read/update/delete)
- [ ] iFood integration works (if configured)
- [ ] No console errors in browser

## Troubleshooting

### Issue: Infinite Redirect Loop

**Symptoms:** Browser shows "too many redirects" error

**Causes & Solutions:**

1. **Clerk cookie domain misconfigured**
   - Ensure cookie domain is `.yourdomain.com` (with leading dot)
   - Check Clerk Dashboard > Sessions

2. **Environment variables wrong**
   - Verify `NEXT_PUBLIC_APP_DOMAIN` exactly matches your domain
   - No trailing slashes, no `https://`

### Issue: CORS Errors

**Symptoms:** Console shows "Cross-Origin Request Blocked"

**Solutions:**

1. Check `NEXT_PUBLIC_APP_DOMAIN` and `NEXT_PUBLIC_ADMIN_SUBDOMAIN` are set
2. Clear Next.js cache and redeploy:
   ```bash
   rm -rf .next
   bun run build
   ```

### Issue: Admin Subdomain Shows 404

**Symptoms:** Admin subdomain shows Next.js 404 page

**Solutions:**

1. Verify DNS records are correctly configured
2. Verify domain is added to hosting platform
3. Check middleware isn't blocking requests

### Issue: Database Connection Fails

**Symptoms:** 500 errors, "Connection refused"

**Solutions:**

1. Verify `POSTGRES_URL` is correct
2. Check database allows connections from your hosting IP
3. Ensure SSL mode is correct (`?sslmode=require` for most cloud DBs)

### Issue: File Uploads Fail

**Symptoms:** Image uploads fail silently or with errors

**Solutions:**

1. Verify `UPLOADTHING_TOKEN` is set correctly
2. Check UploadThing dashboard for error logs
3. Ensure file size limits aren't exceeded

### Getting Help

If you encounter issues not covered here:

1. Check the [Next.js deployment docs](https://nextjs.org/docs/deployment)
2. Check [Clerk documentation](https://clerk.com/docs)
3. Check your hosting platform's documentation
4. Open an issue in the project repository
