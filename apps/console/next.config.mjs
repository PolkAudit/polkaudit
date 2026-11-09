/** @type {import('next').NextConfig} */
const nextConfig = {
  // Standalone for Alibaba SAS (same pattern as apps/frontend)
  output: 'standalone',
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
}

export default nextConfig
