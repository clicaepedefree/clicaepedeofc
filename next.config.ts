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
}

module.exports = nextConfig
