/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  devIndicators: false,
  async rewrites() {
    // Next.js ignores route folders starting with `_` (`app/_backend`), so map `/_backend/*`
    // internally to our runtime Node route handler (never freeze SHARED_API_URL at build time).
    return [
      { source: '/_backend/:path*', destination: '/api/backend-proxy/:path*' },
    ];
  },
  webpack: (config) => {
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      net: false,
      tls: false,
    };
    config.resolve.alias = {
      ...config.resolve.alias,
      '@coinbase/cdp-sdk': false,
      '@x402/evm': false,
      '@x402/core': false,
      '@x402/svm': false,
      '@react-native-async-storage/async-storage': false,
    };
    config.externals.push('pino-pretty', 'lokijs', 'encoding');
    return config;
  },
};

module.exports = nextConfig;
