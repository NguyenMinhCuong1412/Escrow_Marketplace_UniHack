/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  devIndicators: false,
  async rewrites() {
    if (process.env.NEXT_PUBLIC_BACKEND_URL !== '/_backend') {
      return [];
    }
    const backend = (process.env.BACKEND_URL || 'http://127.0.0.1:8000').replace(/\/+$/, '');
    return [
      { source: '/_backend/health', destination: `${backend}/health` },
      { source: '/_backend/report/:id(\\d+)', destination: `${backend}/report/:id` },
      { source: '/_backend/agent/status/:id(\\d+)', destination: `${backend}/agent/status/:id` },
      { source: '/_backend/trade/:id(\\d+)/uris', destination: `${backend}/trade/:id/uris` },
      { source: '/_backend/trade/:id(\\d+)/nonce-qr.png', destination: `${backend}/trade/:id/nonce-qr.png` },
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
