import type { NextConfig } from 'next'

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
