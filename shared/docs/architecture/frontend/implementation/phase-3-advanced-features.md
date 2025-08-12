# Phase 3: Advanced Features & Production Readiness

**Duration:** 3-4 weeks (Weeks 5-8)  
**Status:** 🚀 READY - All Prerequisites Complete  
**Goal:** Advanced healthcare workflows, performance optimization, and production readiness

## Prerequisites

**REQUIRED**:
- ✅ Phase 1: Foundation & Shell Implementation 
- ✅ Phase 1.5: Repository Reorganization (Monorepo Migration)
- ✅ Phase 2: Component Library Development
- ✅ **Phase 1.1: Architecture Cleanup** (COMPLETED 2025-08-12)

## **Critical Issues Integration from Build Fix** 
Following issues from [Post-Build-Fix-Follow-Up-Issues.md](./Post-Build-Fix-Follow-Up-Issues.md) are integrated into Phase 3 tasks:

## 📋 Phase 3 Progress Tracker

### **Week 1: Performance & Security Optimization**

#### **🔥 Task 3.0: Critical Build Issues** (PRIORITY - Before Feature Development)
- [x] ✅ **PNPM Migration: Standardize Package Manager** ([GitHub Issue #21](../../../../../../issues/21)) - **COMPLETED 2025-08-12**
  - [x] ✅ Update root `package.json` with `"packageManager": "pnpm@9.15.1"` (match lockfileVersion 9.0)
  - [x] ✅ Remove conflicting `package-lock.json` file
  - [x] ✅ Update CI workflows: `npm ci` → `pnpm install --frozen-lockfile`
  - [x] ✅ Update all workspace commands: `npm run -w` → `pnpm --filter @guardian/web run`
  - [x] ✅ Fix audit command: `pnpm audit --severity-level=high`
  - [x] ✅ Verify builds succeed with PNPM (Achieved: ~16s installs vs ~45s, 50%+ improvement confirmed)
- [x] ✅ **Fix Next.js 15 build export failure** (auth-error page async searchParams) - **COMPLETED 2025-08-12**
- [ ] **Verify production build passes completely** 
- [x] ✅ **Update CI/CD pipeline** for build compatibility - **COMPLETED 2025-08-12**
- [ ] **Complete Vercel deployment setup** ([Deployment Guide](./vercel-deployment-setup.md) | [GitHub Issue #22](../../../../../issues/22))
- [x] ✅ **Fix healthcare testing infrastructure** ([GitHub Issue #23](../../../../../issues/23)) - React 19 act() and Jest mocking issues **COMPLETED 2025-08-12**

#### **Task 3.1: Performance Optimization** (From Technical Debt)
- [ ] Realtime subscription scaling for large patient lists (50+ patients)
- [ ] Server-side fan-out or multiple channel strategy implementation
- [ ] Bundle analyzer configuration and performance monitoring
- [ ] Database query optimization and cursor-based pagination
- [ ] Performance budgets and automated alerting

#### **Task 3.2: Security Hardening** (From Technical Debt + Healthcare Compliance)
- [ ] Edge Functions for critical audit events (vs client-side logging)
- [ ] Advanced RLS policy optimization and testing
- [ ] PII detection and prevention automation
- [ ] HIPAA compliance validation and documentation
- [ ] Penetration testing preparation and security audit

#### **Task 3.3: Testing Framework Foundation** (Build on Completed Infrastructure)
- [x] ✅ Jest + React Testing Library setup (COMPLETED)
- [x] ✅ **React 19 act() wrapping fixes** for ProfileProvider async operations **COMPLETED 2025-08-12**
- [x] ✅ **Jest mocking configuration** for useEventLogging hooks **COMPLETED 2025-08-12**  
- [x] ✅ **Unique test IDs** for ProfileSwitcher component testing **COMPLETED 2025-08-12**
- [x] ✅ **Console warning suppression** for healthcare test scenarios **COMPLETED 2025-08-12**
- [ ] Unit tests for all providers and hooks (partially complete - core patterns established)
- [ ] Integration tests for real-time functionality
- [ ] Component testing with healthcare scenarios (foundation complete)

**Healthcare Testing Infrastructure Summary (Issue #23 - COMPLETED 2025-08-12)**:
- ✅ React 19 compatibility: Fixed async state update act() wrapping in ProfileProvider
- ✅ Jest mocking: Resolved circular import and hoisting issues in useEventLogging tests
- ✅ Component testing: Fixed duplicate test-id conflicts in ProfileSwitcher with unique ID strategy
- ✅ Error suppression: Added healthcare-specific console warning filters for test environments
- ✅ Test patterns: Established healthcare data testing patterns with PII sanitization validation

### **Week 2: CI/CD & Quality Gates**

#### **Task 3.4: Automated CI/CD Pipeline** (Deferred from Phase 1)
- [ ] GitHub Actions workflow with quality gates
- [ ] Performance budgets enforcement (<1MB bundle, <500ms load)
- [ ] Bundle size monitoring and analysis
- [ ] Lighthouse CI integration (>90 scores)
- [ ] **Fix React hook dependency warnings** (5 remaining)
- [ ] **Automated ESLint warning monitoring** (track trends)
- [ ] Automated accessibility testing

#### **Task 3.5: Performance Optimization**
- [ ] Virtual scrolling for timeline component
- [ ] Code splitting and lazy loading
- [ ] Image optimization and lazy loading
- [ ] TanStack Query cache optimization
- [ ] Memory leak prevention and monitoring

#### **Task 3.6: Capability Detection System** (Deferred from Phase 1)
- [ ] Device/browser capability detection
- [ ] Progressive enhancement patterns
- [ ] Offline functionality preparation
- [ ] Touch vs desktop interaction patterns
- [ ] Camera and file system access detection

### **Week 3: Advanced Healthcare Workflows**

#### **Task 3.7: Enhanced Profile Management**
- [ ] Advanced profile relationships (guardian, dependent)
- [ ] Profile permission management UI
- [ ] Consent flow for data sharing
- [ ] Profile switching analytics and optimization
- [ ] Large profile list virtualization

#### **Task 3.8: Document Processing Workflows**
- [ ] Batch document upload with progress tracking
- [ ] Document categorization and tagging
- [ ] OCR confidence threshold management
- [ ] Document merge and duplicate detection
- [ ] Advanced search and filtering

#### **Task 3.9: Timeline & Healthcare Journey**
- [ ] Interactive timeline with filtering
- [ ] Healthcare journey visualization
- [ ] Event correlation and grouping
- [ ] Timeline export functionality
- [ ] Medical history summary generation

### **Week 4: Production Readiness**

#### **Task 3.10: Accessibility Compliance**
- [ ] WCAG 2.1 AA compliance audit and fixes
- [ ] Screen reader optimization
- [ ] Keyboard navigation improvements
- [ ] High contrast mode support
- [ ] Focus management refinement

#### **Task 3.11: Security Hardening & Type Safety**
- [ ] Content Security Policy implementation
- [ ] Input sanitization audit
- [ ] Authentication token security review
- [ ] RLS policy testing and validation
- [ ] Security headers configuration
- [ ] **Replace TypeScript `any` types incrementally** (25 warnings - healthcare data safety)
- [ ] **Enhance medical data type interfaces** (improve IDE support and safety)

#### **Task 3.12: Monitoring & Analytics**
- [ ] Error monitoring integration (Sentry/LogRocket)
- [ ] Performance monitoring setup
- [ ] User analytics implementation
- [ ] Health check endpoints
- [ ] Application metrics dashboard

## 🏗️ Technical Implementation Details

### **Real-time Architecture**

```tsx
// hooks/useRealtime.ts - Enhanced real-time system
export function useRealtime() {
  const { currentProfile } = useProfile();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!currentProfile) return;

    // Documents processing updates
    const documentsChannel = supabase
      .channel(`documents:${currentProfile.id}`)
      .on('postgres_changes', 
        { 
          event: '*', 
          schema: 'public', 
          table: 'documents',
          filter: `patient_id=eq.${currentProfile.patient_id}`
        },
        (payload) => {
          // Invalidate relevant queries
          queryClient.invalidateQueries({
            queryKey: ['documents', currentProfile.id]
          });
          
          // Show processing status updates
          if (payload.eventType === 'UPDATE') {
            showProcessingNotification(payload.new);
          }
        }
      )
      .subscribe();

    // Timeline events for healthcare journey
    const timelineChannel = supabase
      .channel(`timeline:${currentProfile.id}`)
      .on('postgres_changes',
        {
          event: 'INSERT',
          schema: 'public', 
          table: 'healthcare_timeline_events',
          filter: `patient_id=eq.${currentProfile.patient_id}`
        },
        (payload) => {
          queryClient.invalidateQueries({
            queryKey: ['timeline', currentProfile.id]
          });
          
          // Show new healthcare event notification
          showTimelineNotification(payload.new);
        }
      )
      .subscribe();

    return () => {
      documentsChannel.unsubscribe();
      timelineChannel.unsubscribe();
    };
  }, [currentProfile, queryClient]);
}
```

### **Error Boundary System**

```tsx
// components/ErrorBoundary.tsx - Production-ready error handling
import { ErrorBoundary } from 'react-error-boundary';
import { logUserEvent } from '@/lib/analytics';

function ErrorFallback({ 
  error, 
  resetErrorBoundary, 
  componentStack 
}: ErrorFallbackProps) {
  const { currentProfile } = useProfile();
  
  useEffect(() => {
    // Log error for monitoring
    logUserEvent('error_boundary_triggered', {
      error: error.message,
      componentStack: componentStack?.slice(0, 500), // Truncate for storage
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent,
      url: window.location.href
    });
  }, [error, componentStack, currentProfile]);

  return (
    <div className="error-fallback min-h-[400px] flex flex-col items-center justify-center p-8">
      <div className="text-center max-w-md">
        <div className="w-16 h-16 mx-auto mb-4 bg-red-100 rounded-full flex items-center justify-center">
          <ExclamationTriangleIcon className="w-8 h-8 text-red-600" />
        </div>
        
        <h2 className="text-xl font-semibold text-gray-900 mb-2">
          Something went wrong
        </h2>
        
        <p className="text-gray-600 mb-6">
          We're sorry, but something unexpected happened. Your data is safe.
        </p>
        
        <div className="space-y-3">
          <button 
            onClick={resetErrorBoundary}
            className="w-full bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
          >
            Try again
          </button>
          
          <button 
            onClick={() => window.location.reload()}
            className="w-full bg-gray-100 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-200"
          >
            Refresh page
          </button>
        </div>
        
        {process.env.NODE_ENV === 'development' && (
          <details className="mt-4 text-left">
            <summary className="cursor-pointer text-sm text-gray-500">
              Error details (development only)
            </summary>
            <pre className="mt-2 text-xs text-gray-700 bg-gray-100 p-3 rounded overflow-auto">
              {error.message}
            </pre>
          </details>
        )}
      </div>
    </div>
  );
}

export function GuardianErrorBoundary({ 
  children, 
  level = 'component' 
}: GuardianErrorBoundaryProps) {
  return (
    <ErrorBoundary
      FallbackComponent={ErrorFallback}
      onError={(error, errorInfo) => {
        // Send to error monitoring service
        if (typeof window !== 'undefined' && window.Sentry) {
          window.Sentry.captureException(error, {
            contexts: {
              errorBoundary: {
                componentStack: errorInfo.componentStack,
                level: level
              }
            }
          });
        }
      }}
      onReset={() => {
        // Clear any error state, refresh queries
        queryClient.invalidateQueries();
      }}
    >
      {children}
    </ErrorBoundary>
  );
}
```

### **Testing Strategy**

```tsx
// tests/utils/test-utils.tsx - Healthcare testing utilities
import { render, RenderOptions } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ProfileProvider } from '@/app/providers/ProfileProvider';

// Mock profile for testing
export const mockProfile = {
  id: 'test-profile-id',
  display_name: 'Test Patient',
  patient_id: 'test-patient-id',
  profile_type: 'self' as const
};

// Mock healthcare data
export const mockTimelineEvents = [
  {
    id: '1',
    type: 'appointment' as const,
    title: 'Cardiology Consultation',
    date: new Date('2025-01-15'),
    provider: 'Dr. Smith',
    severity: 'medium' as const
  }
];

interface CustomRenderOptions extends Omit<RenderOptions, 'wrapper'> {
  profile?: typeof mockProfile;
  queryClient?: QueryClient;
}

export function renderWithProviders(
  ui: React.ReactElement,
  options: CustomRenderOptions = {}
) {
  const { 
    profile = mockProfile, 
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } }
    }),
    ...renderOptions 
  } = options;

  function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <ProfileProvider initialProfile={profile}>
          {children}
        </ProfileProvider>
      </QueryClientProvider>
    );
  }

  return render(ui, { wrapper: Wrapper, ...renderOptions });
}

// Healthcare-specific matchers
expect.extend({
  toHaveConfidenceScore(received, expectedScore) {
    const score = received.getAttribute('data-confidence-score');
    return {
      pass: score === expectedScore.toString(),
      message: () => `Expected confidence score ${expectedScore}, got ${score}`
    };
  }
});
```

### **CI/CD Pipeline**

```yaml
# .github/workflows/frontend-quality.yml - Production CI/CD with PNPM
name: Guardian Frontend Quality Gates

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  quality-gates:
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
          
      - name: Install dependencies
        run: pnpm install --frozen-lockfile
        
      - name: Type checking
        run: pnpm --filter @guardian/web run typecheck
        
      - name: Linting
        run: pnpm --filter @guardian/web run lint
        
      - name: Unit tests
        run: pnpm --filter @guardian/web run test:coverage
        
      - name: Build application
        run: pnpm --filter @guardian/web run build
        
      - name: Bundle size analysis
        run: |
          pnpm run -w @guardian/web analyze:bundle
          node scripts/check-bundle-size.js
          
  performance-testing:
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
      
      - name: Install and build
        run: |
          pnpm install --frozen-lockfile
          pnpm run -w @guardian/web build
          pnpm run -w @guardian/web start &
          sleep 10
          
      - name: Lighthouse CI
        run: |
          pnpm add -g @lhci/cli
          lhci autorun --collect.numberOfRuns=3
        env:
          LHCI_GITHUB_APP_TOKEN: ${{ secrets.LHCI_GITHUB_APP_TOKEN }}
          
  accessibility-testing:
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
      - name: Accessibility audit
        run: |
          pnpm install --frozen-lockfile
          pnpm run -w @guardian/web build
          pnpm run -w @guardian/web start &
          sleep 10
          npx @axe-core/cli http://localhost:3000 --tags wcag2a,wcag2aa
          
  security-testing:
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
      - name: Security audit
        run: |
          pnpm install --frozen-lockfile
          pnpm audit --severity-level=high
          pnpm --filter @guardian/web run security:scan
```

## 🎯 Success Criteria

### **Week 1: Infrastructure Complete**
- [ ] Real-time subscriptions working reliably
- [ ] Error boundaries protecting all major components
- [ ] Testing framework with >80% coverage for new code
- [ ] Zero production errors in error monitoring

### **Week 2: CI/CD & Performance**
- [ ] Automated pipeline with all quality gates passing
- [ ] Bundle size <1MB, page load <500ms
- [ ] Lighthouse scores >90 across all metrics
- [ ] Performance monitoring active

### **Week 3: Advanced Features**
- [ ] Enhanced profile management fully functional
- [ ] Document workflows optimized and tested
- [ ] Timeline provides excellent user experience
- [ ] All healthcare workflows complete

### **Week 4: Production Ready**
- [ ] WCAG 2.1 AA compliance verified
- [ ] Security audit passing
- [ ] Monitoring and analytics operational
- [ ] Ready for user testing and launch

## 📊 Quality Gates

### **Performance Budgets**
- **Bundle Size**: <1MB initial load
- **Page Load**: <500ms (Lighthouse)
- **UI Updates**: <100ms response time
- **Memory Usage**: <50MB baseline
- **Network Requests**: <10 initial page load

### **Accessibility Requirements**
- **WCAG 2.1 AA**: Full compliance required
- **Screen Reader**: All content accessible
- **Keyboard Navigation**: Complete functionality
- **Color Contrast**: 4.5:1 minimum ratio
- **Focus Management**: Logical tab order

### **Testing Coverage**
- **Unit Tests**: >90% coverage for utilities and hooks
- **Integration Tests**: All major user flows covered
- **Component Tests**: All components with healthcare scenarios
- **E2E Tests**: Critical paths automated
- **Accessibility Tests**: Automated in CI/CD

### **Security Standards**
- **Dependency Audit**: No high/critical vulnerabilities
- **Content Security Policy**: Implemented and tested
- **Input Sanitization**: All user inputs validated
- **Authentication**: Secure token handling
- **Authorization**: RLS policies enforced

## 🚀 Post-Phase 3 Readiness

After Phase 3 completion, Guardian will be:

- **Production Ready**: Fully tested, monitored, and secure
- **Scalable**: Monorepo structure supporting multi-platform growth
- **Maintainable**: Comprehensive testing and documentation
- **Compliant**: Meeting healthcare accessibility and security standards
- **Performant**: Optimized for healthcare data workflows
- **User Ready**: Prepared for beta testing and user feedback

---

## 📋 Implementation Checklist

### **Before Starting Phase 3**
- [ ] ✅ Phase 1: Foundation complete
- [ ] ✅ Phase 2: Component library complete  
- [ ] ❌ **Phase 1.5: Monorepo migration complete** (REQUIRED)

### **Phase 3 Execution Order**
1. **Week 1**: Complete deferred infrastructure items
2. **Week 2**: Implement CI/CD and performance optimization
3. **Week 3**: Build advanced healthcare workflows
4. **Week 4**: Achieve production readiness and compliance

### **Ready for Launch**
After Phase 3, Guardian will be ready for:
- User acceptance testing
- Beta user deployment  
- Production launch preparation
- Multi-platform expansion (mobile, provider portal)

---

## 🔧 Technical Debt Integration

Phase 3 incorporates medium-priority technical debt items identified in external code reviews:

### **From GPT-5 Frontend Review (2025-08-09)**
- **Realtime Scaling** → Task 3.1 (Performance Optimization)
- **Event Logging Security** → Task 3.2 (Security Hardening) 
- **Bundle Analyzer Configuration** → Task 3.1 (Performance Monitoring)
- **Import Path Consistency** → Task 3.3 (Development Tooling)

### **Healthcare Compliance Items**
- **HIPAA Compliance Automation** → Task 3.2 (Security Hardening)
- **Advanced PII Detection** → Task 3.2 (Security Hardening)
- **Audit Event Integrity** → Task 3.2 (Edge Functions for critical events)

**Technical Debt Registry**: See [technical-debt.md](../../project/technical-debt.md) for detailed tracking

---

**Phase 3 Status**: 🚀 **READY** - All prerequisites complete. Phase 1.1 Architecture Cleanup finished 2025-08-12.

## **Implementation Priority**

**Phase 3.0 (Immediate)**: Fix critical Next.js build issue blocking production deployment  
**Phase 3.1-3.2**: Continue with performance optimization and security hardening  
**Phase 3.3+**: Advanced features and production readiness  

**Note**: Follow-up issues from build fixes are systematically integrated above to ensure no technical debt carries forward.