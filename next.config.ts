import type { NextConfig } from 'next'
import { withSentryConfig } from '@sentry/nextjs'
import withSerwistInit from '@serwist/next'

const withSerwist = withSerwistInit({
  swSrc: 'src/app/sw.ts',
  swDest: 'public/sw.js',
  disable: process.env.NODE_ENV === 'development',
})

const nextConfig: NextConfig = {
  reactStrictMode: true,
  images: {
    formats: ['image/avif', 'image/webp'],
  },
  // Pins the workspace root to this checkout. Without it, Next.js's root
  // inference walks up from a git worktree and finds the parent checkout's
  // lockfile too, registering the @next/next ESLint plugin twice and
  // failing `next lint` at config-resolution time before any file lints.
  outputFileTracingRoot: __dirname,
}

export default withSentryConfig(withSerwist(nextConfig), {
  silent: true,
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
})
