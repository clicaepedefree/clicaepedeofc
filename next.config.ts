import type { NextConfig } from 'next'

/**
 * Security headers for all responses.
 * These work correctly with both path-based and subdomain-based routing.
 */
const securityHeaders = [
  // Prevent browsers from sniffing MIME types
  {
    key: 'X-Content-Type-Options',
    value: 'nosniff',
  },
  // Prevent clickjacking attacks
  {
    key: 'X-Frame-Options',
    value: 'SAMEORIGIN',
  },
  // Enable browser XSS filtering
  {
    key: 'X-XSS-Protection',
    value: '1; mode=block',
  },
  // Control referrer information
  {
    key: 'Referrer-Policy',
    value: 'strict-origin-when-cross-origin',
  },
  // Ensure strict origin check for CORP
  {
    key: 'Cross-Origin-Opener-Policy',
    value: 'same-origin',
  },
]

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'da6y2ze444.ufs.sh',
        pathname: '/f/*',
      },
    ],
  },
  async headers() {
    return [
      {
        // Apply security headers to all routes
        source: '/:path*',
        headers: securityHeaders,
      },
      {
        // Allow API routes to be called from admin subdomain (CORS)
        source: '/api/:path*',
        headers: [
          ...securityHeaders,
          // Allow requests from admin subdomain
          // Uses NEXT_PUBLIC_APP_DOMAIN and NEXT_PUBLIC_ADMIN_SUBDOMAIN env vars
          {
            key: 'Access-Control-Allow-Origin',
            // In production, use configured domain; in dev, use * since subdomain varies
            value: process.env.NODE_ENV === 'production'
              ? `https://${process.env.NEXT_PUBLIC_ADMIN_SUBDOMAIN || 'admin'}.${process.env.NEXT_PUBLIC_APP_DOMAIN || 'clicapedidos.com.br'}`
              : '*',
          },
          {
            key: 'Access-Control-Allow-Methods',
            value: 'GET, POST, PUT, DELETE, OPTIONS',
          },
          {
            key: 'Access-Control-Allow-Headers',
            value: 'Content-Type, Authorization, X-Requested-With',
          },
          {
            key: 'Access-Control-Allow-Credentials',
            value: 'true',
          },
        ],
      },
    ]
  },
  experimental: {
    turbo: {
      rules: {
        '*.receipt': {
          loaders: [
            {
              loader: 'raw-loader',
              options: { esModule: false },
            },
          ],
          as: '*.js',
        },
      },
    },
  },
  webpack(config: import('webpack').Configuration) {
    config.module?.rules?.push({
      test: /.*\.receipt$/,
      use: 'raw-loader',
    })
    return config
  },
}

module.exports = nextConfig
