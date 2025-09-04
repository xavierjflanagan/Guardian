# Vercel Deployment Setup Guide

**Status:** ✅ Deployment Infrastructure Complete - Ready for Phase 3 Integration  
**Priority:** High - Infrastructure ready, full deployment deferred until Phase 3 optimization complete  
**Estimated Time:** Phase 1 & 3 Complete (2 hours), Phases 4-5 deferred pending Phase 3 tasks  
**Prerequisites:** Vercel account, environment variables configured

**Implementation Date:** 2025-08-12  
**Files Created:**
- `scripts/deploy-setup.sh` - Automated setup script
- `apps/web/.env.example` - Environment variable template
- `apps/web/app/api/health/route.ts` - Health check endpoint
- `.github/workflows/vercel-deploy.yml` - CI/CD pipeline
- Updated `vercel.json` - Enhanced configuration

---

## Overview

Guardian uses Vercel for production deployment of the web application (`apps/web`). This guide covers the complete setup process from initial project creation to production deployment.

## Phase 1: Initial Vercel Project Setup ✅ COMPLETED

### 1.1 Create Vercel Project ✅
```bash
# Automated setup script (RECOMMENDED)
./scripts/deploy-setup.sh

# OR Manual setup:
# Install Vercel CLI
pnpm add -g vercel

# Login to Vercel
vercel login

# Link project (run from repository root)
vercel link
```

**✅ Implementation Complete:**
- Created automated setup script: `scripts/deploy-setup.sh`
- Script handles CLI installation, authentication, and project linking
- Includes validation and error handling

### 1.2 Configure Project Settings ✅

**✅ Pre-configured in `vercel.json`:**

1. **Framework:** Next.js (auto-detected)
2. **Root Directory:** `apps/web` ✅
3. **Build Command:** `pnpm --filter @guardian/web run build` ✅
4. **Install Command:** `pnpm install --frozen-lockfile --workspace-root` ✅
5. **Output Directory:** `.next` (relative to root directory) ✅
6. **Node.js Version:** 18.x ✅
7. **Security Headers:** Content Security Policy, XSS Protection ✅
8. **Healthcare Compliance:** HIPAA-ready security configuration ✅

### 1.3 Environment Variables Setup ✅

**✅ Template Created:** `apps/web/.env.example`

**Required Variables (Production & Preview):**

```bash
# Core Supabase Configuration (REQUIRED)
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key

# AI Processing APIs (REQUIRED for document processing)
OPENAI_API_KEY=your_openai_api_key          # ~$15-30/1K docs
GOOGLE_CLOUD_API_KEY=your_google_cloud_api_key  # ~$1.50/1K docs

# Optional: Legacy AWS (if using Textract - NOT recommended due to cost)
AWS_ACCESS_KEY_ID=your_aws_access_key_id
AWS_SECRET_ACCESS_KEY=your_aws_secret_access_key
AWS_REGION=us-east-1

# Environment (auto-set by vercel.json)
NODE_ENV=production
```

**✅ Setup Instructions:**
1. Run `./scripts/deploy-setup.sh` (guided setup)
2. Add in Vercel Dashboard: `Project → Settings → Environment Variables`
3. Set for both 'Production' and 'Preview' environments

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

## Phase 4: Monitoring & Performance (⏳ DEFERRED)

**Reason for Deferral:** These steps require completion of Phase 3 optimization tasks for meaningful baseline metrics and proper configuration.

**Dependencies:**
- **Task 3.1**: Performance Optimization (performance budgets, bundle analysis)
- **Task 3.12**: Monitoring & Analytics (error monitoring integration, performance monitoring setup)

### 4.1 Analytics Setup (Pending Phase 3.12)
- Enable Vercel Analytics (requires performance baseline)
- Configure performance monitoring (requires optimization complete)  
- Set up error tracking integration (integrated with Task 3.12)

### 4.2 Security Headers ✅
Already configured in `vercel.json`:
- Content Security Policy
- X-Frame-Options  
- X-XSS-Protection
- X-Content-Type-Options

**Integration Point:** Will be completed alongside Phase 3 Task 3.12 (Monitoring & Analytics)

## Phase 5: Testing & Validation (⏳ DEFERRED)

**Reason for Deferral:** Full production validation requires completed optimization, security hardening, and automated CI/CD pipeline.

**Dependencies:**
- **Task 3.2**: Security Hardening (CSP implementation, security audit)
- **Task 3.4**: Automated CI/CD Pipeline (quality gates, automated testing)
- **Task 3.10**: Accessibility Compliance (WCAG testing)
- **Task 3.5**: Performance Optimization (Lighthouse scores, load testing)

### 5.1 Pre-Deployment Checklist (Pending Phase 3 Tasks)
- [ ] Environment variables configured in Vercel
- [ ] Build succeeds locally with production settings (✅ Phase 3.0 complete)
- [ ] All required secrets added to GitHub (Pending Task 3.4)
- [ ] Custom domain configured (if applicable) (Production deployment phase)
- [ ] SSL certificate active (Production deployment phase)
- [ ] Performance budgets met (Pending Task 3.1, 3.5)
- [ ] Security audit passed (Pending Task 3.2)
- [ ] Accessibility compliance verified (Pending Task 3.10)

### 5.2 Post-Deployment Testing (Pending Phase 3 Completion)
- [ ] Application loads successfully
- [ ] Authentication flow works (magic link)
- [ ] Supabase integration functional  
- [ ] Edge functions accessible
- [ ] Performance metrics acceptable (requires Task 3.1, 3.5 baseline)
- [ ] Security headers active (✅ configured, requires validation)
- [ ] Accessibility standards met (requires Task 3.10)

**Integration Point:** Will be completed after Phase 3 Week 4 (Production Readiness) tasks are finished

---

## 🔗 Phase 3 Integration Plan

### **What's Complete (✅ Ready for Phase 3)**
- **Deployment Infrastructure:** vercel.json, environment templates, automated scripts
- **CI/CD Pipeline Templates:** GitHub Actions workflow ready
- **Security Foundation:** Headers, CSP, healthcare compliance configuration  
- **Build System:** PNPM monorepo build commands optimized and tested

### **Integration Timeline**
- **Phase 3.1** (Performance Optimization) → Complete Phase 4.1 (Analytics baseline)
- **Phase 3.2** (Security Hardening) → Validate Phase 4.2 (Security headers testing)
- **Phase 3.4** (CI/CD Pipeline) → Complete Phase 3 (GitHub secrets, automated deployment)
- **Phase 3.12** (Monitoring & Analytics) → Complete Phase 4 (Full monitoring setup)
- **Phase 3 Week 4** (Production Readiness) → Complete Phase 5 (Full deployment validation)

### **Benefits of This Approach**
- **Performance monitoring** gets meaningful baseline metrics after optimization
- **Security validation** happens after security hardening is complete
- **Production deployment** deploys a truly production-ready application
- **Analytics setup** captures optimized performance characteristics
- **Error monitoring** integrates with completed error boundary system

**Result:** Single, comprehensive production deployment of fully optimized, secure, monitored Guardian application.

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

- [x] ✅ **Phase 1**: Initial Project Setup (COMPLETED 2025-08-12)
  - [x] ✅ Automated setup script created
  - [x] ✅ vercel.json configuration enhanced
  - [x] ✅ Environment variables template
  - [x] ✅ Health check endpoint
  - [x] ✅ CI/CD pipeline workflow
- ⏳ **Phase 2**: Domain & SSL Configuration (Deferred - Production deployment phase)
- [x] ✅ **Phase 3**: CI/CD Pipeline Integration (COMPLETED 2025-08-12)
- ⏳ **Phase 4**: Monitoring & Performance Setup (Deferred - Requires Phase 3 Tasks 3.1, 3.12)
- ⏳ **Phase 5**: Testing & Validation Complete (Deferred - Requires Phase 3 Tasks 3.2, 3.4, 3.10)

**Next Action:** ✅ DEPLOYMENT INFRASTRUCTURE READY - Proceed with Phase 3 optimization tasks before production deployment

---

**Related Documents:**
- [Deployment Overview](deployment.md)
- [Environment Variables](.env.example)
- [CI/CD Quality Gates](../../../.github/workflows/quality-gates.yml)