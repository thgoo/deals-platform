import type { NextConfig } from 'next';

const backendUrl =
  process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';

const nextConfig: NextConfig = {
  // Workspace package shipped as TypeScript source.
  transpilePackages: ['@bargah/shared'],
  images: {
    localPatterns: [{ pathname: '/images/**' }],
    // Deal photos are served by the api at <backend>/media/<file>.
    remotePatterns: [new URL('/media/**', backendUrl)],
    // In development the api runs on localhost, which Next refuses to optimize by default.
    dangerouslyAllowLocalIP: process.env.NODE_ENV !== 'production',
  },
};

export default nextConfig;
