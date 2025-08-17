# Guardian Staging/Production Workflow - Quick Reference

**Last Updated:** August 2025  
**Purpose:** Developer guide for the dual-environment deployment strategy

---

## 🌍 Environment Overview

| Environment | URL | Access Method | Purpose |
|-------------|-----|---------------|---------|
| **Production** | `exorahealth.com.au` | Password protection (`SITE_PASSWORD`) | Beta testers, clean UI |
| **Staging** | `staging.exorahealth.com.au` | Vercel team authentication | Developer testing, staging indicators |

---

## 🔑 Access Control

### Production Environment
- **Access**: Site password (7-day cookie expiry)
- **UI**: Clean, professional interface
- **Users**: Beta testers and authorized users
- **Security**: Single password shared with testers

### Staging Environment  
- **Access**: Vercel deployment protection
- **UI**: Orange staging banners on all pages
- **Users**: Vercel team members only
- **Security**: Individual Vercel account required

---

## 📋 Daily Workflow Commands

### 1. Development Work (Staging)
```bash
# Switch to staging branch
git checkout staging

# Make your changes
# ... edit files, add features, test ...

# Commit and deploy to staging
git add .
git commit -m "feature: describe your changes"
git push

# ✅ Changes now live at staging.exorahealth.com.au
```

### 2. Release to Beta Testers (Production)
```bash
# Switch to main branch
git checkout main

# Merge staging changes
git merge staging

# Deploy to production
git push

# ✅ Changes now live at exorahealth.com.au
```

---

## 🎨 Visual Indicators

### Staging Environment Indicators
- **Banner**: Orange "🚧 STAGING ENVIRONMENT - Development Version" on all pages
- **Browser Title**: "Guardian [STAGING]" suffix
- **Login Page**: Orange staging banner on password page

### Production Environment
- **Banner**: None - clean professional interface
- **Browser Title**: "Guardian" (no suffix)
- **Login Page**: Clean password form with no staging indicators

---

## 🔧 Environment Configuration

### Required Environment Variables
```bash
# Production (Vercel Dashboard > Environment Variables)
SITE_PASSWORD=your_chosen_password    # For beta tester access
MAINTENANCE_MODE=false               # Optional maintenance toggle

# Staging inherits same variables but uses Vercel auth
```

### Vercel Deployment Settings
```bash
# Project Settings > Git
- Production Branch: main
- Preview Branches: staging (with deployment protection enabled)

# Project Settings > Domains  
- exorahealth.com.au → main branch
- staging.exorahealth.com.au → staging branch

# Project Settings > Deployment Protection
- Enable for staging.exorahealth.com.au
- Add team members who need staging access
```

---

## 🛡️ Security Features

### Two-Layer Protection
1. **Staging**: Vercel team authentication prevents unauthorized access
2. **Production**: Site password allows controlled beta testing

### Cookie Management
- **Production cookies**: 7-day expiry for beta testers
- **Secure flags**: Automatic HTTPS-only cookies in production
- **Path isolation**: Cookies scoped to respective domains

---

## 🚨 Best Practices

### Development
- ✅ Always test on staging before merging to main
- ✅ Use descriptive commit messages
- ✅ Keep staging and main branches in sync
- ❌ Never push directly to main (use staging → main flow)

### Security
- ✅ Regularly rotate the production password
- ✅ Monitor who has Vercel team access
- ✅ Use staging for testing, production for controlled demos
- ❌ Don't share staging URLs publicly (Vercel auth protects them)

### Code Management
- ✅ Feature branches → staging → main
- ✅ Fast-forward merges to keep clean history
- ✅ Test thoroughly on staging before release
- ❌ Don't mix staging and production environments

---

## 🔍 Troubleshooting

### Common Issues

#### "Can't access staging URL"
- **Cause**: Not logged into Vercel or not team member
- **Solution**: Login to Vercel account with team access

#### "Password page not working on production"
- **Cause**: `SITE_PASSWORD` environment variable not set
- **Solution**: Add/update environment variable in Vercel dashboard

#### "Staging banner not showing"
- **Cause**: Domain detection issue
- **Solution**: Check hostname includes 'staging'

#### "Changes not deploying"
- **Cause**: Build failures or environment issues
- **Solution**: Check Vercel deployment logs

---

## 📞 Quick Support

| Issue Type | Solution |
|------------|----------|
| Deployment failures | Check Vercel deployment logs |
| Access issues | Verify environment variables and team access |
| Staging not updating | Check git push to staging branch |
| Production not updating | Ensure merge staging → main → push |
| Domain issues | Check Vercel domain configuration |

---

## 📖 Related Documentation

- [Full Deployment Guide](./deployment.md)
- [CLAUDE.md Development Workflow](../../../../CLAUDE.md#staging-production-deployment-workflow)
- [Security Checklist](../../security/security-checklist.md)
- [Frontend Implementation Guide](../../architecture/frontend/implementation/)

---

*This workflow enables safe development while maintaining a professional production environment for beta testing.*