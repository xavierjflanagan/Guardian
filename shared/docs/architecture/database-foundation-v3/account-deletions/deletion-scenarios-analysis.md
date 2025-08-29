# Account & Profile Deletion Scenarios Analysis

**Created:** 2025-08-28  
**Purpose:** Analyze current and planned deletion behavior for healthcare data safety  
**Critical:** Understanding data preservation vs. deletion requirements

---

## Current V3 Architecture Analysis

### **Core ID Relationships:**
```
auth.users (account holders) 
  ↓ 1:many
user_profiles (individual patients: self, child, dependent, pet)
  ↓ 1:many  
Clinical Data (patient_clinical_events, documents, etc.)
```

### **Key Tables & Current ON DELETE Behavior:**

```sql
-- Core profile relationship
user_profiles.account_owner_id → auth.users(id)
  Current: NO explicit ON DELETE (defaults to RESTRICT)
  
-- Clinical data relationships  
patient_clinical_events.patient_id → user_profiles(id)
  Current: NO explicit ON DELETE (defaults to RESTRICT)
  
shell_files.patient_id → user_profiles(id) 
  Current: NO explicit ON DELETE (defaults to RESTRICT)
```

---

## Deletion Scenarios Analysis

### **Scenario 1: User Deletes Their Own Account (`auth.users` deletion)**

**Current Behavior:** 
- ❌ **BLOCKED** - Cannot delete account if any `user_profiles` exist
- **Why:** `user_profiles.account_owner_id` has implicit `ON DELETE RESTRICT`
- **Result:** PostgreSQL throws `ForeignKeyViolation` error

**Implications:**
- ✅ **Safe:** Cannot accidentally lose medical data
- ❌ **Poor UX:** User gets cryptic database error
- ❌ **No Cleanup Path:** No guidance on how to properly delete account

### **Scenario 2: User Deletes Their Own Profile (Self)**

**Current Behavior:**
- ❌ **BLOCKED** - Cannot delete profile if any clinical data exists  
- **Why:** All clinical tables have implicit `ON DELETE RESTRICT` to `user_profiles(id)`
- **Result:** PostgreSQL throws `ForeignKeyViolation` error

**Example blocked by:**
```sql
patient_clinical_events.patient_id → user_profiles(id) -- Has clinical events
shell_files.patient_id → user_profiles(id) -- Has documents  
patient_conditions.patient_id → user_profiles(id) -- Has conditions
```

### **Scenario 3: User Deletes Child Profile**

**Current Behavior:**
- ❌ **BLOCKED** - Same as Scenario 2
- **Why:** Child's clinical data prevents deletion
- **Critical Issue:** Parent cannot delete child profile even if child grows up and creates own account

### **Scenario 4: User Deletes Profile Despite Having Other Profiles**

**Current Behavior:**
- ❌ **BLOCKED** - Same foreign key restrictions apply
- **Additional Block:** Other profiles may reference this profile in transfer history

---

## Healthcare Data Retention Requirements

### **Australian Privacy Act 1988 Requirements:**
- **Minimum Retention:** Medical records must be kept for **7 years** after last treatment
- **Access Rights:** Patient has right to access their data even after account closure
- **Deletion Rights:** Patient has right to request deletion after retention period
- **Transfer Rights:** Patient can request transfer to new provider

### **Clinical Safety Requirements:**
- **Medical History Continuity:** Deleting medical history can endanger patient safety
- **Audit Trail:** Healthcare regulatory compliance requires complete audit trail
- **Provider Access:** Healthcare providers need access to historical data for treatment decisions

---

## Proposed V3 Solution Strategy

### **Phase 1: Account Archiving Instead of Deletion**

**Principle:** Never delete, always archive with proper access controls

```sql
-- Add archiving fields to core tables
ALTER TABLE auth.users ADD COLUMN archived_at TIMESTAMPTZ;
ALTER TABLE auth.users ADD COLUMN deletion_requested_at TIMESTAMPTZ;
ALTER TABLE auth.users ADD COLUMN deletion_reason TEXT;

ALTER TABLE user_profiles ADD COLUMN archived_at TIMESTAMPTZ;
ALTER TABLE user_profiles ADD COLUMN archived_by UUID REFERENCES auth.users(id);
ALTER TABLE user_profiles ADD COLUMN archival_reason TEXT;
```

**Deletion Flow:**
1. **User requests deletion** → Mark `deletion_requested_at`
2. **Grace period** (30 days) → User can cancel request  
3. **Archive account** → Set `archived_at`, disable login
4. **Preserve clinical data** → All medical records remain intact
5. **Access via provider** → Healthcare providers can still access historical data
6. **Final deletion** → After 7+ years, true deletion allowed

### **Phase 2: Explicit ON DELETE Policies**

Based on our analysis, here are the **correct** ON DELETE behaviors:

#### **Critical Clinical Data - NEVER CASCADE DELETE:**
```sql
-- Core profile relationship - PREVENT account deletion if profiles exist
user_profiles.account_owner_id → auth.users(id) ON DELETE RESTRICT

-- Clinical data - PREVENT profile deletion if clinical data exists  
patient_clinical_events.patient_id → user_profiles(id) ON DELETE RESTRICT
shell_files.patient_id → user_profiles(id) ON DELETE RESTRICT
patient_conditions.patient_id → user_profiles(id) ON DELETE RESTRICT
patient_medications.patient_id → user_profiles(id) ON DELETE RESTRICT
```

#### **Audit & Metadata - PRESERVE HISTORY:**
```sql
-- Preserve audit trail even if accounts deleted
audit_log.changed_by → auth.users(id) ON DELETE SET NULL
user_events.user_id → auth.users(id) ON DELETE SET NULL

-- Preserve clinical history context
provider_access_log.provider_id → provider_registry(id) ON DELETE SET NULL
```

#### **Semantic Relationships - CASCADE SAFELY:**
```sql
-- Narrative links are meaningless without parent narrative
narrative_condition_links.narrative_id → clinical_narratives(id) ON DELETE CASCADE
narrative_medication_links.narrative_id → clinical_narratives(id) ON DELETE CASCADE

-- Clinical narratives belong to shell files
clinical_narratives.shell_file_id → shell_files(id) ON DELETE CASCADE
```

### **Phase 3: Application-Layer Deletion Workflow**

**Instead of direct database deletion, implement:**

```typescript
// Safe profile archival workflow
async function archiveProfile(profileId: string, reason: string) {
  // 1. Check if profile has clinical data
  const hasClinicalData = await checkClinicalDataExists(profileId);
  
  if (hasClinicalData) {
    // 2. Archive instead of delete
    await supabase
      .from('user_profiles')
      .update({
        archived_at: new Date(),
        archival_reason: reason,
        archived_by: currentUser.id,
        recovery_expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
      })
      .eq('id', profileId);
      
    // 3. REVOKE all provider access - respect patient autonomy
    await revokeAllProviderAccess(profileId);
    
    return { archived: true, deletedPermanently: false, recoveryUntil: recovery_expires_at };
  } else {
    // 4. Safe to delete if no clinical data
    await deleteProfileSafely(profileId);
    return { archived: false, deletedPermanently: true };
  }
}
```

---

## Implementation Status & Plan

### **✅ COMPLETED Actions** (August 28, 2025):

1. ✅ **Enhanced Archival Fields Added** to `user_profiles` and `auth.users` 
   - ✅ `user_profiles` table: `archived_at`, `archived_by`, `recovery_expires_at`, `processing_restricted_at`, `legal_hold`, etc.
   - ✅ `user_account_archival` table: GDPR-compliant account closure tracking extending auth.users
2. ✅ **Explicit RESTRICT Policies** implemented for all clinical data relationships
   - ✅ All clinical tables now have explicit `ON DELETE RESTRICT` policies
   - ✅ Audit tables use `ON DELETE SET NULL` to preserve history
   - ✅ UUID casting consistency fixed in RLS policies
3. ✅ **Critical ENUM Types** added for data consistency and type safety
4. ✅ **Validation Infrastructure** created (`validate_v3_constraints.sql`)

### **📋 PENDING Implementation:**

1. **Create Archive Functions** instead of delete functions (application-layer)
2. **Add Application Logic** to handle `ForeignKeyViolation` gracefully (frontend)
3. **User-Friendly Deletion UI** with clear explanations (frontend)
4. **Account Recovery System** within 30-day grace period (application workflow)
5. **Retention Period Automation** for compliance (background jobs)

### **🎯 PLANNED Enhancement:**

1. **Profile Ownership Transfer** for child-to-adult account migration
   - 📋 **GitHub Issue #42** created with detailed requirements
   - 🕐 **Timeline**: Post-V3 deployment (4 weeks estimated)

### **Phase 4: Profile Ownership Transfer (Future Enhancement)**

**Child-to-Adult Account Migration:**
- 16+ year olds can request profile transfer from parent account
- Secure email verification + magic link workflow  
- 7-day approval window with parent consent required
- Immutable audit trail of ownership changes
- Original account retains historical access logs but loses ongoing access

**Implementation deferred to post-V3 deployment - See GitHub Issue for detailed requirements**

---

## Security & Compliance Benefits

### **Multi-Jurisdictional Healthcare Compliance:**
- ✅ **Australia (Privacy Act)**: Supports mandatory retention (7 years/until 25 for minors) + destruction/de-identification obligations
- ✅ **US (HIPAA + State Law)**: Meets provider retention requirements (6-10+ years), supports patient access/amendment rights  
- ✅ **EU (GDPR)**: Article 17 exemptions (medical data, legal obligation), Article 18 processing restriction support
- ✅ **Cross-Border**: Region-aware retention registry + jurisdiction-specific data classification
- ✅ **Patient Data Autonomy**: Complete provider access revocation upon account deletion (respects patient control)
- ✅ **Legal Hold Exceptions**: Court orders/litigation only - not general provider access post-deletion

### **Expert Validation (GPT-5 & Gemini 2.5 Pro Reviews):**
- ✅ **Unanimously Endorsed**: Both experts strongly recommended RESTRICT + archival approach for healthcare data
- ✅ **Safety-First Philosophy**: "Never allow true DELETE of clinical data" - gold standard for regulated environments
- ✅ **Implementation Approach**: Both recommended implementing explicit policies immediately (Phase 1)
- ✅ **Architectural Correctness**: Praised separation of database safety vs application UX concerns

### **Enhanced Data Safety:**
- ✅ **PII Separation**: Dedicated `pii_identity` table keyed by stable `subject_id` enables GDPR-compliant erasure
- ✅ **Processing Restriction**: GDPR Article 18 support via `processing_restricted_at` flags
- ✅ **Legal Hold Override**: Prevents any purge when litigation/regulatory hold active
- ✅ **Immutable Audit Trail**: Complete retention/erasure actions logged for compliance evidence
- ✅ **Graceful family/dependent relationship handling** with ownership transfer workflows

---

## Current Status & Next Steps

**Current State:** ✅ **DATABASE FOUNDATION COMPLETE** - Explicit `RESTRICT` policies implemented with comprehensive archival system

**✅ Database Layer:** Complete - All critical infrastructure implemented
**📋 Application Layer:** Pending - UX workflows and business logic needed  
**🎯 Future Enhancements:** Planned - Profile transfer system designed

**Next Phase Actions:**
1. ✅ **Database safety locks** - COMPLETE (explicit RESTRICT policies)
2. ✅ **Enhanced archival tracking** - COMPLETE (comprehensive field system)
3. 📋 **Application-layer archival workflow** - PENDING (Phase 2: Frontend integration)
4. 📋 **User-friendly deletion UX** - PENDING (Phase 2: Frontend integration)
5. 🎯 **Profile ownership transfer** - PLANNED (Post-V3: GitHub Issue #42)

---

**Status Summary:** Database foundation is **production-ready** with healthcare-compliant deletion safety. Frontend integration and user workflows remain to be implemented in Phase 2.