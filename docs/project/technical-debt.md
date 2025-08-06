# Technical Debt Registry

**Purpose:** Centralized tracking of technical debt items for Guardian v7  
**Last updated:** August 2025  
**Audience:** Solo founder, future developers  
**Status:** Active tracking system

---

## **Current Technical Debt Overview**

| Priority | Item | Impact | Effort | Trigger | Status |
|----------|------|--------|--------|---------|---------|
| 🔴 HIGH | [Performance Monitoring](#performance-monitoring) | Can't detect production issues | 2-3 days | 100+ active users | 📋 Documented |
| 🟡 MEDIUM | Security Hardening Audit | Compliance gaps | 1-2 days | Before production launch | 📋 Planned |
| 🟢 LOW | Scalability Architecture Review | Future scaling concerns | 1 week | 10,000+ users | 📋 Planned |

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