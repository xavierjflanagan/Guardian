# Healthcare Permission Model Analysis

**Created:** August 28, 2025  
**Purpose:** Document comprehensive healthcare permission hierarchy and emergency access design  
**Status:** Analysis of current V3 database permission model

---

## User's Original Permission Requirements (Verbatim)

> mmm i think any registered healthcare doctor provider should have the ability to grant themselves emergency permissions in the event of a medical emergency so that they can read the file, but this woudl send off lots of allerts abd 'break the glass' etc. aka they can look them up if they have their detials and click confirm to being liable if its not an emergency.... Also i think a user can grant civilians emergency status (emergency contact type thing), where they can also break the glass if its an emergency. Then there is the read-only permissions which may be given to spouses or adult children to keep an eye on parents etc. they can always view the profile without the profile owner getting notified (but it would be in the logs). The user may also grant read access to all healthcare providers if they wish, or to specific providers, or they may grant read-write to all providers or to specific providers. They may also grant read-write persmissiont o their spouse so that their spouse can upload files to their profiel ont heir behalf (effectively this turns their account into a 'mirror type' 'sub profile' on their spouses account, which can be revoked by the rightful owner at any time (i actually love this concept and it will probably be used a lot, such as a elderly parent giving up control of their health to their adult child who is on top of their health and supporting them to all their appointments etc).

---

## Comprehensive Permission Model Architecture

### **1. Emergency Access ("Break the Glass")**

#### **Healthcare Provider Emergency Access**
- **Who**: Registered healthcare providers (doctors, paramedics)
- **Mechanism**: **Two-Key Approval System** - requires second registered provider confirmation
- **Security Controls**: 
  - **Two-Provider Verification**: Initial provider + confirming provider both must be registered
  - **Time-Limited Access**: Auto-expires after 24 hours
  - **Enhanced Audit Trail**: Complete chain of custody documentation
  - **Liability Confirmation**: Both providers must acknowledge legal responsibility
  - **Justification Required**: Free-text emergency reason (heavily audited)
- **Use Case**: Eg 1: ER doctor needs immediate access to unconscious patient's medical history. Eg 2: paramedic on street needs immediate access to history. 
- **Access Level**: Read-only with full medical data visibility

#### **Civilian Emergency Contact Access**
- **Who**: Pre-designated emergency contacts (family members, friends)
- **Mechanism**: User grants emergency contact status to selected exora users in advance
- **Security Controls**:
  - **Emergency Validation Required**: Must provide justification text
  - **Secondary Patient Notification**: Immediate notification sent to patient via exora app as well as SMS/call to the patient's phone, If patient responds to notification in non confirming way, access for emergency contact immediately revoked.
  - **Time-Limited Access**: Auto-expires after 24 hours
  - **Annual updates required** User prompted to update/re-confirm permissions every 12 months, via in-app + email reminder systems
  - **Enhanced Monitoring**: All access heavily audited and flagged
  - **Revocation on Response**: If patient responds to notification, access immediately revoked
- **Use Case**: Spouse needs access when patient is unconscious/incapacitated
- **Access Level**: Read-only emergency access with time constraints

### **2. Regular User-Granted Permissions**

#### **Read-Only Family/Caregiver Access**
- **Who**: Spouses, adult children, designated caregivers
- **Purpose**: Quiet health monitoring and oversight
- **Key Feature**: **No notifications sent to profile owner** (quiet access)
- **Audit**: All access logged but profile owner not alerted
- **Annal updates required** User prompted to update/re-confirm permissions every 12 months, via in-app + email reminder systems
- **Use Cases**:
  - Adult children monitoring elderly parents' health
  - Spouses keeping track of each other's medical appointments
  - Caregivers staying informed without being intrusive

#### **Healthcare Provider Read Access**
- **Who**: Specific providers OR all healthcare providers (user's choice but specific selection recommended and is default for privacy reasons)
- **Purpose**: Standard healthcare relationship permissions
- **User Control**: Patient decides which providers can access their data
- **Scope**: Normal medical record viewing for treatment purposes
- **Annal updates required** User prompted to update/re-confirm permissions every 12 months, via in-app + email reminder systems
- **CRITICAL PRIVACY WARNING**: "All providers" access grants EVERY registered healthcare provider on the platform access to your complete medical history. This includes doctors you've never met and may never meet. This feature must display explicit warnings about the privacy implications of such a broad grant, including potential for unauthorized access by providers with no legitimate medical need. Default must always be specific, named providers only.

#### **Healthcare Provider Read-Write Access**
- **Who**: Specific providers OR all healthcare providers (user's choice but specific selection recommended and is default for privacy reasons)
- **Purpose**: Providers can contribute to patient's medical record
- **Capabilities**: Upload clinical files, test results, clinical notes, prescriptions, treatment plans. Unable to delete, only add through file upload (or APIs in the future)
- **User Control**: Patient grants based on trust and healthcare relationship
- **Annal updates required** User prompted to update/re-confirm permissions every 12 months, via in-app + email reminder systems
- **EXTREME RISK WARNING**: "All providers" write access allows ANY healthcare provider to add to your medical record, add medications, upload documents, and alter your health information permanently. This creates  liability and safety risks as providers with no knowledge of your care could make dangerous modifications. This feature should require multiple verification steps, legal acknowledgment, and explicit warnings about irreversible modifications to your health record.

#### **Full Mirror Access (Caregiver Read-Write)**
- **Innovation**: "Caregiver Takeover" model
- **Who**: Trusted Caregivers, family members (typically adult children, spouses)
- **Capabilities**: 
  - Upload files on behalf of profile owner
  - Manage medical appointments
  - Essentially "become" the patient in the system for healthcare management
- **Technical Architecture** 
  - **Database Integration**: Seamlessly integrates with existing sub-profile architecture through `transferred_from`/`transferred_to` fields and `profile_access_permissions` table
  - **Mirror Visibility**: Original owner retains `read_only` access to monitor their health management
  - **Identity Verification**: Robust consent process with legal documentation and secondary identity verification 
- **Key Features**:
  - **Revocable**: Original owner can revoke at any time
  - **Complete delegation**: Full healthcare management authority
  - **Primary Use Case**: Elderly parent delegates health management to adult child
- **Business Value**: Addresses aging population healthcare management needs

---

## SECURITY ARCHITECTURE ANALYSIS

### **Critical Flaw in Current V3 ENUM Implementation**

The existing linear ENUM hierarchy has a fundamental architectural flaw:

```sql
-- CURRENT PROBLEMATIC IMPLEMENTATION:
CREATE TYPE access_level_type AS ENUM (
    'none', 'emergency', 'read_only', 'read_write', 'full_access', 'owner'
);
```

**The Problem**: This implies `read_only` ≥ `emergency`, meaning family members with quiet monitoring could trigger "break glass" emergency access. Emergency access and ongoing family monitoring are orthogonal permissions, not hierarchical levels.

---

## V3 DATABASE INTEGRATION CONTEXT

### **Existing V3 Architecture Dependencies**

This permission model integrates with the comprehensive V3 database foundation:

**Core Profile System** (`02_profiles.sql`):
- `user_profiles` table with existing profile hierarchy
- Current `profile_access_permissions` table (to be enhanced)  
- Sub-profile architecture with `transferred_from`/`transferred_to` fields
- Profile relationship management system

**Healthcare Provider System** (`05_healthcare_journey.sql`):
- `provider_registry` table for healthcare provider verification
- `patient_provider_access` table for provider relationships
- `provider_access_log` partitioned audit table
- Australian AHPRA verification system

**Security and Consent Management** (`06_security.sql`):
- `patient_consents` GDPR-compliant consent tracking
- `patient_consent_audit` comprehensive audit trail
- Enhanced RLS policies with `has_semantic_data_access()` function

**Clinical Data Integration** (`03_clinical_core.sql`, `04_ai_processing.sql`):
- `shell_files` and `clinical_narratives` for medical records
- `patient_clinical_events` for healthcare events
- Semantic architecture for clinical data linking

### **Integration Points**

1. **Provider Verification**: Two-key approval leverages `provider_registry` verification status
2. **Consent Management**: Permission grants integrate with `patient_consents` tracking
3. **Audit Compliance**: All access logged in `provider_access_log` and `user_events` 
4. **Profile Transfers**: Mirror access uses existing `transferred_from`/`transferred_to` architecture
5. **RLS Security**: New permissions work within existing `has_profile_access()` framework

---

## REVISED ARCHITECTURE: Attribute-Based Permissions

### **New Attribute-Based Permission Structure**

Replace the flawed linear ENUM with granular, composable permission attributes:

```sql
-- REVISED: profile_access_permissions table structure
CREATE TABLE profile_access_permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id UUID NOT NULL REFERENCES user_profiles(id),
    user_id UUID NOT NULL REFERENCES auth.users(id),
    
    -- Base role defines core access level
    base_role TEXT CHECK (base_role IN ('viewer', 'editor', 'manager', 'owner')),
    
    -- Specific permission capabilities (orthogonal to base role)
    can_break_glass BOOLEAN DEFAULT FALSE,
    is_quiet_viewer BOOLEAN DEFAULT FALSE,
    is_emergency_contact BOOLEAN DEFAULT FALSE,
    can_manage_care BOOLEAN DEFAULT FALSE,
    requires_two_key_approval BOOLEAN DEFAULT FALSE,
    
    -- Access controls and limits
    access_time_limit INTERVAL,
    justification_required BOOLEAN DEFAULT FALSE,
    liability_acknowledged BOOLEAN DEFAULT FALSE,
    
    -- Existing fields maintained
    access_start_date TIMESTAMPTZ DEFAULT NOW(),
    access_end_date TIMESTAMPTZ,
    granted_by UUID REFERENCES auth.users(id),
    granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    revoked_at TIMESTAMPTZ,
    revoke_reason TEXT,
    
    -- Ensure single permission per user per profile
    UNIQUE(profile_id, user_id)
);
```

**🔍 DESIGN NOTE**: The `can_break_glass` flag does not grant the ability to initiate an emergency request. Instead, it serves as a **metadata marker** on a permission record that is programmatically created after a successful two-key approval. The capability to initiate a request is determined by a provider's verified status in the `provider_registry`.

### **Base Role Capability Definitions**

**`viewer` Role:**
- **Read Access**: View all medical records, documents, clinical narratives
- **Navigation**: Browse healthcare timeline, conditions, medications
- **Export**: Generate read-only reports and summaries
- **Restrictions**: Cannot upload, modify, or delete any data

**`editor` Role:**
- **Includes**: All `viewer` capabilities
- **Upload Access**: Add new documents, test results, clinical files
- **Data Entry**: Create new clinical records, observations, interventions
- **Medication Management**: Add medications (cannot remove existing ones)
- **Restrictions**: Cannot delete existing data or modify core profile settings

**`manager` Role:**
- **Includes**: All `editor` capabilities  
- **Profile Management**: Modify profile settings, contact information
- **Permission Grants**: Grant access to other users (within limits)
- **Care Coordination**: Schedule appointments, manage provider relationships
- **Restrictions**: Cannot delete account or revoke own access

**`owner` Role:**
- **Includes**: All `manager` capabilities
- **Full Control**: Complete account ownership and management
- **Access Control**: Grant/revoke any permissions, including manager level
- **Account Management**: Delete account, transfer ownership
- **Ultimate Authority**: Override any restrictions or access controls

### **Permission Type Mapping**
- **Quiet Family Access**: `base_role = 'viewer'`, `is_quiet_viewer = TRUE`
- **Emergency Contact**: `base_role = 'viewer'`, `is_emergency_contact = TRUE`, `access_time_limit = '24 hours'`
- **Healthcare Provider Emergency**: `base_role = 'editor'`, `can_break_glass = TRUE`, `requires_two_key_approval = TRUE`, `access_time_limit = '48 hours'`
- **Mirror Access Caregiver**: `base_role = 'manager'`, `can_manage_care = TRUE`, `liability_acknowledged = TRUE`

---

## TECHNICAL IMPLEMENTATION DETAILS

### **Two-Key Approval System Architecture**

The two-key approval system for healthcare provider emergency access requires additional supporting tables:

```sql
-- Emergency access requests and approvals
CREATE TABLE emergency_access_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES user_profiles(id),
    requesting_provider_id UUID NOT NULL REFERENCES provider_registry(id),
    approving_provider_id UUID REFERENCES provider_registry(id),
    
    -- Request Details
    request_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    emergency_justification TEXT NOT NULL,
    medical_context TEXT,
    patient_identifiers JSONB, -- How they identified the patient
    
    -- Approval Process
    approval_status TEXT NOT NULL DEFAULT 'pending' CHECK (approval_status IN (
        'pending', 'approved', 'denied', 'expired', 'revoked'
    )),
    approved_at TIMESTAMPTZ,
    denied_at TIMESTAMPTZ,
    denial_reason TEXT,
    expires_at TIMESTAMPTZ, -- Auto-calculated based on access_time_limit
    
    -- Liability and Legal
    requesting_provider_liability_ack BOOLEAN DEFAULT FALSE,
    approving_provider_liability_ack BOOLEAN DEFAULT FALSE,
    legal_disclaimer_accepted BOOLEAN DEFAULT FALSE,
    
    -- Technical Context
    request_ip_address INET,
    approval_ip_address INET,
    session_context JSONB,
    
    -- Audit and Compliance
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Time-limited access enforcement (supports both providers and civilians)
CREATE TABLE active_emergency_access (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    emergency_request_id UUID NOT NULL REFERENCES emergency_access_requests(id),
    patient_id UUID NOT NULL REFERENCES user_profiles(id), 
    user_id UUID NOT NULL REFERENCES auth.users(id), -- Generic user (provider or civilian)
    provider_registry_id UUID REFERENCES provider_registry(id), -- Optional, for healthcare providers only
    
    -- Access Control
    access_granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    access_expires_at TIMESTAMPTZ NOT NULL,
    access_revoked_at TIMESTAMPTZ,
    revocation_reason TEXT,
    
    -- Usage Tracking
    first_data_access TIMESTAMPTZ,
    last_data_access TIMESTAMPTZ,
    total_access_count INTEGER DEFAULT 0,
    
    -- Automatic Cleanup
    cleanup_completed BOOLEAN DEFAULT FALSE,
    cleanup_timestamp TIMESTAMPTZ
);
```

### **Emergency Contact Notification System**

Secondary patient notification requires integration with existing notification infrastructure:

```sql
-- Patient emergency notifications
CREATE TABLE emergency_contact_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES user_profiles(id),
    emergency_contact_user_id UUID NOT NULL REFERENCES auth.users(id),
    
    -- Notification Details
    notification_type TEXT NOT NULL CHECK (notification_type IN (
        'sms', 'phone_call', 'email', 'push_notification'
    )),
    notification_status TEXT NOT NULL DEFAULT 'pending' CHECK (notification_status IN (
        'pending', 'sent', 'delivered', 'failed', 'responded'
    )),
    
    -- Patient Response Tracking
    patient_response TEXT CHECK (patient_response IN (
        'approved', 'denied', 'no_response'
    )),
    patient_responded_at TIMESTAMPTZ,
    access_revoked_due_to_response BOOLEAN DEFAULT FALSE,
    
    -- Technical Details
    notification_payload JSONB,
    delivery_timestamp TIMESTAMPTZ,
    response_timestamp TIMESTAMPTZ,
    
    -- Audit
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### **Mirror Access Transfer Process**

Mirror access leverages the existing sub-profile architecture with additional verification:

**Process Flow:**
1. **Legal Consent Collection**: Comprehensive consent form with legal review
2. **Identity Verification**: Secondary verification of both parties
3. **Profile Transfer**: Use existing `transferred_from`/`transferred_to` fields
4. **Access Configuration**: Set `can_manage_care = TRUE`, `base_role = 'manager'`
5. **Mirror Access Setup**: Original owner gets `base_role = 'viewer'`, `is_quiet_viewer = TRUE`
6. **Ongoing Monitoring**: All caregiver actions visible to original owner

---

## Business Innovation Highlights

### **"Mirror Access" Concept**
The full read-write family access creating a "mirror profile" is genuinely innovative:
- **Market Need**: Aging population requiring healthcare management support
- **Technical Solution**: Seamless delegation without losing original ownership
- **User Experience**: Adult child can manage parent's healthcare as if it were their own account
- **Legal Safety**: Revocable at any time by original owner

### **Quiet Access**
Read-only family access without notifications addresses real-world family dynamics:
- **Practical Need**: Family members wanting to stay informed without being intrusive
- **Technical Implementation**: Access logged but owner not notified
- **Legal Compliance**: Full audit trail maintains HIPAA compliance while respecting family dynamics
- **Use Cases**: Adult children monitoring elderly parents, spouses staying informed
- **Security Safeguard**: Limited to `base_role = 'viewer'` only - no emergency or editing permissions

---

## COMPREHENSIVE SECURITY CONSIDERATIONS

### **Critical Security Improvements Implemented**

#### **1. Emergency Access Security Controls**
- **Two-Key Approval System**: Eliminates single-provider abuse risk
- **Time-Limited Access**: Auto-expiration prevents lingering permissions
- **Enhanced Justification**: Required free-text reasoning for all emergency access
- **Real-Time Monitoring**: Immediate alerts for all break-glass events

#### **2. Civilian Emergency Contact Safeguards** 
- **Secondary Patient Verification**: SMS/call to patient's phone when access triggered
- **Automatic Revocation**: Access immediately terminated if patient responds
- **24-Hour Time Limit**: Much shorter than provider emergency access
- **Enhanced Audit Trail**: Every action logged with timestamp and justification

#### **3. Mirror Access ("Caregiver Takeover") Security Framework**
- **Legal Consent Process**: Comprehensive consent documentation with legal review
- **Identity Verification**: Secondary verification steps before granting full control
- **Original Owner Monitoring**: Maintains read-only "mirror" access for transparency
- **Revocation Process**: Clear, immediate revocation capability for original owner
- **Database Integration**: Leverages existing `transferred_from`/`transferred_to` architecture

#### **4. Quiet Access Compliance Framework**
- **Full Audit Compliance**: Complete logging maintains legal requirements
- **Limited Scope**: Strictly read-only viewer permissions only
- **No Emergency Permissions**: Cannot trigger break-glass or emergency access
- **Family Dynamics Balance**: Respects legitimate family oversight needs

### **Insider Threat Mitigation**

#### **Healthcare Provider Controls**
- **Registration Verification**: Only verified doctors, paramedics, registered nurses
- **Two-Provider Requirement**: Prevents single rogue provider abuse
- **Cross-Verification**: Second provider must independently verify emergency
- **Liability Acknowledgment**: Both providers legally accountable

#### **System-Wide Monitoring**
- **Anomaly Detection**: Unusual access patterns flagged for review
- **Geographic Validation**: Optional proximity checks for emergency access
- **Time-Based Analysis**: Access outside normal hours receives extra scrutiny
- **Compliance Reporting**: Regular audit reports for regulatory compliance

### **Legal and Regulatory Compliance**

#### **HIPAA Compliance**
- **Accounting of Disclosures**: Complete audit trail for all access
- **Minimum Necessary Standard**: Access limited to medical necessity
- **Business Associate Agreements**: Provider access agreements documented
- **Patient Rights**: Clear processes for access review and revocation

#### **Australian Privacy Act 1988 Compliance**
- **Consent Management**: Granular consent tracking and documentation
- **Data Subject Rights**: Access, correction, and deletion rights maintained
- **Notification Obligations**: Breach notification processes established
- **Cross-Border Transfer**: International access controls where applicable

### **Risk Assessment and Mitigation**

#### **High-Risk Scenarios Addressed**
1. **Celebrity/High-Profile Patient**: Two-key system prevents unauthorized provider access
2. **Abusive Ex-Spouse**: Time limits and patient notification prevent misuse
3. **Rogue Healthcare Provider**: Cross-verification requirements eliminate single-point failure
4. **Family Disputes**: Revocation processes protect patient autonomy
5. **System Compromise**: Attribute-based model limits scope of any single breach

#### **Ongoing Security Measures**
- **Regular Security Audits**: Quarterly review of access patterns
- **Provider Credential Verification**: Ongoing validation of healthcare provider status
- **Emergency Contact Review**: Annual review of emergency contact designations
- **Technology Updates**: Continuous improvement of security controls

---

## IMPLEMENTATION ROADMAP

### **Phase 1: Core Architecture Migration** (Weeks 1-4)

**Database Schema Changes:**
```sql
-- 1. Add new columns to existing profile_access_permissions table
ALTER TABLE profile_access_permissions ADD COLUMN base_role TEXT CHECK (base_role IN ('viewer', 'editor', 'manager', 'owner'));
ALTER TABLE profile_access_permissions ADD COLUMN can_break_glass BOOLEAN DEFAULT FALSE;
ALTER TABLE profile_access_permissions ADD COLUMN is_quiet_viewer BOOLEAN DEFAULT FALSE;
ALTER TABLE profile_access_permissions ADD COLUMN is_emergency_contact BOOLEAN DEFAULT FALSE;
ALTER TABLE profile_access_permissions ADD COLUMN can_manage_care BOOLEAN DEFAULT FALSE;
ALTER TABLE profile_access_permissions ADD COLUMN requires_two_key_approval BOOLEAN DEFAULT FALSE;
ALTER TABLE profile_access_permissions ADD COLUMN access_time_limit INTERVAL;
ALTER TABLE profile_access_permissions ADD COLUMN justification_required BOOLEAN DEFAULT FALSE;
ALTER TABLE profile_access_permissions ADD COLUMN liability_acknowledged BOOLEAN DEFAULT FALSE;

-- 2. Data migration from ENUM to attribute system
UPDATE profile_access_permissions SET 
    base_role = CASE access_level 
        WHEN 'owner' THEN 'owner'
        WHEN 'full_access' THEN 'manager'
        WHEN 'read_write' THEN 'editor'  
        WHEN 'read_only' THEN 'viewer'
        WHEN 'emergency' THEN 'viewer'
        ELSE 'viewer'
    END,
    can_break_glass = (access_level = 'emergency'),
    is_quiet_viewer = (access_level = 'read_only'),
    can_manage_care = (access_level = 'full_access');

-- 3. Create supporting tables
CREATE TABLE emergency_access_requests (...); -- Full schema from technical details
CREATE TABLE active_emergency_access (...);
CREATE TABLE emergency_contact_notifications (...);
```

**Application Updates:**
- Update `has_profile_access_level()` function to use attribute-based logic
- Modify RLS policies to handle new permission attributes
- Update frontend permission management interfaces

### **Phase 2: Emergency Access Controls** (Weeks 5-8)

**Two-Key Approval System:**
```sql
-- Create workflow functions
CREATE OR REPLACE FUNCTION request_emergency_access(
    p_patient_id UUID,
    p_requesting_provider_id UUID,
    p_justification TEXT
) RETURNS UUID;

CREATE OR REPLACE FUNCTION approve_emergency_access(
    p_request_id UUID,
    p_approving_provider_id UUID
) RETURNS BOOLEAN;
```

**Notification System Integration:**
- Build SMS/phone notification infrastructure
- Implement patient response handling
- Create automatic access revocation triggers
- Deploy real-time monitoring dashboards

**Provider Dashboard Requirements:**
- **Pending Approvals Queue**: Dashboard showing emergency access requests awaiting approval
- **Emergency Request History**: Audit trail of all requests initiated or approved by provider
- **Active Emergency Sessions**: Current active emergency access grants with expiry timers
- **Quick Actions**: One-click approve/deny with justification requirements
- **Risk Indicators**: Flags for unusual patterns or high-risk requests

### **Phase 3: Mirror Access Implementation** (Weeks 9-12)

**Profile Transfer Enhancements:**
```sql
-- Enhance existing transfer system
CREATE OR REPLACE FUNCTION initiate_mirror_access_transfer(
    p_source_profile_id UUID,
    p_target_user_id UUID,
    p_legal_consent_document TEXT
) RETURNS UUID;
```

**Legal and Identity Framework:**
- Design comprehensive consent forms
- Implement identity verification workflows  
- Build caregiver onboarding process
- Create revocation and dispute resolution system

### **Phase 4: Monitoring and Compliance** (Weeks 13-16)

**Advanced Security Features:**
- Anomaly detection algorithms for unusual access patterns
- Geographic and temporal access analysis
- Provider credential verification automation
- Compliance reporting automation

**Performance Optimization:**
```sql
-- Add indexes for new attribute columns
CREATE INDEX idx_profile_access_base_role ON profile_access_permissions(base_role);
CREATE INDEX idx_profile_access_emergency ON profile_access_permissions(can_break_glass, is_emergency_contact) WHERE can_break_glass = TRUE OR is_emergency_contact = TRUE;
CREATE INDEX idx_emergency_access_expiry ON active_emergency_access(access_expires_at) WHERE access_revoked_at IS NULL;
```

### **Migration Strategy and Data Safety**

**Backwards Compatibility:**
- Maintain ENUM columns during migration period
- Run dual-system validation for 2 weeks
- Gradual migration of existing permissions
- Rollback plan if issues detected

**Testing Requirements:**
- Complete RLS policy testing with new attributes
- Emergency access workflow testing
- Performance testing under load
- Security penetration testing for new features

---

**Document Status**: Complete healthcare permission model with secure architecture  
**Architecture Decision**: Attribute-based permissions replace flawed linear ENUM hierarchy  
**Security Assessment**: Comprehensive security controls for all access types implemented  
**Next Steps**: Technical implementation of attribute-based permission system  
**Created by**: Claude Code Analysis with expert security review integration