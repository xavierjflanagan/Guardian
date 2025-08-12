# Technical Debt Registry

**Purpose:** Centralized tracking of technical debt items for Guardian v7  
**Last updated:** 2025-08-12 (Phase 3.1 Performance Optimization completion)  
**Audience:** Solo founder, future developers  
**Status:** Active tracking system

---

## **Current Technical Debt Overview**

| Priority | Item | Impact | Effort | Trigger | Status |
|----------|------|--------|--------|---------|---------| 
| ✅ RESOLVED | [UI Component Duplication](resolved/ui-component-duplication.md) | Code drift, inconsistent UX | 2-3 hours | Phase 3 start | ✅ **COMPLETED 2025-08-12** |
| ✅ RESOLVED | [Missing Testing Framework](resolved/missing-testing-framework.md) | High risk for healthcare app | 1-2 hours | Phase 3 start | ✅ **COMPLETED 2025-08-12** |
| ✅ RESOLVED | [RPC Function Production Hardening](resolved/rpc-function-hardening.md) | Scale/performance concerns | 1-2 hours | 1000+ documents | ✅ **COMPLETED 2025-08-12** |
| ✅ RESOLVED | [Next.js Build Export Failure](resolved/nextjs-build-export.md) | Blocks production deployment | 30 min | Immediate | ✅ **COMPLETED 2025-08-12** |
| 🔴 HIGH | [Performance Monitoring](performance-monitoring.md) | Can't detect production issues | 2-3 days | 100+ active users | 📋 Documented |
| 🟡 MEDIUM | [Event Logging Security](event-logging-security.md) | Audit event integrity | 1-2 hours | Production launch | 📋 Phase 3 |
| ✅ RESOLVED | [Patient Portal Realtime Optimization](resolved/realtime-scaling.md) | Family profile switching performance | 1-2 hours | Patient portal launch | ✅ **COMPLETED 2025-08-12** |
| ⏳ DEFERRED | [Provider Portal Realtime Scaling](provider-portal-realtime-scaling.md) | Future provider portal architecture | 1-2 weeks | Provider portal Phase 4+ | 📋 Research needed |
| 🟡 MEDIUM | [Security Hardening Audit](security-hardening.md) | Compliance gaps | 1-2 days | Before production launch | 📋 Planned |
| ✅ RESOLVED | [Healthcare Testing Edge Cases](resolved/healthcare-testing-edge-cases.md) | Jest mock scope isolation | 1-2 hours | 100% test coverage goal | ✅ **COMPLETED 2025-08-12** |
| 🟢 LOW | [Scalability Architecture Review](scalability-planning.md) | Future scaling concerns | 1 week | 10,000+ users | 📋 Planned |
| 🟢 LOW | [Import Path Consistency](import-path-consistency.md) | Bundle bloat risk | 1 hour | Ongoing | 📋 Monitoring |

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

---

## **Document Template**

Each technical debt item should follow this structure:

```markdown
# [Debt Item Name]

**Impact:** [HIGH/MEDIUM/LOW] - [Brief description of business impact]
**Effort:** [Time estimate]
**Risk:** [What happens if not addressed]
**Trigger:** [When this becomes critical]

## Current State
- ✅ What's working
- ❌ What's missing
- ⚠️ What's at risk

## What We Need
1. Specific requirement 1
2. Specific requirement 2
3. Specific requirement 3

## Implementation Plan
- **Phase 1:** [Description] ([Time estimate])
- **Phase 2:** [Description] ([Time estimate])
- **Phase 3:** [Description] ([Time estimate])

## Business Impact
**Without this:** [Negative consequences]
**With this:** [Positive outcomes]

## Success Criteria
- [ ] Measurable outcome 1
- [ ] Measurable outcome 2
- [ ] Measurable outcome 3
```

## **Adding New Debt Items**

1. Create new `.md` file using template above
2. Add to this registry (update the overview table above)
3. Create GitHub issue if HIGH priority
4. Update this README's quick reference table