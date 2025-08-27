# Guardian Healthcare Platform - GitHub Issues Management

**Project:** Guardian Healthcare Platform by Exora Health Pty Ltd  
**Last Updated:** August 27, 2025 (Issues #39-41 CREATED - Critical AI validation & RLS security fixes, plus database improvements)  
**Status:** Active Development - Phase 3 Security Hardening + Critical V3 AI Processing Security

---

## 🚨 CRITICAL Priority Issues

### [Issue #38](https://github.com/xavierjflanagan/Guardian/issues/38) - 🔧 ID System Architecture Alignment
**Urgency:** 🚨 **CRITICAL**  
**Healthcare Impact:** CRITICAL - Multiple ID system inconsistencies risk data contamination and security vulnerabilities  
**Estimated Time:** 4 weeks (systematic architectural fix)  
**Description:** Database schema, TypeScript interfaces, and application logic have misaligned ID semantics. Clinical tables claim to reference `auth.users(id)` but actually store `user_profiles.id` values, creating confusion between account owner ID, profile ID, and patient ID concepts.  
**Context Documentation:** 
- [CLAUDE.md ID Semantics](../../../CLAUDE.md#id-semantics-and-data-access-patterns) - Current documentation with gaps
- [AI Processing V3 schemas](../architecture/ai-processing-v3/) - May inherit inconsistencies  
- [Patient Communications ID System](../architecture/patient-communications/identification-system.md) - Future external ID architecture (orthogonal to this internal issue)  
**Dependencies:** Database schema corrections, TypeScript type alignment, frontend component updates  
**Security Risk:** Profile contamination, unauthorized medical record access, audit trail confusion  
**Compliance Risk:** Australian Privacy Act violations due to improper patient data isolation  
**Technical Debt:** RPC functions contain dual-path workarounds, branded types missing despite documentation references

### [Issue #39](https://github.com/xavierjflanagan/Guardian/issues/39) - 🚨 AI Pass 1 Validation System - Prevent Silent Clinical Data Loss
**Urgency:** 🚨 **CRITICAL**  
**Healthcare Impact:** CRITICAL - AI misclassification can permanently lose clinical data without detection  
**Estimated Time:** 3 weeks (mandatory validation system implementation)  
**Description:** V3 AI processing pipeline's Pass 1 entity classification can silently drop clinical data if entities are misclassified as `document_structure`. Need code-based validation scoring, keyword safety nets, and manual review queue to prevent silent medical data loss.  
**Context Documentation:** 
- [V3 AI Processing Architecture](../architecture/ai-processing-v3/v3-pipeline-planning/04-ai-processing-architecture.md) - Two-pass system vulnerabilities
- [V2 TO V3 Integration](../architecture/ai-processing-v3/V2_TO_V3_ARCHITECTURE_INTEGRATION.md) - Safety requirements  
**Dependencies:** V3 AI processing pipeline, entity_processing_audit table, admin dashboard framework  
**Security Risk:** Critical medical information permanently lost during AI processing  
**Compliance Risk:** Australian Privacy Act requires complete medical record accuracy and loss prevention  
**Patient Safety:** Missing medication/diagnostic data could impact treatment decisions

### [Issue #40](https://github.com/xavierjflanagan/Guardian/issues/40) - 🛡️ Profile Access Security Function - Fix RLS Policy Vulnerability
**Urgency:** 🚨 **CRITICAL**  
**Healthcare Impact:** CRITICAL - Current RLS policies ignore granular permissions, allowing unauthorized profile access  
**Estimated Time:** 3 weeks (security function implementation + policy migration)  
**Description:** Row Level Security policies only check account ownership, completely ignoring `profile_access_permissions` table. Missing `has_profile_access()` function creates vulnerability where shared profile access is not enforced. All clinical data tables need RLS policy updates.  
**Context Documentation:** 
- [Multi-Profile Management](../../../supabase/migrations/003_multi_profile_management.sql) - Current vulnerable policies
- [Issue #28 RLS Testing](https://github.com/xavierjflanagan/Guardian/issues/28) - Testing framework for validation  
**Dependencies:** Issue #38 (ID System Architecture), profile_access_permissions table structure  
**Security Risk:** Unauthorized access to family member medical records, cross-profile data contamination  
**Compliance Risk:** Australian Privacy Act + HIPAA violations for inadequate access controls  
**Business Risk:** Data breach liability and regulatory sanctions

---

## 🔥 HIGH Priority Issues

### [Issue #29](https://github.com/xavierjflanagan/Guardian/issues/29) - 🔒 Automated PII Detection
**Urgency:** 🔥 **HIGH**  
**Healthcare Impact:** HIGH - Required for Australian Privacy Act compliance  
**Estimated Time:** 3 weeks (partial progress made)  
**Description:** Current PII sanitization only removes basic hardcoded fields but lacks pattern-based detection for Australian healthcare identifiers (Medicare, TFN, AHPRA) in medical document content.  
**Context Documentation:** [PII Detection Requirements](../security/compliance/australian-privacy-act.md)  
**Dependencies:** Document processing pipeline integration  
**Compliance Risk:** Privacy violations in medical record processing  
**✅ Partial Progress:** Fixed GitHub Actions PII detection false positive (commit 5e731bd)

### [Issue #30](https://github.com/xavierjflanagan/Guardian/issues/30) - 📊 Security Monitoring Infrastructure
**Urgency:** 🔥 **HIGH**  
**Healthcare Impact:** HIGH - Zero operational visibility into production healthcare system  
**Estimated Time:** 3 weeks  
**Description:** Guardian currently has NO error tracking, uptime monitoring, or security incident alerting infrastructure, leaving the healthcare platform blind to outages, breaches, and system failures.  
**Context Documentation:** [Monitoring Implementation Plan](../operations/monitoring-implementation.md)  
**Dependencies:** Sentry account setup, UptimeRobot configuration  
**Business Risk:** Service outages and security incidents go undetected

---

## ⚠️ MEDIUM Priority Issues

### [Issue #28](https://github.com/xavierjflanagan/Guardian/issues/28) - 🛡️ RLS Policy Testing Framework **[DEFERRED]**
**Urgency:** ⚠️ **MEDIUM** (Deferred - Pre-production priority)  
**Healthcare Impact:** CRITICAL - 84 untested RLS policies represent highest data security risk when serving users  
**Estimated Time:** 3 weeks  
**Description:** Guardian has 84 Row Level Security policies across 13 migration files that are completely untested, creating serious vulnerabilities in patient data isolation and healthcare compliance.  
**Context Documentation:** [RLS Testing Framework](../architecture/security/rls-policy-testing-framework.md)  
**Dependencies:** User base establishment, pre-production security audit requirements  
**Compliance Risk:** Australian Privacy Act + HIPAA violations possible  
**📋 Implementation Plan:** COMPLETE - Comprehensive 3-week implementation plan ready with full testing framework architecture, test utilities, and compliance validation. Framework includes 84 policy test coverage across core clinical data, multi-profile access, and healthcare compliance validation.  
**⏳ Priority Status:** DEFERRED until pre-production phase - Framework ready to deploy when user base requires enterprise-grade security validation

### ✅ [Issue #27](https://github.com/xavierjflanagan/Guardian/issues/27) - 🧪 Test Framework Reliability **[RESOLVED]**
**Status:** ✅ **CLOSED** (August 18, 2025)  
**Root Cause:** Critical events using server-side audit logging instead of client-side mocking  
**Actual Problems Fixed:**
- **PRIMARY**: Test cases expecting critical events (document_view, document_download) to use client mocks
- **SECONDARY**: Updated tests to use non-critical events (search, filter, view_profile) for client-side testing  
- **INFRASTRUCTURE**: All 9 useEventLogging tests now passing with proper healthcare compliance validation
**Additional Improvements:** Restored CI/CD pipeline reliability for healthcare audit logging functionality
**Business Impact:** Test framework reliability restored, healthcare audit logging properly tested

### [Issue #31](https://github.com/xavierjflanagan/Guardian/issues/31) - ⚠️ TypeScript Safety
**Urgency:** ⚠️ **MEDIUM**  
**Healthcare Impact:** MEDIUM - Medical data processing lacks type safety  
**Estimated Time:** 2.5 weeks  
**Description:** Guardian has 13+ TypeScript `any` type warnings in critical healthcare components, removing type safety protections for medical data processing and patient information handling.  
**Context Documentation:** [Frontend Implementation](../architecture/frontend/implementation/)  
**Dependencies:** None - can be implemented independently  
**Code Quality:** Patient safety type validations needed

### [Issue #32](https://github.com/xavierjflanagan/Guardian/issues/32) - ⚡ Edge Runtime Compatibility
**Urgency:** ⚠️ **MEDIUM**  
**Healthcare Impact:** MEDIUM - Real-time features but has fallback  
**Estimated Time:** 2 weeks  
**Description:** Supabase Realtime client uses Node.js-specific APIs incompatible with Vercel Edge Runtime, potentially causing failures in serverless healthcare data subscriptions.  
**Context Documentation:** [Phase 3 Advanced Features](../architecture/frontend/implementation/phase-3-advanced-features.md)  
**Dependencies:** Vercel Edge Runtime deployment testing  
**Impact:** Real-time provider dashboards may need polling fallback

### [Issue #33](https://github.com/xavierjflanagan/Guardian/issues/33) - 🛡️ CSP Middleware Header Conflict
**Urgency:** ⚠️ **MEDIUM**  
**Healthcare Impact:** LOW - Security configuration bug  
**Estimated Time:** 1 hour  
**Description:** Content Security Policy headers are incorrectly applied to API routes, causing header conflicts and potential security misconfigurations. Discovered by GPT-5 technical review.  
**Context Documentation:** [Phase 3.2 Security Implementation](../architecture/frontend/implementation/phase-3.2-implementation.md)  
**Dependencies:** None - simple middleware fix  
**Technical Fix:** Remove duplicate CSP header sources

### [Issue #35](https://github.com/xavierjflanagan/Guardian/issues/35) - 🔄 Magic Link Auth Cross-Tab Synchronization
**Urgency:** ⚠️ **MEDIUM**  
**Healthcare Impact:** HIGH - User experience confusion reduces healthcare professional confidence  
**Estimated Time:** 3-4 hours  
**Description:** When users sign in via magic link, the original browser tab remains inaccessible after successful authentication in the new tab. Users must manually refresh to access dashboard, creating confusing UX.  
**Context Documentation:** Related to Issue #25 auth flow architecture and middleware behavior  
**Dependencies:** Understanding of Supabase auth state management and middleware integration  
**Technical Fix:** Implement cross-tab auth state detection via Supabase auth listener or polling

### [Issue #41](https://github.com/xavierjflanagan/Guardian/issues/41) - 🗃️ Database Migration Refactoring & Missing Clinical Tables
**Urgency:** ⚠️ **MEDIUM**  
**Healthcare Impact:** MEDIUM - AI accuracy improvements and developer experience enhancement  
**Estimated Time:** 4 weeks (2 weeks refactoring + 2 weeks new tables)  
**Description:** Large monolithic migration files (003_multi_profile_management.sql - 417 lines) create maintenance challenges and deployment risks. Additionally, several clinical tables referenced in V3 AI processing are missing, causing AI to fall back to less optimal existing tables.  
**Context Documentation:** 
- [Current Migration Structure](../../../supabase/migrations/003_multi_profile_management.sql) - Monolithic structure needing refactoring
- [V3 AI Schema Architecture](../architecture/ai-processing-v3/ai-to-database-schema-architecture/) - Missing table requirements  
**Dependencies:** Issue #40 (RLS Security Function) for new table policies, Issue #38 (ID System Architecture) for semantic clarity  
**Technical Debt:** Large migrations difficult to review, test, and rollback individually  
**AI Accuracy Impact:** Missing provider directory, enhanced demographics, and medical coding reference tables limit V3 processing effectiveness

### ✅ [Issue #36](https://github.com/xavierjflanagan/Guardian/issues/36) - 🚨 File Upload System Failures **[RESOLVED]**
**Status:** ✅ **CLOSED** (August 18, 2025)  
**Root Cause:** Multi-layered issues requiring systematic resolution  
**Actual Problems Fixed:**
- **PRIMARY**: PostgREST schema routing (client configuration added `schema: 'public'`)
- **SECONDARY**: Database permission gaps (grants applied for `anon` and `authenticated` roles)
- **INFRASTRUCTURE**: PostgreSQL function overload conflicts resolved, edge function parameter fixes
**Additional Improvements:** Storage policy security (authenticated-only), CSP configuration restored
**Business Impact:** Core document upload functionality fully operational, security enhanced

### ✅ [Issue #34](https://github.com/xavierjflanagan/Guardian/issues/34) - 🔧 Node.js Version Conflict **[RESOLVED]**
**Status:** ✅ **CLOSED** (August 18, 2025)  
**Root Cause:** Investigation revealed Node version was NOT causing CI failures  
**Actual Problems Fixed:**
- **PRIMARY**: TypeScript compilation errors in validation tests (discriminated union type guards)
- **SECONDARY**: Missing Supabase auth mocking (`supabase.auth.getSession()` crashes)
- **INFRASTRUCTURE**: Implemented production-quality testing patterns with centralized utilities
**Additional Improvements:** Type safety, dependency injection, resilient test assertions
**Node Version Status:** Real issue but LOW priority quality improvement (warnings only)

---

## 📊 Issue Summary Dashboard

### By Priority Level
- 🚨 **CRITICAL:** 3 issues (ID system architecture alignment, AI Pass 1 validation, RLS security function)
- 🔥 **HIGH:** 2 issues (PII detection, security monitoring)  
- ⚠️ **MEDIUM:** 6 issues (RLS testing framework [DEFERRED], TypeScript safety, Edge Runtime, CSP headers, Auth UX, database migration improvements)
- 🟢 **LOW:** 0 issues
- ✅ **RESOLVED:** 3 issues (Test framework, file upload system, CI infrastructure)

### By Healthcare Impact
- **CRITICAL:** 4 issues (ID system architecture alignment, AI Pass 1 validation, RLS security function, RLS policy testing [DEFERRED])
- **HIGH:** 3 issues (PII detection, monitoring, auth UX)
- **MEDIUM:** 3 issues (TypeScript safety, Edge Runtime, database migration improvements)
- **LOW:** 1 issue (CSP middleware)
- **✅ RESOLVED:** 3 issues (Test framework, file upload system, CI infrastructure)

### By Implementation Time
- **Quick fixes (<1 day):** Issues #33, #35
- **Medium effort (1-2 weeks):** Issue #32
- **Major features (3+ weeks):** Issues #28 [DEFERRED - Plan Complete], #29, #30, #39 (AI Pass 1 validation), #40 (RLS security function)
- **Architectural fixes (4+ weeks):** Issues #38 (ID system alignment), #41 (database migration refactoring)
- **Code quality (2-3 weeks):** Issue #31
- **✅ Completed:** Issues #27 (Test framework), #34 (CI infrastructure), #36 (File upload system)

### By Dependencies
- **No dependencies (can start immediately):** Issues #31, #33, #35, #39 (AI Pass 1 validation - can start with existing V3 pipeline)
- **External setup required:** Issues #29, #30 (accounts, integrations)
- **Testing dependent:** Issue #32 (Edge Runtime deployment)
- **Complex interdependencies:** Issues #38 (database schema, TypeScript types, frontend components), #40 (requires Issue #38 for ID semantics), #41 (requires Issues #38, #40 for proper table policies)
- **Deferred (plan complete):** Issue #28 (RLS testing framework)
- **✅ Resolved:** Issues #27 (Test framework), #34 (CI infrastructure), #36 (File upload system)

---

## 🏥 Healthcare Compliance Status

### Australian Privacy Act Requirements
- 🟡 **RLS Policy Testing** (Issue #28) - Framework complete, deferred until pre-production
- ❌ **PII Detection** (Issue #29) - Required for medical document processing
- ❌ **Security Monitoring** (Issue #30) - Required for breach detection

### HIPAA Readiness (US Expansion)
- 🟡 **Technical Safeguards** (Issues #28, #30) - RLS framework ready, monitoring pending
- ❌ **Administrative Safeguards** (Issue #30) - Security incident response procedures
- ✅ **Physical Safeguards** - Digital access controls implemented

### Production Readiness Assessment
**Current Status:** 75% Complete - Core infrastructure ready, AI processing pipeline pending  
**Blocking for MVP Launch:** AI processing pipeline implementation (primary focus)  
**Blocking for Full Production:** Issues #29, #30 (PII detection, security monitoring)  
**Ready for Beta Testing:** Yes, with current security foundation  
**Enterprise Customer Ready:** No, requires completion of all HIGH issues + Issue #28 implementation

---

## 📝 Issue Creation Workflow

When creating new GitHub issues using `/issue` command:

1. **Create GitHub Issue** - Use standard GitHub issue template
2. **Update This File** - Add issue to appropriate priority section
3. **Link Documentation** - Reference relevant `.md` files in context
4. **Set Healthcare Impact** - Assess patient data and compliance risk
5. **Estimate Timeline** - Provide realistic implementation timeframes
6. **Track Dependencies** - Note blocking requirements or prerequisites

### Issue Template Information Required
- **Priority Level:** CRITICAL/HIGH/MEDIUM/LOW
- **Healthcare Impact:** Assessment of patient data and compliance risk
- **Estimated Time:** Realistic implementation timeframe
- **Context Documentation:** Link to relevant `.md` files
- **Dependencies:** Prerequisites or blocking requirements
- **Compliance Risk:** Australian Privacy Act, HIPAA, or business impact

---

## 🔄 Update Schedule

This file should be updated:
- **Immediately** when new issues are created via `/issue` command
- **Weekly** during active development sprints
- **Upon issue completion** to move to resolved section
- **Monthly** for healthcare compliance status review

**Next Review:** August 24, 2025  
**Responsible:** Development team + healthcare compliance review

---

**Document Version:** 1.0  
**Created by:** Claude Code Analysis  
**Maintained by:** Guardian Development Team  
**File Location:** `shared/docs/management/github-issues-todo.md`