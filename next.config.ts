import type { NextConfig } from 'next'

// Use require for next-pwa to avoid TypeScript issues
const withPWA = require('next-pwa')({
  dest: 'public',
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === 'development',
})

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Force Webpack to avoid Turbopack issues
  turbopack:{}
}

export default withPWA(nextConfig)
