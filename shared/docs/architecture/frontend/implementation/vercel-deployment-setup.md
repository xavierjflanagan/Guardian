# Vercel Deployment Setup Guide

**Status:** 📋 Planned - Not Yet Implemented  
**Priority:** High - Required for production deployment  
**Estimated Time:** 2-3 hours  
**Prerequisites:** Vercel account, environment variables configured

---

## Overview

Guardian uses Vercel for production deployment of the web application (`apps/web`). This guide covers the complete setup process from initial project creation to production deployment.

## Phase 1: Initial Vercel Project Setup

### 1.1 Create Vercel Project
```bash
# Install Vercel CLI
pnpm add -g vercel

# Login to Vercel
vercel login

# Link project (run from repository root)
vercel link
```

### 1.2 Configure Project Settings

**In Vercel Dashboard → Project Settings:**

1. **Framework:** Next.js (should auto-detect)
2. **Root Directory:** `apps/web`
3. **Build Command:** `pnpm --filter @guardian/web run build`
4. **Install Command:** `pnpm install --frozen-lockfile --workspace-root`
5. **Output Directory:** `.next` (relative to root directory)
6. **Node.js Version:** 18.x

### 1.3 Environment Variables Setup

**Required Variables (Production & Preview):**

```bash
# Core Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key

# AI Processing APIs (for edge functions)
OPENAI_API_KEY=your_openai_api_key
GOOGLE_CLOUD_API_KEY=your_google_cloud_api_key

# Optional: Legacy AWS (if using Textract)
AWS_ACCESS_KEY_ID=your_aws_access_key_id
AWS_SECRET_ACCESS_KEY=your_aws_secret_access_key
AWS_REGION=us-east-1

# Environment
NODE_ENV=production
```

**Add in Vercel Dashboard:**
`Project → Settings → Environment Variables`

## Phase 2: Domain & SSL Configuration

### 2.1 Custom Domain Setup
- Add custom domain in Vercel Dashboard
- Configure DNS records
- SSL certificates (automatic with Vercel)

### 2.2 Preview Environments
- Configure branch preview deployments
- Set up staging environment variables

## Phase 3: Deployment Pipeline Integration

### 3.1 GitHub Integration
```yaml
# .github/workflows/vercel-deploy.yml (to be created)
name: Vercel Deployment

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
        with:
          version: 9
      - uses: actions/setup-node@v4
        with:
          node-version: '18'
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter @guardian/web run build
      - uses: amondnet/vercel-action@v20
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-org-id: ${{ secrets.ORG_ID }}
          vercel-project-id: ${{ secrets.PROJECT_ID }}
          vercel-args: '--prod'
```

### 3.2 Required GitHub Secrets
- `VERCEL_TOKEN`: Vercel API token
- `ORG_ID`: Vercel organization ID
- `PROJECT_ID`: Vercel project ID

## Phase 4: Monitoring & Performance

### 4.1 Analytics Setup
- Enable Vercel Analytics
- Configure performance monitoring
- Set up error tracking integration

### 4.2 Security Headers
Already configured in `vercel.json`:
- Content Security Policy
- X-Frame-Options  
- X-XSS-Protection
- X-Content-Type-Options

## Phase 5: Testing & Validation

### 5.1 Pre-Deployment Checklist
- [ ] Environment variables configured in Vercel
- [ ] Build succeeds locally with production settings
- [ ] All required secrets added to GitHub
- [ ] Custom domain configured (if applicable)
- [ ] SSL certificate active

### 5.2 Post-Deployment Testing
- [ ] Application loads successfully
- [ ] Authentication flow works (magic link)
- [ ] Supabase integration functional
- [ ] Edge functions accessible
- [ ] Performance metrics acceptable

## Troubleshooting

### Common Issues

**Build Failures:**
```bash
# Local debugging
pnpm --filter @guardian/web run build
# Check environment variables are set
# Verify all dependencies are installed
```

**Environment Variable Issues:**
- Ensure variables are set for correct environment (Preview vs Production)
- Check for typos in variable names
- Verify secrets are properly quoted if containing special characters

**Monorepo Detection:**
- Ensure `--workspace-root` flag is used in install command
- Verify root directory is set to `apps/web`
- Check that `vercel.json` is in repository root

## Security Considerations

### Healthcare Compliance
- All environment variables containing PHI/PII must be encrypted
- Access logs should be configured appropriately
- Rate limiting should be enabled for production

### API Key Management
- Use Vercel's environment variable encryption
- Rotate keys regularly
- Monitor API usage and costs

---

## Status Tracking

- [ ] **Phase 1**: Initial Project Setup
- [ ] **Phase 2**: Domain & SSL Configuration  
- [ ] **Phase 3**: CI/CD Pipeline Integration
- [ ] **Phase 4**: Monitoring & Performance Setup
- [ ] **Phase 5**: Testing & Validation Complete

**Next Action:** Create GitHub issue to track implementation

---

**Related Documents:**
- [Deployment Overview](deployment.md)
- [Environment Variables](.env.example)
- [CI/CD Quality Gates](../../../.github/workflows/quality-gates.yml)