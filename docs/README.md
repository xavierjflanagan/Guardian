# Guardian Documentation

> **Patient-owned healthcare data platform** - Secure, portable, and accessible medical records management

[![Status](https://img.shields.io/badge/Status-In%20Development-orange)](./project/roadmap.md)
[![License](https://img.shields.io/badge/License-TBD-lightgrey)](#)
[![Last Updated](https://img.shields.io/badge/Last%20Updated-Dec%202024-blue)](#)

---

## 🚀 Quick Start

**New to Guardian?** Start here:

1. **[Project Overview](PROJECT_OVERVIEW.md)** - Vision, mission, and goals
2. **[Developer Setup](guides/SETUP.md)** - Get up and running in 5 minutes
3. **[Architecture Overview](architecture/OVERVIEW.md)** - Technical foundation

---

## 📖 Documentation Navigation

### For Developers

| Document | Purpose | Time to Read |
|----------|---------|--------------|
| **[Developer Setup](guides/SETUP.md)** | Local development environment | 5 min |
| **[Supabase Setup](guides/supabase-setup.md)** | Database and auth configuration | 15 min |
| **[API Documentation](api/endpoints.md)** | Complete API reference guide | 15 min |
| **[Deployment Guide](guides/deployment.md)** | Production deployment procedures | 20 min |
| **[Troubleshooting Guide](guides/troubleshooting.md)** | Common issues and solutions | 10 min |
| **[Architecture Overview](architecture/OVERVIEW.md)** | System design and components | 10 min |
| **[Document Pipeline](architecture/pipeline.md)** | AI processing architecture | 15 min |
| **[Security & Compliance](architecture/SECURITY_COMPLIANCE.md)** | HIPAA, GDPR requirements | 10 min |

### For Product/Business

| Document | Purpose | Time to Read |
|----------|---------|--------------|
| **[Project Overview](PROJECT_OVERVIEW.md)** | Vision, mission, market opportunity | 5 min |
| **[Roadmap](ROADMAP.md)** | Development timeline and milestones | 10 min |
| **[Business Model](business/MODEL.md)** | Revenue streams and partnerships | 5 min |
| **[Brand Strategy](business/BRAND.md)** | Positioning and marketing approach | 5 min |

### For Contributors

| Document | Purpose | Time to Read |
|----------|---------|--------------|
| **[Protocol System](protocols/README.md)** | AI-driven session management | 5 min |
| **[Current Tasks](management/TASKS.md)** | Active development priorities | 3 min |
| **[Progress Log](PROGRESS_LOG.md)** | Recent developments and decisions | 5 min |
| **[Session Summary](SESSION_SUMMARY.md)** | Current work session status | 2 min |
| **[Decision Records](decisions/)** | Technical decision rationale | 10 min |

---

## 🏗️ Architecture at a Glance

```mermaid
graph TD
    A[User] -->|Uploads| B[Next.js Frontend]
    B -->|Auth & Data| C[Supabase]
    C -->|Database| D[PostgreSQL]
    C -->|Storage| E[File Storage]
    C -->|Auth| F[Authentication]
    B -->|Triggers| G[AI Pipeline]
    G -->|OCR & Analysis| H[Document Processing]
    H -->|Results| C
```

**Core Stack:** Next.js • Supabase • Vercel • TypeScript • Tailwind CSS

---

## 🎯 Current Status

**Phase:** MVP Prototype Development
**Progress:** Authentication ✅ | File Upload ✅ | AI Pipeline 🚧 | Dashboard 🚧

See [Progress Log](PROGRESS_LOG.md) for detailed updates.

---

## 📋 Common Tasks

### Development
```bash
# Start development server
npm run dev

# Run tests
npm test

# Deploy to staging
vercel --prod
```

### Documentation
```bash
# Update progress log
# Edit docs/PROGRESS_LOG.md after each session

# Review architecture decisions
# See docs/decisions/ for ADRs
```

---

## 🔍 Find What You Need

**Looking for...**
- **Setup instructions?** → [Developer Setup](guides/SETUP.md)
- **API documentation?** → [API Documentation](api/endpoints.md)
- **Deployment help?** → [Deployment Guide](guides/deployment.md)
- **Troubleshooting?** → [Troubleshooting Guide](guides/troubleshooting.md)
- **Business information?** → [Project Overview](PROJECT_OVERVIEW.md)
- **Current priorities?** → [Tasks](management/TASKS.md)
- **Technical decisions?** → [Decision Records](decisions/)

---

## 🤝 Contributing

1. Check [current tasks](management/TASKS.md) for priorities
2. Review [progress log](PROGRESS_LOG.md) for context
3. Follow [setup guide](guides/SETUP.md) for environment
4. Update [AI context](context/AI_context.md) after sessions

---

## 📞 Support

- **Issues:** Check [troubleshooting section](guides/supabase-setup.md#troubleshooting)
- **Questions:** Review [decision records](decisions/) for rationale
- **Updates:** See [progress log](PROGRESS_LOG.md) for latest changes

---

## 📈 Project Health

| Metric | Status | Target |
|--------|--------|--------|
| Documentation Coverage | 90% ✅ | 90% |
| Setup Time (new dev) | 15 min | 10 min |
| Broken Links | 0 ✅ | 0 |
| Outdated Content | <5% ✅ | <5% |
| Critical Gaps | 0 ✅ | 0 |

Last updated: December 2024