import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  outputFileTracingRoot: process.cwd(),
  outputFileTracingIncludes: {
    '/*': ['./projects-data/**/*', './freecad/**/*']
  }
};

export default nextConfig;
