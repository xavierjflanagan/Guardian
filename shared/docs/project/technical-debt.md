# Technical Debt Registry

**Purpose:** Centralized tracking of technical debt items for Guardian v7  
**Last updated:** 2025-08-12 (Major Phase 1.1 debt resolution)  
**Audience:** Solo founder, future developers  
**Status:** Active tracking system

---

## **Current Technical Debt Overview**

| Priority | Item | Impact | Effort | Trigger | Status |
|----------|------|--------|--------|---------|---------|
| ✅ RESOLVED | [UI Component Duplication](#ui-component-duplication) | Code drift, inconsistent UX | 2-3 hours | Phase 3 start | ✅ **COMPLETED 2025-08-12** |
| ✅ RESOLVED | [Missing Testing Framework](#missing-testing-framework) | High risk for healthcare app | 1-2 hours | Phase 3 start | ✅ **COMPLETED 2025-08-12** |
| ✅ RESOLVED | [RPC Function Production Hardening](#rpc-function-production-hardening) | Scale/performance concerns | 1-2 hours | 1000+ documents | ✅ **COMPLETED 2025-08-12** |
| 🔴 HIGH | [Next.js Build Export Failure](#nextjs-build-export-failure) | Blocks production deployment | 30 min | Immediate | 🚨 **CRITICAL** |
| 🔴 HIGH | [Performance Monitoring](#performance-monitoring) | Can't detect production issues | 2-3 days | 100+ active users | 📋 Documented |
| 🟡 MEDIUM | [Event Logging Security](#event-logging-security) | Audit event integrity | 1-2 hours | Production launch | 📋 Phase 3 |
| 🟡 MEDIUM | [Realtime Scaling](#realtime-scaling) | Performance with large patient lists | 2-3 hours | 50+ patients | 📋 Phase 3 |
| 🟡 MEDIUM | Security Hardening Audit | Compliance gaps | 1-2 days | Before production launch | 📋 Planned |
| 🟢 LOW | Scalability Architecture Review | Future scaling concerns | 1 week | 10,000+ users | 📋 Planned |
| 🟢 LOW | [Import Path Consistency](#import-path-consistency) | Bundle bloat risk | 1 hour | Ongoing | 📋 Monitoring |

---

## **Priority Classification**

### 🔴 **HIGH PRIORITY** 
- **Blocks production readiness** or **user experience**
- **Security vulnerabilities** or **data integrity risks**
- **Performance issues** affecting current users

### 🟡 **MEDIUM PRIORITY**
- **Future scalability concerns** (6+ months out)
- **Developer experience** improvements
- **Compliance** nice-to-haves beyond minimum requirements

### 🟢 **LOW PRIORITY**
- **Architecture improvements** for maintainability
- **Documentation gaps** (non-critical)
- **Tooling upgrades** without immediate business impact

---

## **Detailed Debt Items**

### ✅ UI Component Duplication (RESOLVED 2025-08-12)
- **Location:** `apps/web/components/shared` vs `packages/ui/components` 
- **Issue:** Avatar, Dropdown, ConfidenceIndicator, MedicalCard existed in both locations
- **Resolution:** ✅ Standardized on `packages/ui`, updated all imports, removed duplicates
- **Outcome:** Single source of truth established, zero duplicate components

### ✅ Missing Testing Framework (RESOLVED 2025-08-12) 
- **Location:** `apps/web/package.json` (placeholder test scripts)
- **Issue:** No Jest/RTL setup despite being healthcare-critical application  
- **Resolution:** ✅ Installed Jest + React Testing Library + healthcare test patterns
- **Outcome:** Full testing infrastructure with PII sanitization and console suppression

### ✅ RPC Function Production Hardening (RESOLVED 2025-08-12)
- **Location:** `supabase/migrations/021_phase1_rpc_stubs.sql` → `022_production_rpc_hardening.sql`
- **Issue:** Well-implemented but needed pagination, explicit ordering, schema qualification
- **Resolution:** ✅ Added cursor-based pagination, deterministic ordering, explicit schema refs
- **Outcome:** Production-ready functions handling 1000+ documents efficiently

### Next.js Build Export Failure
- **Location:** `apps/web/app/auth/auth-error/page.tsx`
- **Issue:** Next.js 15 async `searchParams` pattern causes export failures
- **Risk:** ❌ **BLOCKS PRODUCTION DEPLOYMENT**
- **Solution:** Fix async searchParams pattern or refactor to synchronous approach
- **Effort:** 30 minutes (code change + build verification)

### Event Logging Security
- **Location:** `apps/web/lib/hooks/useEventLogging.ts`
- **Issue:** Client-side inserts to user_events rely solely on RLS policies
- **Risk:** Audit event tampering, non-repudiation concerns for healthcare compliance
- **Solution:** Edge Functions for critical audit events vs client-side logging
- **Effort:** 1-2 hours (Edge Function + client-side fallback pattern)

### Realtime Scaling
- **Location:** `apps/web/lib/hooks/useRealtime.ts`
- **Issue:** Single channel with patient list filters may not scale beyond 50 patients
- **Risk:** Subscription performance degradation, connection instability
- **Solution:** Server-side fan-out or multiple smaller channels strategy
- **Effort:** 2-3 hours (architecture + implementation + testing)

### Import Path Consistency
- **Location:** Throughout `apps/web` codebase
- **Issue:** Type vs value imports may cause bundle bloat as monorepo evolves
- **Risk:** Increased bundle size, slower builds, runtime performance  
- **Solution:** ESLint rules + automated monitoring for type-only imports
- **Effort:** 1 hour (setup + documentation)

### Performance Monitoring
- **File:** [technical-debt/performance-monitoring.md](../technical-debt/performance-monitoring.md)
- **GitHub Issue:** [Create via: `claude code create-issue --title "Performance Monitoring Infrastructure" --template technical-debt`]
- **Business Impact:** Can't detect performance regressions before users complain
- **Implementation Plan:** 3-phase rollout (monitoring → alerts → automation)

### Security Hardening Audit
- **File:** [technical-debt/security-hardening.md](../technical-debt/security-hardening.md)
- **Trigger:** Before public launch or first 1,000 users
- **Scope:** Penetration testing, RLS policy audit, secret management review

### Scalability Architecture Review  
- **File:** [technical-debt/scalability-planning.md](../technical-debt/scalability-planning.md)
- **Trigger:** When approaching 10,000+ users or 1M+ database records
- **Scope:** Database partitioning, caching strategy, multi-region deployment

---

## **Debt Resolution Process**

### **1. Identification**
- Document in appropriate `technical-debt/[item].md` file
- Add to this registry with priority classification
- Create GitHub issue if HIGH priority

### **2. Prioritization** 
- **Business trigger:** When does this become critical?
- **Risk assessment:** What happens if we don't address it?
- **Effort estimation:** How long will it take to resolve?

### **3. Implementation**
- Move from "Documented" → "In Progress" → "Resolved"
- Update relevant project documentation
- Close GitHub issues and update registry

---

## **Integration Points**

- **Task Management:** Referenced in [management/TASKS.md](../management/TASKS.md#technical-debt-tracking)
- **Roadmap Planning:** Linked from [project/roadmap.md](roadmap.md)
- **Testing Strategy:** Performance debt tracked in [project/testing.md](testing.md)

---

## **Solo Founder Notes**

**Why This Matters:**
- **Prevents forgotten issues** that become expensive later
- **Enables informed prioritization** based on business growth
- **Maintains professional standards** as the platform scales
- **Provides context** for future developers or investors

**Review Schedule:**
- **Weekly:** Check HIGH priority items for trigger conditions
- **Monthly:** Review MEDIUM priority items and update estimates  
- **Quarterly:** Full debt audit and priority reassessment