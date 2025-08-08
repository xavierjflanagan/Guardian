# Guardian Frontend Implementation Guide

**Purpose:** Step-by-step implementation instructions for Guardian v7 frontend  
**Timeline:** 8 weeks to "Most Valuable Product"  
**Framework:** Next.js 15+ with React 19  

---

## Implementation Overview

This guide provides detailed instructions for implementing the unified Guardian frontend architecture across four distinct phases.

### Prerequisites
- ✅ Database foundation deployed (47 tables, 917 functions)
- ✅ Next.js application shell exists (`guardian-web/`)
- ✅ Supabase integration configured
- ✅ Basic authentication working

---

## Phase-by-Phase Implementation

### [Phase 1: Foundation & Shell](./phase-1-foundation.md) (Weeks 1-2)
**Status:** Next Priority ⚡

**Key Tasks:**
- Create single Providers wrapper with unified composition
- Set up TanStack Query with healthcare-optimized defaults  
- Implement profile switching infrastructure with profile_id standardization
- Configure real-time Supabase integration (documents table only)
- Establish user_events schema and PII-safe logging
- Set up CI pipeline with performance budgets and quality gates

**Deliverables:**
- [ ] Single Providers wrapper implemented
- [ ] TanStack Query configured with SSR hydration
- [ ] Profile switcher with profile_id consistency
- [ ] Real-time subscriptions (documents only)
- [ ] Event logging with strict schema
- [ ] CI pipeline with Lighthouse and bundle analysis

### [Phase 2: Component Library](./phase-2-components.md) (Weeks 3-4)

**Key Tasks:**
- Build standardized component library
- Implement platform-aware component interfaces
- Create data display components
- Set up component testing framework
- Document component APIs

**Deliverables:**
- [ ] Core data display components
- [ ] Document processing components
- [ ] Profile management components
- [ ] Component testing suite
- [ ] Storybook documentation

### [Phase 3: Feature Assembly](./phase-3-features.md) (Weeks 5-6)

**Key Tasks:**
- Implement all four main tabs
- Integrate real-time processing updates
- Build timeline with virtual scrolling
- Create AI context preparation
- Enable cross-tab data sharing

**Deliverables:**
- [ ] Dashboard tab (Value)
- [ ] Documents tab (Trust)
- [ ] Timeline tab (Narrative)
- [ ] Insights tab (Intelligence)
- [ ] Cross-tab navigation

### [Phase 4: Polish & Production](./phase-4-polish.md) (Weeks 7-8)

**Key Tasks:**
- UI polish and animations
- Performance optimization
- Accessibility compliance
- Error handling robustness
- Production deployment preparation

**Deliverables:**
- [ ] Complete UI polish
- [ ] Performance benchmarks met
- [ ] WCAG 2.1 AA compliance
- [ ] Production deployment ready
- [ ] User testing preparation

---

## Development Environment Setup

### Required Tools
```bash
# Node.js and package manager
node --version  # v18+ required
npm --version   # v9+ recommended

# Development tools
npx --version   # For Next.js commands
```

### Project Setup
```bash
# Navigate to Guardian web application
cd guardian-web

# Install dependencies
npm install

# Verify environment
npm run dev  # Should start on localhost:3000
```

### Environment Configuration
```bash
# Copy environment template
cp .env.example .env.local

# Required environment variables
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

---

## Unified Technical Principles

These principles guide all implementation decisions across the 8-week development cycle:

### 1. Unified Provider Composition
```tsx
// Single composition point - app/providers.tsx
<AuthProvider>
  <ProfileProvider>
    <PrivacyProvider>
      <QueryClientProvider client={queryClient}>
        <NotificationProvider>
          {children}
        </NotificationProvider>
      </QueryClientProvider>
    </PrivacyProvider>
  </ProfileProvider>  
</AuthProvider>
```

### 2. TanStack Query Standards
```tsx
// Healthcare-optimized defaults
staleTime: 5 * 60 * 1000,  // 5min (clinical data changes slowly)
gcTime: 30 * 60 * 1000,    // 30min (offline scenarios)
retry: 3,                  // Healthcare reliability critical
```

### 3. Profile-First Data Architecture
```tsx
// All hooks standardized on profile_id
function useDocuments(profileId: string) { ... }        // Profile-owned data
function useTimeline(profileId: string) { ... }         // Resolves to patient_id(s) internally
// Clinical data queries use patient_id, but hooks remain profile-scoped
```

### 4. PII-Safe Event Logging
```tsx
interface UserEvent {
  id: string;
  action: string;
  metadata: JsonValue; // No PII ever
  profile_id: string;
  session_id: string;
  timestamp: string;
  privacy_level: 'public' | 'internal' | 'sensitive';
}
```

### 5. Quality Gates Enforcement
- Bundle size <1MB enforced in CI
- Lighthouse scores >90 across all metrics  
- WCAG 2.1 AA compliance required
- Zero TypeScript errors in production builds

---

## Implementation Standards

### Code Quality Standards
- **TypeScript:** Strict mode enabled, no `any` types
- **Testing:** Jest + React Testing Library for all components
- **Linting:** ESLint with custom healthcare rules
- **Formatting:** Prettier with project configuration
- **Documentation:** JSDoc comments for all public APIs

### Performance Standards
- **Load Time:** <500ms initial page load
- **Update Time:** <100ms for real-time updates
- **Bundle Size:** <1MB initial bundle
- **Lighthouse Score:** >90 across all metrics
- **Mobile Performance:** 60fps on mid-range devices

### Accessibility Standards
- **WCAG 2.1 AA:** Full compliance required
- **Screen Readers:** Comprehensive ARIA support
- **Keyboard Navigation:** All features keyboard accessible
- **Color Contrast:** 4.5:1 minimum ratio
- **Focus Management:** Logical tab order

### Security Standards
- **Data Handling:** All sensitive data encrypted in transit
- **Authentication:** Proper token handling and refresh
- **Authorization:** RLS policies enforced on frontend
- **Input Validation:** All user inputs sanitized
- **Audit Logging:** All data access logged

---

## Testing Strategy

### Unit Testing
```bash
# Run all tests
npm run test

# Run with coverage
npm run test:coverage

# Watch mode for development
npm run test:watch
```

### Integration Testing
```bash
# End-to-end testing with Playwright
npm run test:e2e

# Component integration testing
npm run test:integration
```

### Performance Testing
```bash
# Lighthouse CI testing with quality gates
npm run test:lighthouse

# Next.js bundle analysis (preferred for this repo)
npm run analyze:bundle    # Uses @next/bundle-analyzer
npm run analyze:verbose   # Detailed webpack bundle analysis

# TanStack Query cache testing
npm run test:query-cache

# Accessibility testing
npm run test:a11y

# Performance monitoring
npm run perf:profile     # React DevTools profiler data
npm run perf:memory      # Memory usage analysis
```

**Bundle Analysis Setup:**
```javascript
// next.config.js - Add bundle analyzer
const withBundleAnalyzer = require('@next/bundle-analyzer')({
  enabled: process.env.ANALYZE === 'true',
});

module.exports = withBundleAnalyzer({
  // Your Next.js config
  experimental: {
    optimizeCss: true,
  },
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback.fs = false;
    }
    return config;
  },
});

// package.json scripts
{
  "scripts": {
    "analyze:bundle": "ANALYZE=true npm run build",
    "analyze:verbose": "npx webpack-bundle-analyzer .next/static/chunks/*.js",
    "build:analyze": "npm run build && npm run analyze:bundle"
  }
}
```

---

## Deployment Pipeline

### Development Workflow
```bash
# Start development server
npm run dev

# Type checking
npm run type-check

# Linting
npm run lint

# Build for production
npm run build
```

### Production Deployment
```bash
# Build optimized production bundle
npm run build

# Start production server
npm start

# Health check
curl http://localhost:3000/api/health
```

---

## Common Issues & Solutions

### Build Issues
**Problem:** TypeScript compilation errors
**Solution:** Check type definitions and update dependencies

**Problem:** Bundle size too large
**Solution:** Use dynamic imports and code splitting

### Runtime Issues
**Problem:** Real-time subscriptions not working
**Solution:** Check Supabase connection and RLS policies

**Problem:** Profile switching not updating data
**Solution:** Verify ProfileContext updates and component re-renders

### Performance Issues
**Problem:** Timeline scrolling is laggy
**Solution:** Implement virtual scrolling with React Window

**Problem:** Component re-renders too frequently
**Solution:** Use React.memo and useMemo for expensive computations

---

## Support & Resources

### Documentation
- [Component Library](../components/) - Individual component specifications
- [Specifications](../specifications/) - Technical architecture details
- [Guides](../guides/) - Best practices and patterns

### Development Support
- **Code Reviews:** All PRs require review before merge
- **Pair Programming:** Available for complex implementation
- **Architecture Decisions:** Document in ADR format
- **Performance Monitoring:** Continuous monitoring in production

---

*For phase-specific implementation details, refer to the individual phase documentation files.*