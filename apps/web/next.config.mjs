import bundleAnalyzer from '@next/bundle-analyzer';

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === 'true',
});

const nextConfig = {
  // Performance optimizations
  poweredByHeader: false,
  reactStrictMode: true,
  
  // Bundle optimization
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production' ? {
      exclude: ['error', 'warn'] // Keep error and warn logs in production
    } : false,
  },
  
  // Performance optimizations
  experimental: {
    // Disable optimizeCss as it's causing build issues with critters
    // Will re-enable once Next.js fixes the dependency issue
    optimizeCss: false,
  },
  
  // Headers for security and performance
  async headers() {
    const isProduction = process.env.NODE_ENV === 'production';
    
    return [
      {
        source: '/(.*)',
        headers: [
          // Security headers from middleware (CDN-level enforcement)
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
          // ACAO removed - pages should not have CORS headers at all
          // Empty string override is unconventional and may cause proxy issues
          // HSTS without preload (as per GPT-5 recommendation)
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=31536000; includeSubDomains',
          },
          // CSP removed - handled by middleware.ts with nonce support
          // Duplicate CSP headers cause browser intersection and can break scripts
        ],
      },
      // API routes - allow specific CORS for Edge Functions only
      {
        source: '/api/(.*)',
        headers: [
          {
            key: 'Access-Control-Allow-Methods',
            value: 'GET, POST, PUT, DELETE, OPTIONS',
          },
          {
            key: 'Access-Control-Allow-Headers', 
            value: 'authorization, x-client-info, apikey, content-type',
          },
          {
            key: 'Vary',
            value: 'Origin',
          },
        ],
      },
    ];
  },
};

export default withBundleAnalyzer(nextConfig);
