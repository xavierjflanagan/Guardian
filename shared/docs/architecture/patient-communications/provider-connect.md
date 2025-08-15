# Provider Quick-Connect System

**Status:** Core Feature Specification  
**Date:** 2025-08-15  
**Feature:** Phone-based provider access with patient consent  

---

## Executive Summary

The Provider Quick-Connect system allows healthcare providers to quickly access patient records using the patient's phone number as an identifier, with real-time patient consent and time-limited access grants.

---

## Core Concept

### The Problem
- Providers have patient phone numbers in their existing systems
- Traditional medical record numbers are provider-specific
- Patients forget health record numbers and passwords
- Emergency situations require quick access
- New providers need immediate access to patient history

### The Solution
```
Provider enters patient phone → Patient approves via app → Time-limited access granted
```

**Key principle:** Phone number is used only for **identification**, never for PHI transmission.

---

## User Flow

### 1. Provider-Initiated Access
```
┌─────────────────────────────────────────┐
│ Provider Portal: Quick Patient Lookup   │
├─────────────────────────────────────────┤
│ Patient Phone: [+61 4XX XXX XXX] [🔍]  │
│ Provider: Dr Sarah Smith                │
│ Clinic: Sydney Family Medical          │
│ Purpose: [Consultation ▼]              │
│ Duration: [15 minutes ▼]               │
│                                         │
│ [Request Access]                        │
└─────────────────────────────────────────┘
```

### 2. Patient Notification & Approval
```
┌─────────────────────────────────────────┐
│ 🔔 Access Request                       │
├─────────────────────────────────────────┤
│ Dr Sarah Smith at Sydney Family Medical │
│ is requesting access to your health     │
│ record for: Consultation                │
│                                         │
│ Duration: 15 minutes                    │
│ Requested: Just now                     │
│                                         │
│ [❌ Decline] [✅ Approve]               │
│                                         │
│ If approved, show this code to provider:│
│ [  1  2  3  4  5  6  ]                 │
└─────────────────────────────────────────┘
```

### 3. Provider Access Confirmation
```
┌─────────────────────────────────────────┐
│ Patient Approval Required               │
├─────────────────────────────────────────┤
│ ✅ Access request sent to patient       │
│                                         │
│ Patient will receive a notification and │
│ provide you with a 6-digit code.        │
│                                         │
│ Enter code: [_ _ _ _ _ _] [Verify]       │
│                                         │
│ Code expires in: 4:32                   │
└─────────────────────────────────────────┘
```

---

## Technical Implementation

### 1. Privacy-Safe Patient Lookup
```typescript
// Never reveal whether patient exists
async function providerLookupRequest(providerPhone: string, patientPhone: string) {
  // Normalize phone to E.164
  const normalizedPhone = normalizePhone(patientPhone);
  
  // Find patient (internal only)
  const patient = await findPatientByPhone(normalizedPhone);
  
  if (!patient) {
    // Don't reveal non-existence
    return {
      status: 'request_sent',
      message: 'If patient exists, they will receive your access request'
    };
  }
  
  // Create pending access request
  const accessRequest = await createAccessRequest({
    patient_id: patient.id,
    provider_phone: providerPhone,
    requested_at: new Date(),
    purpose: req.body.purpose,
    duration_minutes: req.body.duration,
    status: 'pending'
  });
  
  // Generate 6-digit verification code
  const verificationCode = generateVerificationCode();
  await storeVerificationCode(accessRequest.id, verificationCode);
  
  // Notify patient (push notification + SMS fallback)
  await notifyPatient(patient.id, {
    type: 'access_request',
    provider_phone: providerPhone,
    verification_code: verificationCode,
    expires_at: new Date(Date.now() + 5 * 60 * 1000) // 5 minutes
  });
  
  return {
    status: 'request_sent',
    message: 'Patient will provide verification code if approved'
  };
}
```

### 2. Patient Consent Flow
```typescript
// Patient approves access request
async function approveAccessRequest(patientId: string, requestId: string) {
  const request = await getAccessRequest(requestId);
  
  if (!request || request.patient_id !== patientId) {
    throw new Error('Invalid access request');
  }
  
  if (request.expires_at < new Date()) {
    throw new Error('Access request expired');
  }
  
  // Generate session token for provider
  const sessionToken = await createProviderSession({
    access_request_id: requestId,
    patient_id: patientId,
    provider_phone: request.provider_phone,
    permissions: ['read_timeline', 'view_documents'],
    expires_at: new Date(Date.now() + request.duration_minutes * 60 * 1000)
  });
  
  // Update request status
  await updateAccessRequest(requestId, {
    status: 'approved',
    approved_at: new Date(),
    session_token: sessionToken
  });
  
  return {
    verification_code: request.verification_code,
    expires_in_minutes: request.duration_minutes
  };
}
```

### 3. Provider Access with Verification Code
```typescript
// Provider enters verification code
async function verifyProviderAccess(providerPhone: string, verificationCode: string) {
  const request = await findAccessRequestByCode(verificationCode);
  
  if (!request || request.provider_phone !== providerPhone) {
    throw new Error('Invalid verification code');
  }
  
  if (request.status !== 'approved') {
    throw new Error('Access not approved');
  }
  
  if (request.expires_at < new Date()) {
    throw new Error('Access expired');
  }
  
  // Return session token for API access
  return {
    session_token: request.session_token,
    patient_name: await getPatientDisplayName(request.patient_id),
    expires_at: request.expires_at,
    permissions: ['read_timeline', 'view_documents']
  };
}
```

---

## Security Features

### 1. Anti-Enumeration Protection
```typescript
// Prevent phone number enumeration attacks
async function rateLimitProviderLookups(providerPhone: string) {
  const key = `provider_lookups:${providerPhone}`;
  const count = await redis.incr(key);
  
  if (count === 1) {
    await redis.expire(key, 3600); // 1 hour window
  }
  
  if (count > 10) {
    throw new Error('Rate limit exceeded');
  }
  
  // Add artificial delay for all requests
  await delay(randomBetween(500, 1500));
}
```

### 2. Verification Code Security
```typescript
interface VerificationCode {
  id: string;
  access_request_id: string;
  code: string;              // 6-digit numeric
  created_at: Date;
  expires_at: Date;          // 5 minutes from creation
  attempts: number;          // Max 3 attempts
  used_at?: Date;
}

// Generate secure 6-digit code
function generateVerificationCode(): string {
  return crypto.randomInt(100000, 999999).toString();
}
```

### 3. Session Management
```typescript
interface ProviderSession {
  id: string;
  access_request_id: string;
  patient_id: string;
  provider_phone: string;
  session_token: string;
  permissions: string[];
  created_at: Date;
  expires_at: Date;
  last_activity: Date;
  revoked_at?: Date;
}

// Auto-expire sessions
async function cleanupExpiredSessions() {
  await db.update('provider_sessions', 
    { revoked_at: new Date() },
    { expires_at: { $lt: new Date() } }
  );
}
```

---

## Audit & Compliance

### 1. Complete Audit Trail
```sql
CREATE TABLE access_audit_log (
  id UUID PRIMARY KEY,
  patient_id UUID REFERENCES users(id),
  provider_phone VARCHAR(20),
  provider_verified BOOLEAN,
  action VARCHAR(50), -- 'request', 'approve', 'deny', 'access', 'expire'
  details JSONB,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);
```

### 2. Real-Time Monitoring
```typescript
// Log all access events
async function logAccessEvent(event: AccessEvent) {
  await db.insert('access_audit_log', {
    patient_id: event.patient_id,
    provider_phone: event.provider_phone,
    action: event.action,
    details: event.details,
    ip_address: event.ip_address,
    user_agent: event.user_agent,
    created_at: new Date()
  });
  
  // Real-time alerts for suspicious activity
  if (event.action === 'access' && event.details.suspicious) {
    await sendSecurityAlert(event);
  }
}
```

### 3. Patient Access Dashboard
```typescript
// Show patients who has accessed their data
interface AccessHistory {
  provider_phone: string;
  provider_name?: string;
  clinic_name?: string;
  access_date: Date;
  duration_minutes: number;
  data_accessed: string[];
  patient_initiated: boolean;
}

async function getPatientAccessHistory(patientId: string): Promise<AccessHistory[]> {
  return await db.query(`
    SELECT 
      al.provider_phone,
      al.details->>'provider_name' as provider_name,
      al.details->>'clinic_name' as clinic_name,
      al.created_at as access_date,
      ar.duration_minutes,
      al.details->'data_accessed' as data_accessed,
      ar.patient_initiated
    FROM access_audit_log al
    JOIN access_requests ar ON al.details->>'request_id' = ar.id::text
    WHERE al.patient_id = ? 
      AND al.action = 'access'
    ORDER BY al.created_at DESC
  `, [patientId]);
}
```

---

## Provider Verification

### 1. Provider Registration
```typescript
interface VerifiedProvider {
  id: string;
  phone_e164: string;
  name: string;
  clinic_name: string;
  medical_registration: string; // AHPRA number in Australia
  verified_at: Date;
  verification_documents: string[];
}

// Verify provider credentials
async function verifyProvider(phone: string, credentials: ProviderCredentials) {
  // Check against medical registration database
  const isValid = await checkMedicalRegistration(credentials.ahpra_number);
  
  if (isValid) {
    await db.upsert('verified_providers', {
      phone_e164: phone,
      name: credentials.name,
      clinic_name: credentials.clinic_name,
      medical_registration: credentials.ahpra_number,
      verified_at: new Date()
    });
  }
  
  return isValid;
}
```

### 2. Trust Indicators
```typescript
// Show trust indicators to patients
async function getProviderTrustInfo(providerPhone: string) {
  const provider = await getVerifiedProvider(providerPhone);
  
  return {
    verified: !!provider,
    name: provider?.name,
    clinic: provider?.clinic_name,
    registration: provider?.medical_registration,
    verification_date: provider?.verified_at,
    trust_score: calculateTrustScore(provider)
  };
}
```

---

## Implementation Roadmap

### Phase 1: Basic Quick-Connect (Month 1)
- [ ] Provider lookup portal
- [ ] Patient consent flow
- [ ] 6-digit verification codes
- [ ] Time-limited sessions
- [ ] Basic audit logging

### Phase 2: Enhanced Security (Month 2)
- [ ] Provider verification system
- [ ] Rate limiting and anti-enumeration
- [ ] Real-time monitoring
- [ ] Patient access dashboard
- [ ] Suspicious activity alerts

### Phase 3: Advanced Features (Month 3)
- [ ] Emergency access protocols
- [ ] Bulk provider verification
- [ ] Integration with medical registration APIs
- [ ] Advanced analytics
- [ ] Multi-clinic provider support

---

## Success Metrics

### Adoption Metrics
- **Provider registrations:** >100 verified providers in first 3 months
- **Quick-connect usage:** >30% of clinic visits use phone lookup
- **Patient approval rate:** >80% of requests approved
- **Time to access:** <2 minutes average from request to approval

### Security Metrics
- **Failed enumeration attempts:** <0.1% of lookups
- **Expired sessions:** 100% auto-revoked
- **Suspicious activity detection:** >95% accuracy
- **Zero data breaches:** 100% secure access

### User Experience
- **Provider satisfaction:** >4.5/5 for ease of access
- **Patient comfort:** >4.0/5 for security and control
- **System reliability:** >99.5% uptime
- **Response time:** <500ms for all API calls

---

## Emergency Access Protocols

### 1. Emergency Override
```typescript
// For critical medical emergencies
interface EmergencyAccess {
  provider_id: string;
  patient_phone: string;
  emergency_type: 'cardiac' | 'trauma' | 'overdose' | 'allergic_reaction';
  hospital_id: string;
  justification: string;
  witness_provider_id?: string;
}

async function grantEmergencyAccess(request: EmergencyAccess) {
  // Grant immediate access with extended audit trail
  const emergencySession = await createEmergencySession({
    ...request,
    duration_minutes: 60,
    permissions: ['read_all', 'emergency_notes'],
    requires_review: true
  });
  
  // Notify patient immediately
  await notifyPatientEmergencyAccess(request);
  
  // Flag for compliance review
  await flagForComplianceReview(emergencySession.id);
  
  return emergencySession;
}
```

### 2. Family Access
```typescript
// For family members in emergencies
async function grantFamilyAccess(patientPhone: string, familyPhone: string, relationship: string) {
  // Check if family member is pre-authorized
  const authorization = await getFamilyAuthorization(patientPhone, familyPhone);
  
  if (authorization && authorization.emergency_access) {
    return await grantLimitedFamilyAccess(authorization);
  }
  
  // Otherwise require patient approval (if conscious)
  return await requestFamilyAccessApproval(patientPhone, familyPhone, relationship);
}
```

---

## See Also

- [Identification System](./identification-system.md)
- [Unified Health Inbox](./unified-health-inbox.md)
- [Security & Compliance](../../security/)