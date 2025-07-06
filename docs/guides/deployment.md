# Production Deployment Guide - Guardian

**Last Updated:** July 2025  
**Target Environment:** Vercel + Supabase  
**Prerequisites:** GitHub account, Vercel account, Supabase account

---

## 📋 Overview

This guide walks through deploying Guardian to production using Vercel for the frontend and Supabase for the backend services. The deployment process is optimized for solo developers and minimizes operational overhead.

### Architecture Overview
- **Frontend:** Next.js deployed on Vercel
- **Database:** Supabase PostgreSQL
- **Authentication:** Supabase Auth
- **File Storage:** Supabase Storage
- **Edge Functions:** Supabase Edge Functions (optional)

---

## 🚀 Quick Deployment (5 minutes)

### 1. Prerequisites Check
```bash
# Verify you have access to required services
# ✓ GitHub repository with Guardian code
# ✓ Vercel account (free tier available)
# ✓ Supabase account (free tier available)
# ✓ Custom domain (optional, can use Vercel subdomain)
```

### 2. One-Click Deployment
```bash
# Connect GitHub to Vercel
1. Go to https://vercel.com/new
2. Import your Guardian repository
3. Configure environment variables (see below)
4. Deploy

# Deployment URL will be: https://your-app.vercel.app
```

### 3. Environment Variables
Add these to your Vercel project settings:

```env
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Application Configuration
NEXT_PUBLIC_APP_URL=https://your-app.vercel.app
NODE_ENV=production

# Optional: Analytics and monitoring
NEXT_PUBLIC_GA_ID=G-XXXXXXXXXX
SENTRY_DSN=https://xxx@sentry.io/xxx
```

---

## 🔧 Detailed Setup Process

### Step 1: Prepare Supabase Project

#### 1.1 Create Production Database
```bash
# Create new Supabase project
1. Go to https://supabase.com/dashboard
2. Click "New Project"
3. Choose organization and region
4. Set strong database password
5. Wait for setup (2-3 minutes)
```

#### 1.2 Configure Database Schema
```sql
-- Run in Supabase SQL Editor
-- Create tables for Guardian
CREATE TABLE documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  original_name TEXT,
  mime_type TEXT,
  file_size INTEGER,
  status TEXT DEFAULT 'uploaded',
  processed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Users can only access their own documents"
ON documents
FOR ALL
USING (auth.uid() = user_id);

-- Create indexes for performance
CREATE INDEX documents_user_id_idx ON documents(user_id);
CREATE INDEX documents_status_idx ON documents(status);
CREATE INDEX documents_created_at_idx ON documents(created_at);
```

#### 1.3 Configure Storage
```bash
# In Supabase Dashboard > Storage
1. Create bucket "medical-docs"
2. Set to private (public = false)
3. Configure RLS policies for bucket access
```

```sql
-- Storage RLS policies
CREATE POLICY "Users can upload their own files"
ON storage.objects
FOR INSERT
WITH CHECK (bucket_id = 'medical-docs' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can view their own files"
ON storage.objects
FOR SELECT
USING (bucket_id = 'medical-docs' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete their own files"
ON storage.objects
FOR DELETE
USING (bucket_id = 'medical-docs' AND auth.uid()::text = (storage.foldername(name))[1]);
```

#### 1.4 Configure Authentication
```bash
# In Supabase Dashboard > Authentication > Settings
1. Enable email confirmations
2. Set site URL: https://your-app.vercel.app
3. Add redirect URLs:
   - https://your-app.vercel.app/auth/callback
   - https://your-app.vercel.app/auth/confirm
4. Configure email templates (optional)
```

### Step 2: Prepare Vercel Deployment

#### 2.1 Repository Setup
```bash
# Ensure your repository has required files
git add .
git commit -m "Prepare for production deployment"
git push origin main

# Required files:
# ✓ package.json with production dependencies
# ✓ next.config.js with production settings
# ✓ .env.example with required environment variables
# ✓ vercel.json for deployment configuration (optional)
```

#### 2.2 Vercel Configuration
Create `vercel.json` in your project root:
```json
{
  "framework": "nextjs",
  "buildCommand": "npm run build",
  "devCommand": "npm run dev",
  "installCommand": "npm install",
  "env": {
    "NEXT_PUBLIC_SUPABASE_URL": "@supabase_url",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY": "@supabase_anon_key",
    "SUPABASE_SERVICE_ROLE_KEY": "@supabase_service_role_key"
  },
  "functions": {
    "app/api/**": {
      "maxDuration": 30
    }
  }
}
```

#### 2.3 Build Configuration
Update `next.config.js`:
```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    appDir: true,
  },
  env: {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  },
  images: {
    domains: ['your-project.supabase.co'],
  },
  // Production optimizations
  swcMinify: true,
  compress: true,
  poweredByHeader: false,
}

module.exports = nextConfig
```

### Step 3: Deploy to Vercel

#### 3.1 Connect Repository
```bash
# Via Vercel Dashboard
1. Go to https://vercel.com/new
2. Import your GitHub repository
3. Select "Guardian" repository
4. Configure project settings
```

#### 3.2 Environment Variables
```bash
# In Vercel Dashboard > Project Settings > Environment Variables
# Add all required environment variables:

NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
NEXT_PUBLIC_APP_URL=https://your-app.vercel.app
NODE_ENV=production
```

#### 3.3 Deploy
```bash
# Automatic deployment
# Vercel will automatically deploy when you push to main branch

# Manual deployment
npx vercel --prod

# Check deployment status
npx vercel ls
```

---

## 🔒 Security Configuration

### SSL/TLS Configuration
```bash
# Vercel automatically provides SSL certificates
# No additional configuration needed for HTTPS
# Custom domains get automatic SSL certificates
```

### CORS Configuration
```javascript
// middleware.js - Configure CORS for API routes
import { NextResponse } from 'next/server';

export function middleware(request) {
  // Handle CORS for API routes
  if (request.nextUrl.pathname.startsWith('/api/')) {
    const response = NextResponse.next();
    response.headers.set('Access-Control-Allow-Origin', 'https://your-app.vercel.app');
    response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    return response;
  }
  
  return NextResponse.next();
}

export const config = {
  matcher: '/api/:path*',
};
```

### Content Security Policy
```javascript
// next.config.js - Add CSP headers
const nextConfig = {
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: "default-src 'self'; script-src 'self' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self' https://*.supabase.co;"
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY'
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff'
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin'
          }
        ]
      }
    ];
  }
};
```

---

## 🌐 Custom Domain Setup

### Step 1: Configure Domain in Vercel
```bash
# In Vercel Dashboard > Project Settings > Domains
1. Add your custom domain (e.g., guardianhealth.app)
2. Follow DNS configuration instructions
3. Wait for SSL certificate provisioning
```

### Step 2: Update Supabase Configuration
```bash
# In Supabase Dashboard > Authentication > Settings
1. Update Site URL to your custom domain
2. Update redirect URLs to use custom domain
3. Test authentication flow
```

### Step 3: Update Environment Variables
```bash
# Update NEXT_PUBLIC_APP_URL in Vercel
NEXT_PUBLIC_APP_URL=https://your-custom-domain.com
```

---

## 📊 Monitoring & Analytics

### Performance Monitoring
```javascript
// Install Vercel Analytics
npm install @vercel/analytics

// Add to app/layout.tsx
import { Analytics } from '@vercel/analytics/react';

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
```

### Error Tracking
```bash
# Install Sentry for error tracking
npm install @sentry/nextjs

# Configure Sentry (optional)
# Add SENTRY_DSN to environment variables
```

### Database Monitoring
```bash
# In Supabase Dashboard > Settings > Database
1. Enable connection pooling
2. Set up monitoring alerts
3. Configure backup retention
4. Monitor query performance
```

---

## 🔄 Continuous Deployment

### GitHub Actions (Optional)
```yaml
# .github/workflows/deploy.yml
name: Deploy to Vercel

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-node@v2
        with:
          node-version: '18'
      - run: npm ci
      - run: npm run build
      - run: npm run test
      - uses: amondnet/vercel-action@v20
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-org-id: ${{ secrets.ORG_ID }}
          vercel-project-id: ${{ secrets.PROJECT_ID }}
          vercel-args: '--prod'
```

---

## 🐛 Troubleshooting

### Common Issues

#### Build Failures
```bash
# Check build logs in Vercel Dashboard
# Common issues:
# - Missing environment variables
# - Type errors in production build
# - Import path issues

# Debug locally
npm run build
npm run start
```

#### Database Connection Issues
```bash
# Check Supabase project status
# Verify environment variables are correct
# Test connection in Supabase Dashboard > SQL Editor
```

#### Authentication Issues
```bash
# Check redirect URLs in Supabase Auth settings
# Verify site URL matches deployment URL
# Test magic link flow in production
```

#### Storage Issues
```bash
# Verify bucket exists and is configured
# Check RLS policies are set correctly
# Test file upload in production
```

---

## 📋 Deployment Checklist

### Pre-Deployment
- [ ] All environment variables configured
- [ ] Database schema deployed
- [ ] RLS policies configured
- [ ] Storage bucket created and configured
- [ ] Authentication settings updated
- [ ] SSL certificates ready
- [ ] Custom domain configured (if applicable)

### Post-Deployment
- [ ] Test user registration flow
- [ ] Test document upload functionality
- [ ] Test authentication flow
- [ ] Verify all API endpoints work
- [ ] Check error handling and logging
- [ ] Monitor performance and errors
- [ ] Set up backup procedures

### Ongoing Maintenance
- [ ] Monitor application performance
- [ ] Review error logs regularly
- [ ] Update dependencies monthly
- [ ] Backup database weekly
- [ ] Review security settings quarterly

---

## 📞 Support

### Deployment Issues
- **Vercel:** Check deployment logs and documentation
- **Supabase:** Use Supabase Dashboard > Support
- **DNS:** Contact domain registrar support

### Production Monitoring
- **Performance:** Vercel Analytics Dashboard
- **Errors:** Check Vercel Function logs
- **Database:** Supabase Dashboard > Reports

---

*This deployment guide is updated with each major release. For the latest version, check the repository documentation.*