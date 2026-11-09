/** @type {import('next').NextConfig} */
const nextConfig = {
  // Standalone for Alibaba SAS (same pattern as apps/frontend)
  output: 'standalone',
  images: {
    unoptimized: true,
  },
}

export default nextConfig
