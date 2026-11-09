const CONSOLE_URL = (
  process.env.NEXT_PUBLIC_CONSOLE_URL || 'https://console.polkaudit.xyz'
).replace(/\/$/, '')

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
  async redirects() {
    return [
      {
        source: '/signup',
        destination: `${CONSOLE_URL}/login`,
        permanent: false,
      },
      {
        source: '/verify-email',
        destination: `${CONSOLE_URL}/verify-email`,
        permanent: false,
      },
      {
        source: '/forgot-password',
        destination: `${CONSOLE_URL}/forgot-password`,
        permanent: false,
      },
      {
        source: '/reset-password',
        destination: `${CONSOLE_URL}/reset-password`,
        permanent: false,
      },
    ]
  },
}

export default nextConfig
