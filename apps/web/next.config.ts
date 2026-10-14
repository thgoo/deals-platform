import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Workspace package shipped as TypeScript source.
  transpilePackages: ['@bargah/shared'],
  images: {
    localPatterns: [
      {
        pathname: '/api/media/**',
      },
      {
        pathname: '/images/**',
      },
    ],
  },
};

export default nextConfig;
