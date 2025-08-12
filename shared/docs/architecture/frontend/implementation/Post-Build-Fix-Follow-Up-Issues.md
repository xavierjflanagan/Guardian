# Post-Build Fix Follow-Up Issues

**Created**: 2025-08-12  
**Context**: Issues identified during comprehensive build fixes but deferred for focused Phase 3 unblocking  
**Status**: Ready for systematic resolution

---

## 🚨 **CRITICAL - Must Fix Before Production**

### **Issue 1: Next.js 15 Build Export Failure**
**File**: `app/auth/auth-error/page.tsx`  
**Error**: Export encountered error during build process
**Root Cause**: Likely Next.js 15 async `searchParams` pattern incompatibility
```bash
Export encountered an error on /auth/auth-error/page: /auth/auth-error
digest: '1482798262'
```

**Impact**: 
- ❌ Production builds fail
- ❌ Deployment blocked
- ⚠️ Could affect CI/CD pipeline

**Recommended Fix**:
```typescript
// Current (potentially problematic):
export default async function AuthErrorPage({
  searchParams,
}: {
  searchParams: Promise<{ message?: string }>
}) {
  const params = await searchParams

// Alternative approach:
export default function AuthErrorPage({
  searchParams,
}: {
  searchParams: { message?: string }
}) {
  // Handle synchronously or use useSearchParams hook
```

**Priority**: 🔥 HIGH - Fix in Phase 3.0
**Effort**: 15-30 minutes
**Assignee**: Next developer working on auth flows

---

## 🔶 **MEDIUM - Fix in Phase 3.1** 

### **Issue 2: Test Infrastructure Improvements**

#### **2.1 ProfileSwitcher Test Design Issues**
**Files**: `__tests__/components/ProfileSwitcher.test.tsx`
**Current Status**: 11 failed, 5 passed tests

**Problems**:
1. **Non-unique test IDs**: Multiple avatars use same `data-testid="avatar"`
2. **Archived profile handling**: Test expects archived profiles hidden, but they're shown
3. **React key conflicts**: Duplicate profile IDs in emergency scenarios (✅ FIXED)

**Recommended Fixes**:
```typescript
// 1. Make test IDs more specific
- <Avatar data-testid="avatar" />
+ <Avatar data-testid={`avatar-${profile.id}`} />
+ <Avatar data-testid="current-profile-avatar" /> // For main display

// 2. Update test expectations  
- expect(screen.getByTestId('avatar')).toHaveTextContent('Jane Doe')
+ expect(screen.getByTestId('current-profile-avatar')).toHaveTextContent('Jane Doe')

// 3. Fix archived profile logic or test expectations
- expect(screen.queryByText('Archived User')).not.toBeInTheDocument()
+ expect(screen.getByText('Archived User')).toHaveClass('opacity-50') // If shown but dimmed
```

**Priority**: 🔶 MEDIUM - Quality improvement
**Effort**: 2-3 hours  
**Impact**: Better regression detection, cleaner test output

#### **2.2 Test Console Warning Management**
**Status**: ✅ WORKING - Console suppression implemented  
**Enhancement Needed**: Add test assertions to verify warnings are properly triggered

```typescript
// Add to useEventLogging tests:
it('should enforce rate limiting and track warnings', () => {
  // ... existing rate limiting test
  expect(global.getSuppressedWarnings()).toContain(
    expect.stringContaining('rate limit exceeded')
  );
});
```

**Priority**: 🔶 MEDIUM - Test completeness
**Effort**: 30 minutes

---

## 🔧 **LOW - Gradual Code Quality Improvements**

### **Issue 3: ESLint Warnings (41 remaining)**

#### **3.1 TypeScript `any` Types (25 warnings)**
**Strategy**: Replace with proper interfaces gradually during feature development

**High-Impact Files** (healthcare data flows):
```typescript
// lib/hooks/useEventLogging.ts - Medical audit logging
- const logEvent = (data: any) => { ... }
+ const logEvent = (data: MedicalAuditEvent) => { ... }

// components/DynamicSection.tsx - Medical data rendering  
- const data: any = section;
+ const data: MedicalSectionData = section;
```

**Priority**: 🔧 LOW - Incremental improvement
**Effort**: 4-6 hours total (spread over feature development)
**Impact**: Healthcare data safety, better IDE support

#### **3.2 React Hook Dependencies (5 warnings)**
**Pattern**: Add missing dependencies or wrap in `useCallback`

```typescript
// Pattern to fix:
const loadFlags = useCallback(async () => {
  // Implementation
}, [currentProfile, filters]); // Add all dependencies

useEffect(() => {
  loadFlags();
}, [loadFlags]); // Now stable reference
```

**Priority**: 🔧 LOW - Prevents subtle bugs
**Effort**: 1 hour
**Impact**: Prevents stale closures in medical data flows

---

## 📋 **Implementation Roadmap**

### **Phase 3.0 (Immediate - Before Feature Development)**
- [ ] **Fix Next.js build export issue** (30 min) - CRITICAL
- [ ] **Verify build passes completely** (15 min)
- [ ] **Update CI/CD if needed** (15 min)

### **Phase 3.1 (Within 1-2 weeks)**  
- [ ] **Improve ProfileSwitcher tests** (2-3 hours)
- [ ] **Add test warning assertions** (30 min)
- [ ] **Fix React hook dependencies** (1 hour)

### **Phase 3.x (Ongoing during feature development)**
- [ ] **Replace `any` types incrementally** (ongoing)
- [ ] **Monitor ESLint warning trends** (ongoing)
- [ ] **Enhance test coverage** (ongoing)

---

## 🏥 **Healthcare Application Considerations**

### **Risk Assessment**
- **Build Failure**: 🔥 HIGH - Could block deployments
- **Test Issues**: 🔶 MEDIUM - Affects development confidence  
- **Type Safety**: 🔧 LOW - Warnings guide gradual improvement

### **Compliance Impact**
- **HIPAA Audit Trail**: ✅ ENHANCED (error logging improved)
- **Medical Data Safety**: ⚠️ WARNINGS PRESENT (but non-blocking)
- **Development Velocity**: ✅ MAINTAINED (no blocking errors)

---

## 📊 **Success Metrics**

### **Phase 3.0 Success Criteria**
- [ ] `npm run build` completes successfully (0 errors)
- [ ] Production deployment possible
- [ ] CI/CD pipeline functional

### **Phase 3.1 Success Criteria**  
- [ ] Test suite >90% pass rate
- [ ] ESLint warnings <30 total
- [ ] No missing React hook dependencies

### **Ongoing Quality Metrics**
- [ ] TypeScript `any` usage trending downward
- [ ] Test coverage trending upward  
- [ ] Build time remaining stable

---

## 🔧 **Quick Reference Commands**

```bash
# Check current status
npm run -w @guardian/web typecheck  # Should pass
npm run -w @guardian/web lint       # 41 warnings expected  
npm run -w @guardian/web test       # Mixed results expected

# Debug build issue
npm run -w @guardian/web build      # Will fail on auth-error export

# Monitor progress
npm run -w @guardian/web lint | grep -c "Warning\|Error"
```

---

**Status**: Ready for systematic resolution during Phase 3 development  
**Next Action**: Fix Next.js build export issue before proceeding with Phase 3 features

---

*This document ensures no issues are forgotten and provides clear priorities for ongoing healthcare application development.*