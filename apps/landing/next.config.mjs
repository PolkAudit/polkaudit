/** @type {import('next').NextConfig} */
const nextConfig = {
  // Smaller runtime image for Alibaba SAS / VPS deploys
  output: 'standalone',
  images: {
    unoptimized: true,
  },
}

export default nextConfig
