import type { NextConfig } from 'next';
import { withSentryConfig } from '@sentry/nextjs';

const nextConfig: NextConfig = {
  // Standalone build emits a minimal node_modules + server.js into
  // .next/standalone. The Dockerfile copies just that, keeping the
  // runner image around 250 MB instead of 2 GB.
  output: 'standalone',
  transpilePackages: ['@forgemsg/shared', '@forgemsg/editor'],
  webpack: (config) => {
    config.resolve.extensionAlias = {
      ...config.resolve.extensionAlias,
      '.js': ['.ts', '.tsx', '.js'],
      '.jsx': ['.tsx', '.jsx'],
    };
    return config;
  },
};

// withSentryConfig wraps the build with source-map upload + auto
// instrumentation. Without SENTRY_AUTH_TOKEN the wrap is a near no-op,
// safe for dev + pre-Sentry-account state.
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  silent: !process.env.SENTRY_AUTH_TOKEN,
  hideSourceMaps: true,
  disableLogger: true,
});
