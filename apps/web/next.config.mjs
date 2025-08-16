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
      // API routes - CORS headers removed and handled dynamically in each route
      // Static headers can't echo Access-Control-Request-Headers dynamically
      // Each API route now handles its own CORS with proper preflight support
    ];
  },
};

export default withBundleAnalyzer(nextConfig);
