# Healthcare Provider Integration

**Status**: Database Foundation Ready - Provider Portal Development Pending
**Created**: 29 September 2025
**Last Updated**: 29 September 2025

## Overview

The Guardian V3 database foundation includes comprehensive healthcare provider infrastructure designed to support future provider portal development. This document provides a complete overview of the current provider-related database architecture for rapid development reference.

## Current Provider Database Architecture

### **Provider Registry & Identity (05_healthcare_journey.sql)**

#### **Core Provider Table**
```sql
provider_registry (
  id UUID PRIMARY KEY,                    -- Provider unique identifier
  user_id UUID REFERENCES auth.users(id), -- Links to authentication account

  -- Provider Classification
  provider_type TEXT CHECK (              -- Individual vs organization
    'individual_practitioner', 'healthcare_organization', 'clinic',
    'hospital_system', 'laboratory', 'imaging_center', 'pharmacy', 'allied_health'
  ),

  -- Individual Provider Details
  first_name, last_name, middle_name, preferred_name, title,

  -- Organization Details
  organization_name, trading_name,

  -- Professional Details
  primary_specialty TEXT,
  subspecialties TEXT[],
  professional_qualifications TEXT[],
  languages_spoken TEXT[] DEFAULT ARRAY['English'],

  -- Practice Information
  practice_address JSONB,
  phone_numbers JSONB,
  email_addresses JSONB,
  website_url TEXT,

  -- Registration & Compliance
  registration_number TEXT,              -- AHPRA/NPI numbers
  registration_type TEXT,               -- 'ahpra', 'npi', 'state_license'
  registration_status TEXT,             -- 'active', 'suspended', 'expired'
  registration_expiry DATE,

  -- Provider Status
  provider_status TEXT DEFAULT 'pending', -- 'pending', 'verified', 'active', 'suspended'
  verification_level TEXT DEFAULT 'unverified',
  verification_documents JSONB,
  last_credential_check TIMESTAMPTZ
)
```

#### **Australian Doctor Verification**
```sql
registered_doctors_au (
  id UUID PRIMARY KEY,
  provider_id UUID REFERENCES provider_registry(id),

  -- AHPRA Registration Details
  ahpra_registration_number TEXT UNIQUE NOT NULL,
  registration_type TEXT,              -- 'general', 'specialist', 'limited'
  registration_status TEXT,           -- 'active', 'suspended', 'cancelled'

  -- Medical Registration
  medical_specialty TEXT,
  specialist_qualifications TEXT[],
  medicare_provider_number TEXT,      -- For Medicare billing

  -- Practice Rights
  practice_locations TEXT[],          -- Where provider can practice
  prescribing_rights BOOLEAN DEFAULT TRUE,
  restricted_prescribing BOOLEAN DEFAULT FALSE,

  -- Verification
  ahpra_verified_at TIMESTAMPTZ,
  verification_source TEXT DEFAULT 'ahpra_lookup',
  last_verification_check TIMESTAMPTZ
)
```

### **Patient-Provider Access Control**

#### **Access Permissions**
```sql
patient_provider_access (
  id UUID PRIMARY KEY,
  patient_id UUID REFERENCES user_profiles(id),    -- Patient granting access
  provider_id UUID REFERENCES provider_registry(id), -- Provider receiving access

  -- Permission Configuration
  permission_scope TEXT CHECK (
    'read_only', 'read_write', 'emergency_only', 'consultation_specific'
  ),
  access_level TEXT CHECK (
    'summary_only', 'full_records', 'specific_conditions', 'time_limited'
  ),

  -- Granular Permissions
  can_view_medications BOOLEAN DEFAULT TRUE,
  can_view_allergies BOOLEAN DEFAULT TRUE,
  can_view_conditions BOOLEAN DEFAULT TRUE,
  can_view_lab_results BOOLEAN DEFAULT TRUE,
  can_view_imaging BOOLEAN DEFAULT TRUE,
  can_add_notes BOOLEAN DEFAULT FALSE,
  can_add_prescriptions BOOLEAN DEFAULT FALSE,

  -- Time-based Access
  access_granted_at TIMESTAMPTZ DEFAULT NOW(),
  access_expires_at TIMESTAMPTZ,
  last_accessed_at TIMESTAMPTZ,

  -- Context
  access_reason TEXT,                  -- 'consultation', 'referral', 'emergency', 'ongoing_care'
  referring_provider_id UUID REFERENCES provider_registry(id),

  -- Status
  access_status TEXT DEFAULT 'active', -- 'active', 'suspended', 'revoked', 'expired'
  revoked_at TIMESTAMPTZ,
  revocation_reason TEXT
)
```

#### **Access Audit Trail**
```sql
provider_access_log (              -- Partitioned by quarter for performance
  id UUID PRIMARY KEY,
  patient_id UUID REFERENCES user_profiles(id),
  provider_id UUID REFERENCES provider_registry(id),

  -- Access Details
  access_type TEXT,                -- 'record_view', 'note_created', 'prescription_added'
  accessed_resource TEXT,          -- Table/record accessed
  resource_id UUID,               -- Specific record ID

  -- Context
  access_method TEXT,             -- 'portal', 'api', 'mobile_app'
  session_id TEXT,
  ip_address INET,
  user_agent TEXT,

  -- Audit
  accessed_at TIMESTAMPTZ DEFAULT NOW(),
  duration_seconds INTEGER,
  success BOOLEAN DEFAULT TRUE,
  failure_reason TEXT
) PARTITION BY RANGE (accessed_at);

-- Quarterly partitions for performance
provider_access_log_2025_q1, q2, q3, q4 -- Auto-created partitions
```

### **Clinical Interaction & Decision Support**

#### **Provider Action Items (AI-Generated)**
```sql
provider_action_items (
  id UUID PRIMARY KEY,
  patient_id UUID REFERENCES user_profiles(id),
  provider_id UUID REFERENCES provider_registry(id),

  -- Action Classification
  action_type TEXT CHECK (
    'medication_review', 'follow_up_appointment', 'diagnostic_test', 'referral_needed',
    'lab_result_review', 'medication_adherence_check', 'care_plan_update',
    'patient_education', 'lifestyle_counseling', 'emergency_assessment'
  ),
  priority TEXT CHECK ('low', 'medium', 'high', 'urgent', 'critical'),

  -- Clinical Context
  related_condition TEXT,
  clinical_context TEXT NOT NULL,

  -- Semantic Integration
  shell_file_id UUID REFERENCES shell_files(id),         -- Source document
  narrative_id UUID REFERENCES clinical_narratives(id),   -- Clinical narrative
  clinical_event_id UUID REFERENCES patient_clinical_events(id), -- Triggering event

  -- Action Details
  action_title TEXT NOT NULL,
  action_description TEXT NOT NULL,
  recommended_timeframe TEXT,
  due_date DATE,

  -- AI-Generated Insights
  generated_by_ai BOOLEAN DEFAULT FALSE,
  ai_confidence_score NUMERIC(3,2),
  ai_reasoning TEXT,
  supporting_evidence TEXT[],

  -- Workflow Status
  status TEXT CHECK ('pending', 'in_progress', 'completed', 'cancelled', 'overdue', 'deferred'),
  assigned_to UUID REFERENCES provider_registry(id),
  completed_at TIMESTAMPTZ,
  completed_by UUID REFERENCES provider_registry(id),
  completion_notes TEXT,
  outcome TEXT
)
```

#### **Clinical Alert Rules Configuration**
```sql
clinical_alert_rules (
  id UUID PRIMARY KEY,

  -- Rule Identity
  rule_name TEXT UNIQUE NOT NULL,
  rule_category TEXT CHECK (
    'medication_safety', 'diagnostic_guidance', 'preventive_care', 'chronic_disease_management',
    'drug_interaction', 'allergy_alert', 'lab_value_critical', 'age_specific_care'
  ),
  rule_description TEXT NOT NULL,

  -- Clinical Logic
  trigger_conditions JSONB NOT NULL,    -- Structured conditions that trigger rule
  rule_logic JSONB NOT NULL,           -- Detailed rule execution logic
  alert_message_template TEXT NOT NULL,

  -- Rule Configuration
  severity TEXT CHECK ('info', 'low', 'medium', 'high', 'critical'),
  auto_dismiss BOOLEAN DEFAULT FALSE,
  requires_acknowledgment BOOLEAN DEFAULT TRUE,

  -- Clinical Context Filtering
  applicable_specialties TEXT[],        -- Which provider specialties
  applicable_conditions TEXT[],         -- Which patient conditions
  age_range_min INTEGER,               -- Age-specific rules
  age_range_max INTEGER,
  gender_specific TEXT CHECK ('male', 'female', 'any'),

  -- Evidence Base
  clinical_guideline_reference TEXT,
  evidence_level TEXT CHECK (
    'expert_opinion', 'case_series', 'cohort_study', 'rct', 'systematic_review', 'clinical_guideline'
  ),
  last_evidence_review DATE,

  -- Rule Performance
  rule_version TEXT DEFAULT '1.0',
  validation_status TEXT CHECK ('draft', 'testing', 'validated', 'active', 'deprecated'),
  false_positive_rate NUMERIC(3,2),
  clinical_utility_score NUMERIC(3,2),

  -- Lifecycle
  active BOOLEAN DEFAULT TRUE,
  created_by UUID REFERENCES auth.users(id)
)
```

#### **Provider Clinical Notes (Manual Input)**
```sql
provider_clinical_notes (
  id UUID PRIMARY KEY,
  patient_id UUID REFERENCES user_profiles(id),
  provider_id UUID REFERENCES provider_registry(id),

  -- Note Classification
  note_type TEXT CHECK (
    'progress_note', 'consultation_note', 'discharge_summary', 'referral_letter',
    'assessment_note', 'treatment_plan', 'medication_review', 'care_coordination'
  ),
  encounter_type TEXT CHECK (
    'office_visit', 'telehealth', 'hospital_round', 'home_visit', 'telephone_consultation'
  ),

  -- Semantic Integration (Optional)
  shell_file_id UUID REFERENCES shell_files(id),         -- If transcribed from file
  narrative_id UUID REFERENCES clinical_narratives(id),   -- Related clinical narrative
  clinical_event_id UUID REFERENCES patient_clinical_events(id), -- Associated event

  -- Clinical Content (SOAP Format)
  chief_complaint TEXT,
  history_present_illness TEXT,
  review_of_systems TEXT,
  physical_examination TEXT,
  assessment_text TEXT NOT NULL,
  plan_text TEXT NOT NULL,

  -- Structured Elements
  vital_signs JSONB,
  medications_reviewed TEXT[],
  allergies_confirmed TEXT[],

  -- Follow-up
  follow_up_instructions TEXT,
  referrals_made TEXT[],
  tests_ordered TEXT[],
  patient_education_provided TEXT[],

  -- Provider Workflow
  note_status TEXT CHECK ('draft', 'pending_review', 'final', 'amended', 'corrected'),
  dictated_at TIMESTAMPTZ,
  transcribed_at TIMESTAMPTZ,
  reviewed_at TIMESTAMPTZ,
  signed_at TIMESTAMPTZ,

  -- Quality & Compliance
  template_used TEXT,
  coding_reviewed BOOLEAN DEFAULT FALSE,
  billing_reviewed BOOLEAN DEFAULT FALSE
)
```

#### **Provider Context & Preferences**
```sql
healthcare_provider_context (
  id UUID PRIMARY KEY,
  provider_id UUID REFERENCES provider_registry(id),

  -- Practice Context
  practice_setting TEXT CHECK (
    'private_practice', 'public_hospital', 'private_hospital', 'community_health',
    'aged_care', 'mental_health', 'emergency_department', 'specialist_clinic'
  ),
  practice_location TEXT,

  -- Provider Configuration
  default_appointment_duration INTEGER DEFAULT 15, -- minutes
  consultation_fee NUMERIC(8,2),
  bulk_billing_threshold NUMERIC(8,2),

  -- Clinical Preferences
  preferred_clinical_templates TEXT[],
  default_medication_brands JSONB,
  standard_referral_providers JSONB,
  clinical_decision_support_preferences JSONB,

  -- Communication Preferences
  preferred_communication_methods TEXT[],
  emergency_contact_preferences JSONB,
  patient_portal_settings JSONB,

  -- Quality Metrics
  patient_satisfaction_score NUMERIC(3,2),
  clinical_outcome_metrics JSONB,
  peer_review_status TEXT,

  -- Workflow State
  active_patient_sessions JSONB,
  pending_tasks_count INTEGER DEFAULT 0,
  last_clinical_review DATE
)
```

## Integration with Core Clinical Data

### **Provider Data Access Patterns**

The provider system integrates seamlessly with Guardian's core clinical architecture:

#### **Clinical Data Access**
```sql
-- Provider views patient's complete clinical picture through RLS policies
SELECT ce.*, cn.ai_narrative_summary, sf.filename
FROM patient_clinical_events ce
LEFT JOIN clinical_narratives cn ON cn.shell_file_id = ce.shell_file_id
LEFT JOIN shell_files sf ON sf.id = ce.shell_file_id
WHERE ce.patient_id IN (
  SELECT patient_id FROM patient_provider_access
  WHERE provider_id = :provider_id
  AND access_status = 'active'
  AND (access_expires_at IS NULL OR access_expires_at > NOW())
);
```

#### **AI-Generated Insights for Providers**
```sql
-- Provider action items generated by AI analysis
SELECT pai.*, cn.ai_narrative_summary, ce.event_name
FROM provider_action_items pai
LEFT JOIN clinical_narratives cn ON cn.id = pai.narrative_id
LEFT JOIN patient_clinical_events ce ON ce.id = pai.clinical_event_id
WHERE pai.provider_id = :provider_id
AND pai.status IN ('pending', 'in_progress')
ORDER BY pai.priority DESC, pai.due_date ASC;
```

### **Security & Compliance Features**

#### **Row Level Security (RLS)**
All provider tables implement comprehensive RLS policies:
- **Provider Registry**: Providers can only access their own profile data
- **Patient Access**: Providers only see patients who have granted access
- **Clinical Notes**: Providers only access notes they created or have permission to view
- **Audit Logs**: Providers can view their own access history only

#### **Audit Trail Coverage**
- **Complete Access Logging**: Every patient record access logged with details
- **Partitioned Performance**: Quarterly partitions for high-volume audit data
- **Compliance Ready**: Supports HIPAA, Australian Privacy Act requirements
- **Retention Policies**: Automatic archival and purge workflows

## Future Provider Portal Development

### **Ready Infrastructure**

The current database provides complete foundation for:

1. **Provider Authentication & Registration**
   - AHPRA/NPI credential verification
   - Multi-factor authentication ready
   - Role-based access control

2. **Patient Access Management**
   - Granular permission systems
   - Time-based access controls
   - Emergency access protocols

3. **Clinical Workflow Support**
   - AI-generated action items
   - Clinical decision support alerts
   - Note creation and management

4. **Audit & Compliance**
   - Complete access logging
   - Patient consent tracking
   - Regulatory compliance support

### **Development Priorities**

When building the provider portal, consider these architectural foundations:

#### **High Priority (Core Portal)**
- **Provider Dashboard**: Action items, patient summaries, alerts
- **Patient Record Access**: Filtered clinical data views based on permissions
- **Clinical Note Creation**: SOAP format with templates and structured data
- **Access Request System**: Patients grant/revoke provider access

#### **Medium Priority (Enhanced Features)**
- **Clinical Decision Support**: Rule-based alerts and recommendations
- **Care Coordination**: Multi-provider workflows and communication
- **Billing Integration**: Medicare/PBS integration for Australian providers
- **Mobile Optimization**: Responsive design for clinical mobility

#### **Low Priority (Advanced Features)**
- **Telemedicine Integration**: Video consultation platform integration
- **Analytics Dashboard**: Provider performance and outcome metrics
- **Peer Review System**: Clinical quality assurance workflows
- **API Access**: Third-party EMR integration capabilities

## Database Performance Considerations

### **Optimizations in Place**
- **Partitioned Audit Logs**: Quarterly partitions for high-volume access logs
- **Selective Indexing**: Performance indexes on frequently queried columns
- **RLS Policy Optimization**: Efficient patient-provider access checking
- **JSONB Storage**: Flexible structured data for preferences and configurations

### **Scaling Recommendations**
- **Read Replicas**: For provider portal queries to reduce main database load
- **Caching Strategy**: Redis for frequently accessed provider-patient relationships
- **Archive Strategy**: Automated archival of old audit logs and inactive providers
- **Connection Pooling**: Dedicated provider portal connection pools

This infrastructure provides a robust foundation for comprehensive healthcare provider portal development with enterprise-grade security, compliance, and performance characteristics.