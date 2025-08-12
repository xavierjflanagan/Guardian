# Event Logging Security

**Impact:** MEDIUM - Audit event integrity concerns  
**Effort:** 1-2 hours (Edge Function + client-side fallback pattern)  
**Risk:** Audit event tampering, non-repudiation concerns for healthcare compliance  
**Trigger:** Production launch  

## Current State

- ✅ **Client-side event logging working** with PII sanitization and rate limiting
- ✅ **RLS policies enforced** on user_events table for user data isolation
- ❌ **Critical audit events rely on client-side inserts** - potential tampering risk
- ⚠️ **Healthcare compliance gap** - audit trail integrity not cryptographically verified

## What We Need

1. **Edge Functions for critical audit events** - Server-side logging for sensitive operations
2. **Client-side fallback pattern** - Graceful degradation when Edge Functions unavailable
3. **Audit event classification** - Determine which events require server-side integrity

## Implementation Plan

- **Phase 1:** Edge Function implementation (1 hour)
  - Create server-side audit logging endpoint
  - Implement critical event detection (document access, profile switches, data exports)
  - Add cryptographic integrity verification

- **Phase 2:** Client-side integration (30 minutes)
  - Update useEventLogging hook with dual-path logic
  - Fallback to client-side for non-critical events
  - Error handling for Edge Function failures

## Business Impact

**Without this:**
- Potential audit event tampering in healthcare compliance scenarios
- Reduced trust in audit trail integrity
- Possible regulatory compliance gaps

**With this:**
- Cryptographically verified audit trail for critical healthcare events
- Enhanced regulatory compliance posture
- Maintained user experience with fallback patterns

## Success Criteria

- [ ] Critical healthcare events logged server-side with integrity verification
- [ ] Client-side fallback maintains functionality during Edge Function issues
- [ ] Audit trail meets healthcare regulatory requirements for non-repudiation