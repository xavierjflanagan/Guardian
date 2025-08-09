# Guardian Healthcare Platform

**Patient-owned healthcare data platform** - Secure, portable, and accessible medical records management with AI-powered insights

> **Current Status:** Phase 1 Complete - Ready for Phase 3 Advanced Features  
> **Architecture:** Multi-platform monorepo with Next.js, Supabase, and AI processing pipeline

[![Status](https://img.shields.io/badge/Status-Phase%201%20Complete-green)](shared/docs/architecture/frontend/implementation/phase-1-foundation.md)
[![Documentation](https://img.shields.io/badge/Documentation-Complete-green)](shared/docs/README.md)
[![Architecture](https://img.shields.io/badge/Architecture-Monorepo-blue)](#monorepo-structure)

---

## 🏗️ Monorepo Structure

Guardian is organized as a modern monorepo supporting multiple platforms and shared packages:

```
Guardian-Cursor/
├── apps/                          # Applications
│   ├── web/                       # ✅ Patient portal (Next.js)
│   ├── mobile/                    # 🔄 React Native app (planned)
│   ├── provider-portal/           # 🔄 Provider interface (planned)
│   └── admin-portal/              # 🔄 Admin dashboard (planned)
├── packages/                      # Shared packages
│   ├── ui/                        # ✅ Component library
│   ├── database/                  # ✅ Supabase clients & types
│   ├── auth/                      # 🔄 Shared auth logic
│   ├── clinical-logic/            # 🔄 Healthcare business logic
│   └── utils/                     # 🔄 Shared utilities
├── services/                      # Backend services
│   └── supabase/                  # ✅ Edge functions & database
└── shared/                        # Shared resources
    ├── docs/                      # ✅ Documentation
    ├── types/                     # ✅ Global TypeScript types
    └── config/                    # 🔄 Shared configuration
```

---

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ and npm
- Git

### Development Setup

1. **Clone and install:**
   ```bash
   git clone https://github.com/xavierjflanagan/Guardian.git
   cd Guardian-Cursor
   npm install
   ```

2. **Start the web application:**
   ```bash
   npm run dev
   # Starts Next.js dev server on http://localhost:3000
   ```

3. **Build all packages:**
   ```bash
   npm run build
   # Builds all workspaces
   ```

### Monorepo Commands

```bash
# Work with specific app
npm run dev --workspace=@guardian/web
npm run build --workspace=@guardian/web

# Work with specific package  
npm run build --workspace=@guardian/ui
npm run dev --workspace=@guardian/database

# Clean install everything
npm run fresh-install
```

---

## 📚 Documentation Hub

**For comprehensive documentation:** **[📖 Complete Documentation Hub](shared/docs/README.md)**

### Quick Navigation
- 🚀 **[Project Overview](shared/docs/getting-started/overview.md)** - Vision, mission, and goals
- ⚙️ **[Developer Setup](shared/docs/guides/setup/developer-setup.md)** - Complete development environment setup
- 🏗️ **[Architecture Guide](shared/docs/architecture/system-design.md)** - System design and technical foundation  
- 📋 **[Current Tasks](shared/docs/management/TASKS.md)** - Active development priorities
- 🗺️ **[Roadmap](shared/docs/project/roadmap.md)** - Development timeline and milestones
- 🔧 **[Troubleshooting](shared/docs/guides/operations/troubleshooting.md)** - Common issues and solutions

### Phase-Specific Documentation
- ✅ **[Phase 1: Foundation](shared/docs/architecture/frontend/implementation/phase-1-foundation.md)** - Complete ✅
- ✅ **[Phase 2: Components](shared/docs/architecture/frontend/implementation/phase-2-components.md)** - Complete  
- 🚀 **[Phase 3: Advanced Features](shared/docs/architecture/frontend/implementation/phase-3-advanced-features.md)** - Ready to start

---

## 🎯 Current Status

**Development Phase:** Phase 1 Complete - Ready for Phase 3 Advanced Features  
**Progress:** Foundation ✅ | Integration & Events ✅ | Components ✅ | Monorepo ✅ | Advanced Features 🚀

### Completed
- ✅ **Phase 1** - Foundation & Shell Implementation (Complete)
  - Week 1: Core Infrastructure (Provider hierarchy, shell layout, profile switching)
  - Week 2: Integration & Events (Real-time, event logging, error boundaries, CI/CD)
- ✅ **Phase 1.5** - Repository Reorganization (Monorepo migration complete)
- ✅ **Phase 2** - Component Library Development (Healthcare-optimized UI components)
- ✅ **Authentication & Authorization** - Magic link auth with multi-profile support
- ✅ **Document Upload & Processing** - AI-powered OCR with confidence scoring  
- ✅ **Database Foundation** - 47 tables, RLS policies, edge functions

### Phase 1 Week 2 Deliverables (Now Complete)
- ✅ **Real-time Integration** - Document/timeline subscriptions with connection monitoring
- ✅ **Event Logging Implementation** - Privacy-aware capture with client-side rate limiting
- ✅ **Error Boundaries** - Comprehensive error handling with graceful recovery
- ✅ **CI/CD Quality Gates** - GitHub Actions with performance/accessibility testing

### Ready to Begin
- 🚀 **Phase 3 Advanced Features** - Production readiness, testing framework, advanced UI patterns

**Latest Update:** Phase 1 Foundation & Shell Implementation is now **COMPLETE**. All Week 2 Integration & Events tasks have been implemented including real-time subscriptions, comprehensive error boundaries, privacy-aware event logging, and CI/CD quality gates. Ready to proceed with Phase 3 Advanced Features.

---

## 💻 Technology Stack

### Frontend
- **Web App:** Next.js 15, React 19, TypeScript, Tailwind CSS
- **Component Library:** Custom healthcare-optimized components
- **State Management:** TanStack Query with healthcare optimizations

### Backend  
- **Database:** Supabase (PostgreSQL) with Row Level Security
- **Auth:** Supabase Auth with magic link + PKCE flow
- **Storage:** Supabase Storage with user-isolated buckets
- **Edge Functions:** Deno runtime for document processing

### AI & Processing
- **OCR:** Google Cloud Vision (cost-optimized)
- **AI Analysis:** GPT-4o Mini for medical data extraction
- **Pipeline:** Vision + OCR safety net (~85-90% cost reduction vs Textract)

### DevOps & Infrastructure
- **Monorepo:** npm workspaces with proper package isolation
- **Deployment:** Vercel for web app, Supabase for backend
- **Monitoring:** Planned error tracking and performance monitoring

---

## 🤝 Contributing

1. **Check current priorities:** [Task Management](shared/docs/management/TASKS.md)
2. **Review recent updates:** [Progress Log](shared/docs/PROGRESS_LOG.md)  
3. **Set up environment:** [Developer Setup Guide](shared/docs/guides/setup/developer-setup.md)
4. **Understand architecture:** [System Design](shared/docs/architecture/system-design.md)

### Development Workflow
- Follow [Phase 3 Implementation Plan](shared/docs/architecture/frontend/implementation/phase-3-advanced-features.md)
- Maintain healthcare data privacy and security standards
- Test across multiple profiles and healthcare scenarios
- Update documentation for significant changes

---

## 📄 License & Compliance

- **License:** ISC (see package.json)
- **Healthcare Compliance:** HIPAA, GDPR, Privacy Act 1988 ready
- **Security:** End-to-end encryption, RLS policies, audit logging
- **Privacy:** Patient-owned data, user-controlled sharing

---

## 📞 Support & Resources

- **Issues:** [Troubleshooting Guide](shared/docs/guides/operations/troubleshooting.md)
- **Architecture Questions:** [Decision Records](shared/docs/architecture/decisions/)
- **Setup Help:** [Developer Setup](shared/docs/guides/setup/developer-setup.md)
- **Progress Updates:** [Progress Log](shared/docs/PROGRESS_LOG.md)

---

*Built with ❤️ for patient-owned healthcare data*