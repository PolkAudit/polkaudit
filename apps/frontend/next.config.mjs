/** @type {import('next').NextConfig} */
const nextConfig = {
  // Smaller runtime image for Alibaba SAS / VPS deploys
  output: 'standalone',
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
}

export default nextConfig
