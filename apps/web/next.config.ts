import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  images: {
    localPatterns: [
      {
        pathname: '/api/media/**',
      },
    ],
  },
};

export default nextConfig;
