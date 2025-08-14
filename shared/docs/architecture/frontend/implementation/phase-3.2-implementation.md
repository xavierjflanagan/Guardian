# Phase 3.2: Security Hardening Implementation Log

**Start Date:** 2025-08-13  
**Estimated Duration:** 1-2 weeks  
**Status:** 🚧 **IN PROGRESS**  
**Priority:** CRITICAL - Production security readiness

---

## **Revised Implementation Plan**

Based on comprehensive analysis incorporating GPT5 feedback and database audit infrastructure review.

### **Key Corrections Made:**
1. **Database auditing already robust** - Focus Edge Functions on UI-only events
2. **CORS wildcard security hole** - Critical fix needed immediately  
3. **Custom domain prerequisite** - Required for proper security implementation
4. **Timeline realistic** - 1-2 weeks not 2 days

---

## **Implementation Tasks**

### **Priority 1: Foundation (Day 0-2)**

#### **Task 3.2.1: Domain Setup** ⚠️ **BLOCKING ALL OTHER TASKS**
**Status:** 🔜 Ready to execute with user
**Rationale:** Can't configure CORS, CSP, or auth redirects properly without stable domain

**Steps to execute together:**
1. **Domain Registration** (~30 min)
   - Choose brand name and register domain
   - Consider: `yourbrand.com` + `yourbrand.com.au`
   - Recommended registrar: Cloudflare (at-cost) or Namecheap

2. **Vercel Configuration** (~30 min)
   - Add domain in Vercel project settings
   - Configure DNS records (CNAME or A/ALIAS)
   - Verify HTTPS certificate

3. **Application Configuration** (~1 hour)
   - Update Supabase Auth redirect URLs
   - Set CORS allowlist
   - Update environment variables

#### **Task 3.2.2: CORS & Security Headers** ⚠️ **CRITICAL**
**Status:** 📝 Ready to implement after domain setup
**Dependencies:** Domain configuration complete

**Files to update:**
- `apps/web/middleware.ts` - Add security headers
- `supabase/functions/_shared/cors.ts` - Fix wildcard origin

**Implementation:**
```typescript
// Security headers for middleware.ts
const generateNonce = () => crypto.randomBytes(16).toString('base64');

const createCSPHeader = (nonce: string) => `
  default-src 'self';
  script-src 'self' 'nonce-${nonce}' https://*.supabase.co;
  style-src 'self' 'nonce-${nonce}';
  img-src 'self' data: blob: https://*.supabase.co;
  font-src 'self';
  connect-src 'self' https://*.supabase.co wss://*.supabase.co;
  frame-ancestors 'none';
  base-uri 'self';
  form-action 'self';
  upgrade-insecure-requests;
`.replace(/\s{2,}/g, ' ').trim();

const securityHeaders = (nonce: string) => ({
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff', 
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'Content-Security-Policy': createCSPHeader(nonce)
});

// CORS allowlist strategy for Edge Functions
const ALLOWED_ORIGINS = process.env.CORS_ALLOWED_ORIGINS?.split(',') || [
  'http://localhost:3000',
  'https://yourdomain.com'
];

export function getCorsHeaders(origin: string | null) {
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    return {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
    };
  }
  // Deny by default - no CORS headers for unauthorized origins
  return {};
}
```

#### **Task 3.2.3: Refine Edge Function for UI-Only Events**
**Status:** 🔄 Partially complete - needs refinement
**Current:** Basic Edge Function created, needs focus on UI-only events

**Scope refinement:**
- ✅ Created `supabase/functions/audit-events/`
- 🔄 Focus ONLY on events without DB triggers:
  - Profile switch attempts (UI-only)
  - Document export actions (UI-only)
  - View sensitive documents (UI-only)  
  - Failed authentication attempts (UI-only)
- 🔄 Remove database table operations (already handled by triggers)

### **Priority 2: Input Validation (Day 3-4)**

#### **Task 3.2.4: Zod Input Validation**
**Status:** 📝 Ready to implement
**Scope:** All API routes and Edge Functions

**Implementation approach:**
```typescript
// utils/validation.ts
import { z } from 'zod';

export const AuditEventSchema = z.object({
  event_type: z.enum(['profile_switch', 'document_export', 'auth_failure', 'sensitive_view']),
  action: z.string().max(100),
  metadata: z.record(z.unknown()).optional(),
  profile_id: z.string().uuid(),
  session_id: z.string().uuid()
});

export const DocumentUploadSchema = z.object({
  filename: z.string().max(255),
  filesize: z.number().max(10 * 1024 * 1024), // 10MB limit
  mimetype: z.string().refine(type => 
    ['image/jpeg', 'image/png', 'application/pdf'].includes(type)
  )
});
```

**Files to update:**
- All API routes in `apps/web/app/api/`
- Edge Functions in `supabase/functions/`
- Client-side form validation

### **Priority 3: RLS & Database Security (Day 5-7)**

#### **Task 3.2.5: RLS Policy Audit & Testing**
**Status:** 📝 Ready to implement
**Scope:** Review and test all 50+ existing policies

**Testing approach:**
```typescript
// __tests__/security/rls-policies.test.ts
describe('RLS Policy Security', () => {
  test('prevents cross-profile data access', async () => {
    // Test profile isolation
    // Attempt to access another user's documents
    // Should return empty or error
  });
  
  test('enforces provider access controls', async () => {
    // Test provider restrictions
    // Verify providers only see authorized patients
  });
  
  test('audit trail immutability', async () => {
    // Test audit log protection
    // Verify audit entries cannot be modified
  });
});
```

#### **Task 3.2.6: PII Detection Automation**
**Status:** 📝 Ready to implement

**Implementation:**
```typescript
// utils/piiDetector.ts
const PII_PATTERNS = {
  // Australian patterns
  medicare: /\b[0-9]{10,11}\b/,
  tfn: /\b[0-9]{3}[ -]?[0-9]{3}[ -]?[0-9]{3}\b/,
  
  // International patterns
  ssn: /\b\d{3}-\d{2}-\d{4}\b/,
  email: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/,
  phone: /\b(\+?61|0)[2-478]( ?\d){8}\b/,
  creditCard: /\b\d{4}[ -]?\d{4}[ -]?\d{4}[ -]?\d{4}\b/
};

export function detectPII(text: string): { 
  hasPII: boolean; 
  patterns: string[]; 
  confidence: number;
} {
  const matches = Object.entries(PII_PATTERNS)
    .filter(([_, pattern]) => pattern.test(text))
    .map(([name]) => name);
    
  return {
    hasPII: matches.length > 0,
    patterns: matches,
    confidence: matches.length / Object.keys(PII_PATTERNS).length
  };
}
```

### **Priority 4: Compliance & Documentation (Day 8-10)**

#### **Task 3.2.7: Australian Privacy Act Compliance**
**Status:** 📝 Ready to document
**Focus:** Primary market compliance

#### **Task 3.2.8: HIPAA Readiness Documentation**  
**Status:** 📝 Ready to document
**Focus:** US expansion preparation

#### **Task 3.2.9: Incident Response Procedures**
**Status:** 📝 Ready to document

---

## **Progress Tracking**

### **Week 1 Targets:**
- [ ] **Domain configured** - Unblocks all security work
- [ ] **CORS hardened** - Fixes critical security hole
- [ ] **Security headers implemented** - Target B+ securityheaders.com score
- [ ] **Zod validation** - All API routes protected
- [ ] **Edge Function refined** - UI-only critical events

### **Week 2 Targets:**
- [ ] **RLS policies tested** - Security validation complete
- [ ] **PII detection operational** - Automated protection
- [ ] **Compliance docs 80% complete** - Legal readiness
- [ ] **Security test suite** - CI/CD integration

---

## **Critical Dependencies**

1. **Domain Registration** - BLOCKING: All security configuration depends on this
2. **Supabase Environment** - Service role keys, auth configuration
3. **Vercel Configuration** - Environment variables, deployment settings

---

## **Testing Strategy**

### **Security Headers Testing:**
```bash
# Test security headers
curl -I https://yourdomain.com
# Verify: X-Frame-Options, CSP, X-Content-Type-Options

# Security headers analyzer
npx @httptoolkit/security-headers-analyzer https://yourdomain.com
```

### **CORS Testing:**
```javascript
// Test CORS from different origins
fetch('https://yourdomain.com/api/health', {
  method: 'GET',
  mode: 'cors'
});
```

### **RLS Testing:**
```sql
-- Test as different users
SET role authenticated;
SET request.jwt.claims TO '{"sub": "user1"}';
SELECT * FROM documents; -- Should only see user1's docs
```

---

## **Implementation Notes**

### **Security Header Considerations:**
- **CSP**: Start restrictive, loosen based on console errors
- **HSTS**: Enable after custom domain HTTPS confirmed
- **X-Frame-Options**: DENY prevents embedding (good for healthcare)

### **Edge Function Scope:**
- Focus on UI interactions that don't trigger database operations
- Complement existing DB trigger audit system
- Avoid duplicate logging

### **Compliance Strategy:**
- Australian Privacy Act first (primary market)
- HIPAA documentation parallel (US expansion readiness)
- Map existing security to compliance requirements

---

## **Success Criteria**

### **Technical Validation:**
- [ ] Security headers score B+ on securityheaders.com
- [ ] Zero CORS-related console errors
- [ ] All RLS policy tests pass
- [ ] PII detection catches 95% of test patterns
- [ ] Build/deploy pipeline unaffected

### **Documentation Completion:**
- [ ] Australian Privacy Act compliance mapped
- [ ] HIPAA readiness checklist 80% complete  
- [ ] Incident response procedures documented
- [ ] Security testing framework operational

### **Operational Readiness:**
- [ ] Custom domain live and stable
- [ ] Security monitoring in place
- [ ] Team trained on security procedures
- [ ] Ready for external security audit

---

**Next Update:** Daily during implementation phase  
**Review Schedule:** Weekly during Phase 3.2  
**Completion Target:** 2025-08-27 (2 weeks from start)