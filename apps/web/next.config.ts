import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
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
