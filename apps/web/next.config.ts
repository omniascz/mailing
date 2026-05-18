import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
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

export default nextConfig;
