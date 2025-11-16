import type { NextConfig } from 'next'

// Use require for next-pwa to avoid TypeScript issues
const withPWA = require('next-pwa')({
  dest: 'public',
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === 'development',
})

// next.config.ts

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // experimental: { turbo: false } <-- remove this
};

export default nextConfig;

