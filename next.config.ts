import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  images: {
    // local public/ assets only for now; remote patterns added when a CDN/R2 lands (M1+)
    formats: ['image/avif', 'image/webp'],
  },
}

export default nextConfig
