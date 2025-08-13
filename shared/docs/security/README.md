# Guardian Security Documentation

**Purpose:** Centralized security documentation for Guardian healthcare platform  
**Last Updated:** 2025-08-13  
**Status:** Phase 3.2 Security Hardening in progress  

---

## Documentation Structure

### Implementation
- [`phase-3.2-implementation.md`](./phase-3.2-implementation.md) - Current Phase 3.2 security hardening implementation log
- [`security-checklist.md`](./security-checklist.md) - Comprehensive security audit checklist

### Compliance
- [`compliance/australian-privacy-act.md`](./compliance/australian-privacy-act.md) - Australian Privacy Act compliance (primary market)
- [`compliance/hipaa-readiness.md`](./compliance/hipaa-readiness.md) - HIPAA readiness for US expansion
- [`compliance/incident-response.md`](./compliance/incident-response.md) - Security incident response procedures

### Testing & Validation
- [`testing/rls-test-plan.md`](./testing/rls-test-plan.md) - Row Level Security testing strategy
- [`testing/penetration-test-prep.md`](./testing/penetration-test-prep.md) - External security audit preparation

---

## Current Security Priorities

### Phase 3.2: Security Hardening (Week 1-2, 2025-08-13)

**Immediate Priority:**
1. **Domain Setup** - Custom domain configuration for proper CORS/CSP
2. **CORS Hardening** - Fix wildcard origin security hole
3. **Security Headers** - CSP, X-Frame-Options, HSTS implementation

**Week 1-2 Goals:**
- [ ] Custom domain configured and live
- [ ] CORS restricted to specific domains
- [ ] Security headers implemented (B+ securityheaders.com score)
- [ ] Input validation with Zod schemas
- [ ] Edge Function for UI-only critical audit events
- [ ] RLS policy testing framework
- [ ] Compliance documentation (80% complete)

---

## Healthcare Security Context

Guardian processes sensitive healthcare data and must comply with:

- **Australian Privacy Act 1988** (primary market)
- **HIPAA** (US expansion readiness)
- **GDPR Article 9** (health data protections)

### Current Security Posture

**✅ Strong Foundation:**
- Comprehensive database-side audit logging
- 50+ Row Level Security policies
- Magic link authentication with session management
- PII sanitization in client-side logging
- Edge Functions infrastructure ready

**⚠️ Critical Gaps (Phase 3.2 targets):**
- CORS allows all origins (`'*'`)
- Missing security headers (CSP, X-Frame-Options)
- No systematic input validation
- UI-only critical events not server-side logged
- Compliance documentation incomplete

---

## Security Architecture

### Authentication & Authorization
- **Magic Link Auth** via Supabase (good for solo dev/early product)
- **Row Level Security** enforces data isolation
- **Profile-based access** with patient ID resolution
- **Session management** with automatic refresh

### Data Protection
- **Database encryption** at rest (Supabase managed)
- **TLS encryption** in transit
- **User data isolation** via RLS policies
- **Audit trail** with immutable logging

### Current Monitoring
- Client-side event logging with rate limiting
- Database trigger-based audit events
- Failed audit fallback system
- Profile-aware audit context

---

## Quick Reference

### Security Headers Implementation
```typescript
// middleware.ts security headers
const securityHeaders = {
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Content-Security-Policy': '...' // See implementation guide
}
```

### CORS Configuration
```typescript
// supabase/functions/_shared/cors.ts
export const corsHeaders = {
  'Access-Control-Allow-Origin': process.env.NEXT_PUBLIC_APP_URL,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
}
```

### Input Validation
```typescript
// Zod schema example
const AuditEventSchema = z.object({
  event_type: z.enum(['profile_switch', 'document_export']),
  action: z.string().max(100),
  profile_id: z.string().uuid()
});
```

---

## Emergency Contacts

**Security Incidents:**
- Primary: [Your contact info]
- Backup: [Backup contact]

**Compliance Questions:**
- Legal: [Legal contact when established]
- Technical: [Technical lead contact]

---

**Next Review:** Weekly during Phase 3.2 implementation  
**Version:** 1.0.0 (Initial security documentation structure)