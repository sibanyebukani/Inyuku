import type { NextConfig } from 'next'
import createNextIntlPlugin from 'next-intl/plugin'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  images: {
    // local public/ assets only for now; remote patterns added when a CDN/R2 lands (M1+)
    formats: ['image/avif', 'image/webp'],
  },
}

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts')

export default withNextIntl(nextConfig)
