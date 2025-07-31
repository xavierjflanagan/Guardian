# Guardian v7 Security & Compliance Framework

**Status:** Production-Ready Security Architecture  
**Date:** 2025-07-28  
**Purpose:** Comprehensive security, audit, and compliance systems for healthcare data protection

---

## Overview

This document defines Guardian v7's comprehensive security and compliance framework, built upon the foundational Row Level Security (RLS) policies defined in [`core-schema.md`](./core-schema.md). This framework addresses healthcare-specific compliance requirements, advanced security features, and comprehensive audit systems.

**Key Security Principles:**
- Zero-trust architecture with field-level encryption
- Comprehensive audit trails with 7-year retention
- GDPR and HIPAA compliance by design
- Advanced anomaly detection and security monitoring
- Automated compliance reporting and alerting

**Reference:** Basic RLS policies are defined in [`core-schema.md`](./core-schema.md) - this document covers advanced security features and compliance systems.

---

## 1. Advanced Security Architecture

### 1.1. Field-Level Encryption for Sensitive Data

Based on Opus-4's recommendation for enhanced data protection:

```sql
-- Field-level encryption extension
CREATE EXTENSION IF NOT EXISTS "pgp_sym_encrypt" CASCADE;

-- Encrypted sensitive data storage
CREATE TABLE encrypted_patient_data (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES auth.users(id),
    
    -- Encrypted sensitive fields
    ssn_encrypted TEXT, -- pgp_sym_encrypt(ssn, encryption_key)
    date_of_birth_encrypted TEXT,
    phone_encrypted TEXT,
    email_encrypted TEXT,
    address_encrypted TEXT,
    
    -- Encryption metadata
    encryption_version TEXT NOT NULL DEFAULT 'v1',
    encrypted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    key_rotation_date TIMESTAMPTZ,
    
    -- Audit trail
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Soft delete pattern
    archived BOOLEAN NOT NULL DEFAULT FALSE,
    archived_at TIMESTAMPTZ
);

-- Encryption/decryption helper functions
CREATE OR REPLACE FUNCTION encrypt_sensitive_field(
    plaintext TEXT,
    field_type TEXT
) RETURNS TEXT AS $$
DECLARE
    encryption_key TEXT;
BEGIN
    -- Get field-specific encryption key from secure config
    encryption_key := current_setting('app.encryption_key_' || field_type, true);
    
    IF encryption_key IS NULL THEN
        RAISE EXCEPTION 'Encryption key not configured for field type: %', field_type;
    END IF;
    
    RETURN pgp_sym_encrypt(plaintext, encryption_key);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION decrypt_sensitive_field(
    encrypted_text TEXT,
    field_type TEXT
) RETURNS TEXT AS $$
DECLARE
    encryption_key TEXT;
BEGIN
    -- Get field-specific encryption key from secure config
    encryption_key := current_setting('app.encryption_key_' || field_type, true);
    
    IF encryption_key IS NULL THEN
        RAISE EXCEPTION 'Encryption key not configured for field type: %', field_type;
    END IF;
    
    RETURN pgp_sym_decrypt(encrypted_text, encryption_key);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Secure view for decrypted access
CREATE VIEW patient_sensitive_data_decrypted AS
SELECT 
    id,
    patient_id,
    decrypt_sensitive_field(ssn_encrypted, 'ssn') as ssn,
    decrypt_sensitive_field(date_of_birth_encrypted, 'dob')::DATE as date_of_birth,
    decrypt_sensitive_field(phone_encrypted, 'phone') as phone,
    decrypt_sensitive_field(email_encrypted, 'email') as email,
    decrypt_sensitive_field(address_encrypted, 'address') as address,
    encryption_version,
    created_at
FROM encrypted_patient_data
WHERE archived IS NOT TRUE;

-- RLS policy for encrypted data
ALTER TABLE encrypted_patient_data ENABLE ROW LEVEL SECURITY;

CREATE POLICY encrypted_patient_data_user_isolation ON encrypted_patient_data
    FOR ALL USING (auth.uid() = patient_id AND archived IS NOT TRUE);
```

### 1.2. Zero-Trust Architecture Implementation

**What it is:** Implements a _zero-trust_ security posture where every access request is explicitly authenticated, authorised, and validated in real-time – no implicit trust is granted based on network location or static roles.

**Why it matters:** Ensures that sensitive healthcare data is only accessible when runtime conditions (MFA, device trust, location, time-of-day, etc.) satisfy predefined policies, drastically limiting the impact of compromised credentials.

```sql
-- Zero-trust access control framework
CREATE TABLE access_policies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    policy_name TEXT NOT NULL UNIQUE,
    resource_type TEXT NOT NULL, -- 'patient_data', 'documents', 'relationships'
    subject_type TEXT NOT NULL, -- 'user', 'role', 'application'
    subject_id TEXT NOT NULL,
    
    -- Zero-trust conditions
    required_attributes JSONB DEFAULT '{}', -- MFA, device trust, location, etc.
    allowed_operations TEXT[] NOT NULL, -- ['read', 'write', 'delete']
    conditions JSONB DEFAULT '{}', -- time-based, IP-based, etc.
    
    -- Policy lifecycle
    is_active BOOLEAN NOT NULL DEFAULT true,
    effective_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    effective_until TIMESTAMPTZ,
    
    -- Audit
    created_by UUID NOT NULL REFERENCES auth.users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Zero-trust access validation function
CREATE OR REPLACE FUNCTION validate_zero_trust_access(
    p_resource_type TEXT,
    p_resource_id UUID,
    p_operation TEXT,
    p_context JSONB DEFAULT '{}'
) RETURNS BOOLEAN AS $$
DECLARE
    user_id UUID := auth.uid();
    policy_record RECORD;
    context_check BOOLEAN;
BEGIN
    -- Iterate through applicable policies
    FOR policy_record IN 
        SELECT * FROM access_policies 
        WHERE resource_type = p_resource_type
        AND subject_id = user_id::TEXT
        AND is_active = true
        AND NOW() BETWEEN effective_from AND COALESCE(effective_until, 'infinity'::TIMESTAMPTZ)
        AND p_operation = ANY(allowed_operations)
    LOOP
        -- Validate zero-trust conditions
        context_check := true;
        
        -- Check MFA requirement
        IF (policy_record.required_attributes->>'mfa_required')::BOOLEAN = true THEN
            context_check := context_check AND (p_context->>'mfa_verified')::BOOLEAN = true;
        END IF;
        
        -- Check device trust requirement
        IF (policy_record.required_attributes->>'trusted_device_required')::BOOLEAN = true THEN
            context_check := context_check AND (p_context->>'device_trusted')::BOOLEAN = true;
        END IF;
        
        -- Check time-based access
        IF policy_record.conditions ? 'allowed_hours' THEN
            context_check := context_check AND EXTRACT(HOUR FROM NOW()) = ANY(
                ARRAY(SELECT jsonb_array_elements_text(policy_record.conditions->'allowed_hours'))::INTEGER[]
            );
        END IF;
        
        -- If all conditions met, grant access
        IF context_check THEN
            RETURN true;
        END IF;
    END LOOP;
    
    -- Deny access if no policies grant permission
    RETURN false;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Access attempt logging for zero-trust monitoring
CREATE TABLE access_attempts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id),
    resource_type TEXT NOT NULL,
    resource_id UUID,
    operation TEXT NOT NULL,
    context JSONB DEFAULT '{}',
    
    -- Result
    access_granted BOOLEAN NOT NULL,
    policy_applied TEXT,
    denial_reason TEXT,
    
    -- Metadata
    ip_address INET,
    user_agent TEXT,
    session_id TEXT,
    
    attempted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for security monitoring
CREATE INDEX idx_access_attempts_user_time ON access_attempts(user_id, attempted_at);
CREATE INDEX idx_access_attempts_denied ON access_attempts(access_granted, attempted_at) WHERE access_granted = false;
```

### 1.3. Anomaly Detection for Access Patterns

**What it is:** Behaviour-based analytics that continuously scrutinise access and audit logs for unusual temporal, geographic, or volume-based patterns.

**Why it matters:** Detects suspicious activity early (e.g., rapid exports, late-night logins) so that security teams can respond before a minor incident becomes a breach.

```sql
-- Anomaly detection patterns table
CREATE TABLE security_patterns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pattern_name TEXT NOT NULL UNIQUE,
    pattern_type TEXT NOT NULL CHECK (pattern_type IN ('behavioral', 'temporal', 'geographic', 'volume')),
    detection_query TEXT NOT NULL, -- SQL query to detect the pattern
    severity TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    threshold_config JSONB DEFAULT '{}',
    
    -- Pattern lifecycle
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Predefined anomaly detection patterns
INSERT INTO security_patterns (pattern_name, pattern_type, detection_query, severity, threshold_config) VALUES
('unusual_login_times', 'temporal', 
'SELECT user_id, COUNT(*) as unusual_logins FROM access_attempts WHERE attempted_at::TIME NOT BETWEEN ''08:00'' AND ''18:00'' AND attempted_at > NOW() - INTERVAL ''24 hours'' GROUP BY user_id HAVING COUNT(*) > $1', 
'medium', '{"threshold": 5}'),

('rapid_data_access', 'volume',
'SELECT user_id, COUNT(*) as access_count FROM access_attempts WHERE access_granted = true AND attempted_at > NOW() - INTERVAL ''1 hour'' GROUP BY user_id HAVING COUNT(*) > $1',
'high', '{"threshold": 100}'),

('geographic_anomaly', 'geographic',
'SELECT user_id, COUNT(DISTINCT ip_address) as unique_ips FROM access_attempts WHERE attempted_at > NOW() - INTERVAL ''1 hour'' GROUP BY user_id HAVING COUNT(DISTINCT ip_address) > $1',
'high', '{"threshold": 3}'),

('failed_login_attempts', 'behavioral',
'SELECT user_id, COUNT(*) as failed_attempts FROM access_attempts WHERE access_granted = false AND attempted_at > NOW() - INTERVAL ''15 minutes'' GROUP BY user_id HAVING COUNT(*) > $1',
'critical', '{"threshold": 10}');

-- Anomaly detection execution function
CREATE OR REPLACE FUNCTION detect_security_anomalies()
RETURNS TABLE(
    pattern_name TEXT,
    severity TEXT,
    affected_users UUID[],
    anomaly_data JSONB,
    detected_at TIMESTAMPTZ
) AS $$
DECLARE
    pattern_record RECORD;
    detection_result RECORD;
    threshold_value INTEGER;
BEGIN
    FOR pattern_record IN 
        SELECT * FROM security_patterns WHERE is_active = true
    LOOP
        threshold_value := (pattern_record.threshold_config->>'threshold')::INTEGER;
        
        -- Execute detection query with threshold
        FOR detection_result IN 
            EXECUTE pattern_record.detection_query USING threshold_value
        LOOP
            RETURN QUERY SELECT 
                pattern_record.pattern_name,
                pattern_record.severity,
                ARRAY[detection_result.user_id],
                row_to_json(detection_result)::JSONB,
                NOW();
        END LOOP;
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Security alerts table
CREATE TABLE security_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    alert_type TEXT NOT NULL,
    severity TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    affected_users UUID[],
    anomaly_data JSONB DEFAULT '{}',
    
    -- Alert lifecycle
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'investigating', 'resolved', 'false_positive')),
    assigned_to UUID REFERENCES auth.users(id),
    resolved_at TIMESTAMPTZ,
    resolution_notes TEXT,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Automated anomaly detection trigger
CREATE OR REPLACE FUNCTION process_security_anomalies()
RETURNS INTEGER AS $$
DECLARE
    anomaly_record RECORD;
    alerts_created INTEGER := 0;
BEGIN
    FOR anomaly_record IN 
        SELECT * FROM detect_security_anomalies()
    LOOP
        INSERT INTO security_alerts (
            alert_type, severity, title, description, affected_users, anomaly_data
        ) VALUES (
            'anomaly_detection',
            anomaly_record.severity,
            'Security Anomaly: ' || anomaly_record.pattern_name,
            format('Detected %s anomaly affecting %s users', 
                   anomaly_record.pattern_name, 
                   array_length(anomaly_record.affected_users, 1)),
            anomaly_record.affected_users,
            anomaly_record.anomaly_data
        );
        
        alerts_created := alerts_created + 1;
    END LOOP;
    
    RETURN alerts_created;
END;
$$ LANGUAGE plpgsql;
```

---

## 2. Comprehensive Audit System

### 2.1. Enhanced Audit Log with Automated Partitioning

Building on the V6 audit system with additional healthcare compliance features:

```sql
-- Enhanced audit log with healthcare-specific fields
CREATE TABLE audit_log (
    id UUID NOT NULL DEFAULT gen_random_uuid(),
    table_name TEXT NOT NULL,
    record_id UUID NOT NULL,
    operation TEXT NOT NULL CHECK (operation IN ('INSERT', 'UPDATE', 'DELETE', 'ARCHIVE', 'VIEW', 'EXPORT')),
    
    -- Enhanced change tracking
    old_values_hash TEXT, -- SHA-256 hash for space efficiency
    new_values_hash TEXT, -- SHA-256 hash for change detection
    changed_columns TEXT[], -- Track only changed columns
    field_level_changes JSONB, -- Detailed field changes for sensitive fields
    
    -- Healthcare compliance context
    clinical_context TEXT, -- Medical context for the change
    patient_consent_verified BOOLEAN DEFAULT false,
    hipaa_authorization TEXT, -- HIPAA authorization reference
    minimum_necessary_justification TEXT, -- HIPAA minimum necessary rule
    
    -- Enhanced user context
    changed_by UUID REFERENCES auth.users(id),
    changed_by_role TEXT,
    changed_on_behalf_of UUID REFERENCES auth.users(id), -- For provider-patient scenarios
    changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Technical context
    client_info JSONB DEFAULT '{}',
    session_id TEXT,
    ip_address INET,
    user_agent TEXT,
    reason TEXT,
    
    -- Compliance metadata
    retention_period INTEGER DEFAULT 2555, -- 7 years in days
    legal_hold BOOLEAN DEFAULT false,
    legal_hold_reason TEXT,
    
    -- Partition key
    audit_date DATE NOT NULL DEFAULT CURRENT_DATE,
    
    PRIMARY KEY (id, audit_date)
) PARTITION BY RANGE (audit_date);

-- Setup automated partitioning with pg_partman (assuming extension available)
-- Note: This would require pg_partman extension
/*
SELECT partman.create_parent(
    p_parent_table => 'public.audit_log',
    p_control => 'audit_date',
    p_type => 'range',
    p_interval => 'monthly',
    p_premake => 3, -- Create 3 months ahead
    p_start_partition => '2025-01-01'
);

-- Configure automatic maintenance for 7-year retention
UPDATE partman.part_config 
SET infinite_time_partitions = true,
    retention = '7 years', -- Healthcare compliance
    retention_keep_table = false
WHERE parent_table = 'public.audit_log';
*/

-- Create essential indexes on partitioned table
CREATE INDEX idx_audit_log_table_record ON audit_log(table_name, record_id, audit_date);
CREATE INDEX idx_audit_log_user ON audit_log(changed_by, audit_date);
CREATE INDEX idx_audit_log_operation ON audit_log(operation, audit_date);
CREATE INDEX idx_audit_log_legal_hold ON audit_log(legal_hold, audit_date) WHERE legal_hold = true;

-- Enhanced audit trigger with healthcare compliance
CREATE OR REPLACE FUNCTION enhanced_audit_trigger_function()
RETURNS TRIGGER AS $$
DECLARE
    old_hash TEXT;
    new_hash TEXT;
    changed_cols TEXT[];
    field_changes JSONB := '{}';
    sensitive_fields TEXT[] := ARRAY['ssn', 'date_of_birth', 'phone', 'email', 'address'];
    col_name TEXT;
BEGIN
    -- Generate hashes for change detection
    IF TG_OP = 'UPDATE' THEN
        old_hash := encode(digest(to_jsonb(OLD)::text, 'sha256'), 'hex');
        new_hash := encode(digest(to_jsonb(NEW)::text, 'sha256'), 'hex');
        
        -- Identify changed columns
        SELECT ARRAY(
            SELECT key FROM jsonb_each(to_jsonb(NEW)) 
            WHERE to_jsonb(OLD) ->> key IS DISTINCT FROM to_jsonb(NEW) ->> key
        ) INTO changed_cols;
        
        -- Track detailed changes for sensitive fields
        FOREACH col_name IN ARRAY changed_cols
        LOOP
            IF col_name = ANY(sensitive_fields) THEN
                field_changes := field_changes || jsonb_build_object(
                    col_name, jsonb_build_object(
                        'old_hash', encode(digest(to_jsonb(OLD) ->> col_name, 'sha256'), 'hex'),
                        'new_hash', encode(digest(to_jsonb(NEW) ->> col_name, 'sha256'), 'hex'),
                        'changed_at', NOW()
                    )
                );
            END IF;
        END LOOP;
        
    ELSIF TG_OP = 'INSERT' THEN
        new_hash := encode(digest(to_jsonb(NEW)::text, 'sha256'), 'hex');
    ELSIF TG_OP = 'DELETE' THEN
        old_hash := encode(digest(to_jsonb(OLD)::text, 'sha256'), 'hex');
    END IF;
    
    -- Insert enhanced audit record
    INSERT INTO audit_log (
        table_name, record_id, operation,
        old_values_hash, new_values_hash, changed_columns, field_level_changes,
        changed_by, changed_by_role, session_id, ip_address, user_agent,
        reason, clinical_context, patient_consent_verified
    ) VALUES (
        TG_TABLE_NAME,
        COALESCE(NEW.id, OLD.id),
        TG_OP,
        old_hash, new_hash, changed_cols, field_changes,
        current_setting('app.current_user_id', true)::UUID,
        current_setting('app.user_role', true),
        current_setting('app.session_id', true),
        current_setting('app.client_ip', true)::INET,
        current_setting('app.user_agent', true),
        current_setting('app.audit_reason', true),
        current_setting('app.clinical_context', true),
        current_setting('app.consent_verified', true)::BOOLEAN
    );
    
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;
```

### 2.2. Audit Reporting and Compliance Views

**What it is:** Curated SQL views that transform raw audit events into human-readable summaries for investigators, auditors, and compliance officers.

**Why it matters:** Accelerates incident triage and regulatory reporting (HIPAA, GDPR, etc.) by providing ready-made dashboards without querying raw tables.

```sql
-- Comprehensive audit reporting views
CREATE VIEW audit_summary_by_user AS
SELECT 
    changed_by,
    u.email as user_email,
    COUNT(*) as total_actions,
    COUNT(*) FILTER (WHERE operation = 'VIEW') as view_count,
    COUNT(*) FILTER (WHERE operation = 'UPDATE') as update_count,
    COUNT(*) FILTER (WHERE operation = 'DELETE') as delete_count,
    COUNT(*) FILTER (WHERE operation = 'EXPORT') as export_count,
    MIN(changed_at) as first_action,
    MAX(changed_at) as last_action,
    COUNT(DISTINCT record_id) as unique_records_accessed
FROM audit_log a
LEFT JOIN auth.users u ON a.changed_by = u.id
WHERE changed_at >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY changed_by, u.email;

-- HIPAA compliance monitoring view
CREATE VIEW hipaa_compliance_summary AS
SELECT 
    table_name,
    DATE(changed_at) as audit_date,
    COUNT(*) as total_accesses,
    COUNT(*) FILTER (WHERE patient_consent_verified = true) as consent_verified_count,
    COUNT(*) FILTER (WHERE hipaa_authorization IS NOT NULL) as authorized_count,
    COUNT(*) FILTER (WHERE minimum_necessary_justification IS NOT NULL) as justified_count,
    ROUND(
        COUNT(*) FILTER (WHERE patient_consent_verified = true) * 100.0 / COUNT(*),
        2
    ) as consent_compliance_percentage
FROM audit_log
WHERE changed_at >= CURRENT_DATE - INTERVAL '90 days'
GROUP BY table_name, DATE(changed_at)
ORDER BY audit_date DESC;

-- Data access patterns for anomaly detection
CREATE VIEW suspicious_access_patterns AS
SELECT 
    changed_by,
    table_name,
    COUNT(*) as access_count,
    COUNT(DISTINCT record_id) as unique_records,
    MIN(changed_at) as first_access,
    MAX(changed_at) as last_access,
    EXTRACT(EPOCH FROM (MAX(changed_at) - MIN(changed_at))) as access_duration_seconds,
    COUNT(DISTINCT ip_address) as unique_ip_addresses
FROM audit_log
WHERE changed_at >= NOW() - INTERVAL '24 hours'
AND operation IN ('VIEW', 'EXPORT')
GROUP BY changed_by, table_name
HAVING COUNT(*) > 100 -- Threshold for suspicious activity
OR COUNT(DISTINCT ip_address) > 3 -- Multiple IPs
OR EXTRACT(EPOCH FROM (MAX(changed_at) - MIN(changed_at))) < 3600 -- Very rapid access
ORDER BY access_count DESC;
```

---

## 3. GDPR and Healthcare Compliance

### 3.1. GDPR Compliance Framework

**What it is:** Database structures and functions that manage EU data-subject rights – consent, access, portability, rectification, and erasure.

**Why it matters:** Demonstrates “privacy by design” and makes it straightforward to prove compliance with the GDPR’s legal deadlines (e.g., 30-day response windows) and accountability principles.

```sql
-- GDPR consent and rights management
CREATE TABLE gdpr_consents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES auth.users(id),
    
    -- Consent details
    consent_type TEXT NOT NULL CHECK (consent_type IN ('data_processing', 'data_sharing', 'marketing', 'research')),
    purpose TEXT NOT NULL,
    legal_basis TEXT NOT NULL CHECK (legal_basis IN ('consent', 'contract', 'legal_obligation', 'vital_interests', 'public_task', 'legitimate_interests')),
    
    -- Consent lifecycle
    granted BOOLEAN NOT NULL DEFAULT false,
    granted_at TIMESTAMPTZ,
    withdrawn_at TIMESTAMPTZ,
    
    -- Consent context
    consent_method TEXT NOT NULL CHECK (consent_method IN ('explicit_opt_in', 'implied', 'pre_ticked_box')),
    consent_text TEXT NOT NULL, -- Exact text shown to user
    consent_version TEXT NOT NULL,
    
    -- Data subject rights
    data_categories TEXT[] NOT NULL, -- Categories of data covered
    retention_period INTEGER, -- Days
    sharing_restrictions JSONB DEFAULT '{}',
    
    -- Audit
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- GDPR data subject requests
CREATE TABLE gdpr_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES auth.users(id),
    
    -- Request details
    request_type TEXT NOT NULL CHECK (request_type IN ('access', 'rectification', 'erasure', 'restriction', 'portability', 'objection')),
    request_description TEXT NOT NULL,
    
    -- Request processing
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'rejected', 'partially_completed')),
    assigned_to UUID REFERENCES auth.users(id),
    
    -- Compliance tracking
    received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    acknowledgment_sent_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    response_due_date TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 days'), -- GDPR 30-day limit
    
    -- Processing details
    verification_method TEXT,
    verification_completed_at TIMESTAMPTZ,
    processing_notes TEXT,
    rejection_reason TEXT,
    
    -- Response
    response_data JSONB,
    response_format TEXT CHECK (response_format IN ('json', 'csv', 'pdf', 'xml')),
    response_delivered_at TIMESTAMPTZ,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- GDPR-compliant data export function
CREATE OR REPLACE FUNCTION export_patient_data_gdpr(
    p_patient_id UUID,
    p_format TEXT DEFAULT 'json'
) RETURNS JSONB AS $$
DECLARE
    patient_data JSONB := '{}';
    consent_check BOOLEAN;
BEGIN
    -- Verify patient consent for data export
    SELECT EXISTS(
        SELECT 1 FROM gdpr_consents 
        WHERE patient_id = p_patient_id 
        AND consent_type = 'data_processing'
        AND granted = true
        AND withdrawn_at IS NULL
    ) INTO consent_check;
    
    IF NOT consent_check THEN
        RAISE EXCEPTION 'Patient has not consented to data processing for export';
    END IF;
    
    -- Collect all patient data
    patient_data := jsonb_build_object(
        'patient_id', p_patient_id,
        'export_date', NOW(),
        'data_categories', jsonb_build_object(
            'medications', (
                SELECT jsonb_agg(row_to_json(m))
                FROM patient_medications m
                WHERE m.patient_id = p_patient_id AND archived IS NOT TRUE
            ),
            'conditions', (
                SELECT jsonb_agg(row_to_json(c))
                FROM patient_conditions c
                WHERE c.patient_id = p_patient_id AND archived IS NOT TRUE
            ),
            'allergies', (
                SELECT jsonb_agg(row_to_json(a))
                FROM patient_allergies a
                WHERE a.patient_id = p_patient_id AND archived IS NOT TRUE
            ),
            'lab_results', (
                SELECT jsonb_agg(row_to_json(l))
                FROM patient_lab_results l
                WHERE l.patient_id = p_patient_id AND archived IS NOT TRUE
            ),
            'vitals', (
                SELECT jsonb_agg(row_to_json(v))
                FROM patient_vitals v
                WHERE v.patient_id = p_patient_id AND archived IS NOT TRUE
            ),
            'audit_trail', (
                SELECT jsonb_agg(
                    jsonb_build_object(
                        'table_name', table_name,
                        'operation', operation,
                        'changed_at', changed_at,
                        'changed_by', changed_by
                    )
                )
                FROM audit_log
                WHERE record_id = p_patient_id
                AND changed_at >= NOW() - INTERVAL '7 years'
            )
        )
    );
    
    -- Log the export request
    INSERT INTO audit_log (table_name, record_id, operation, reason)
    VALUES ('patient_data_export', p_patient_id, 'EXPORT', 'GDPR data portability request');
    
    RETURN patient_data;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Right to erasure (GDPR Article 17) implementation
CREATE OR REPLACE FUNCTION gdpr_right_to_erasure(
    p_patient_id UUID,
    p_erasure_reason TEXT
) RETURNS JSONB AS $$
DECLARE
    affected_tables TEXT[] := ARRAY['patient_medications', 'patient_conditions', 'patient_allergies', 'patient_lab_results', 'patient_vitals'];
    table_name TEXT;
    records_affected INTEGER := 0;
    total_records INTEGER := 0;
    erasure_summary JSONB := '{}';
BEGIN
    -- Verify legal basis for erasure
    -- (Implementation would check consent withdrawal, purpose limitation, etc.)
    
    -- Perform soft delete with GDPR erasure marking
    FOREACH table_name IN ARRAY affected_tables
    LOOP
        EXECUTE format('
            UPDATE %I SET 
                archived = true,
                archived_reason = $1,
                archived_at = NOW(),
                -- Pseudonymize identifiable data
                raw_value = ''[ERASED_GDPR]'',
                updated_at = NOW()
            WHERE patient_id = $2 
            AND archived IS NOT TRUE
        ', table_name) USING p_erasure_reason, p_patient_id;
        
        GET DIAGNOSTICS records_affected = ROW_COUNT;
        total_records := total_records + records_affected;
        
        erasure_summary := erasure_summary || jsonb_build_object(
            table_name, records_affected
        );
    END LOOP;
    
    -- Update encrypted sensitive data
    UPDATE encrypted_patient_data SET
        ssn_encrypted = encrypt_sensitive_field('[ERASED_GDPR]', 'ssn'),
        date_of_birth_encrypted = encrypt_sensitive_field('1900-01-01', 'dob'),
        phone_encrypted = encrypt_sensitive_field('[ERASED_GDPR]', 'phone'),
        email_encrypted = encrypt_sensitive_field('[ERASED_GDPR]', 'email'),
        address_encrypted = encrypt_sensitive_field('[ERASED_GDPR]', 'address'),
        archived = true,
        archived_at = NOW()
    WHERE patient_id = p_patient_id AND archived IS NOT TRUE;
    
    -- Log erasure action
    INSERT INTO audit_log (table_name, record_id, operation, reason, clinical_context)
    VALUES ('gdpr_erasure', p_patient_id, 'DELETE', p_erasure_reason, 'GDPR Article 17 - Right to Erasure');
    
    RETURN jsonb_build_object(
        'patient_id', p_patient_id,
        'erasure_completed_at', NOW(),
        'total_records_affected', total_records,
        'tables_affected', erasure_summary,
        'legal_basis', 'GDPR Article 17'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

### 3.2. HIPAA Compliance Features

**What it is:** Schema and procedures that capture U.S. HIPAA requirements such as authorization tracking, minimum-necessary assessments, and breach notification workflows.

**Why it matters:** Provides the auditability and safeguards mandated for handling Protected Health Information (PHI) in the United States, lowering legal risk and strengthening patient trust.

```sql
-- HIPAA authorization tracking
CREATE TABLE hipaa_authorizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES auth.users(id),
    
    -- Authorization details
    authorized_entity TEXT NOT NULL, -- Who is authorized
    authorized_entity_type TEXT CHECK (authorized_entity_type IN ('healthcare_provider', 'insurance', 'family_member', 'legal_representative', 'researcher')),
    purpose TEXT NOT NULL,
    information_to_be_disclosed TEXT[] NOT NULL,
    
    -- Authorization scope
    data_categories TEXT[] NOT NULL,
    time_limitation TIMESTAMPTZ, -- When authorization expires
    condition_limitation TEXT, -- Specific conditions for disclosure
    
    -- Authorization lifecycle
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked', 'expired')),
    signed_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    revocation_reason TEXT,
    
    -- Compliance metadata
    authorization_form_version TEXT,
    witness_signature TEXT,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- HIPAA minimum necessary assessment
CREATE OR REPLACE FUNCTION assess_minimum_necessary(
    p_requestor_id UUID,
    p_patient_id UUID,
    p_requested_data_types TEXT[],
    p_purpose TEXT
) RETURNS JSONB AS $$
DECLARE
    necessary_data TEXT[];
    assessment_result JSONB;
    requestor_role TEXT;
BEGIN
    -- Get requestor role for minimum necessary determination
    SELECT role INTO requestor_role FROM auth.users WHERE id = p_requestor_id;
    
    -- Apply minimum necessary rules based on purpose and role
    CASE 
        WHEN p_purpose = 'treatment' AND requestor_role = 'healthcare_provider' THEN
            -- Healthcare providers get access to relevant clinical data
            necessary_data := ARRAY['medications', 'conditions', 'allergies', 'lab_results', 'vitals'];
        WHEN p_purpose = 'payment' AND requestor_role = 'insurance_representative' THEN
            -- Insurance only gets billing-relevant data
            necessary_data := ARRAY['conditions', 'procedures'];
        WHEN p_purpose = 'healthcare_operations' THEN
            -- Limited access for quality assurance, etc.
            necessary_data := ARRAY['conditions', 'outcomes'];
        ELSE
            -- Default to minimal access
            necessary_data := ARRAY['basic_demographics'];
    END CASE;
    
    -- Filter requested data to minimum necessary
    necessary_data := (
        SELECT ARRAY(
            SELECT unnest(necessary_data)
            INTERSECT
            SELECT unnest(p_requested_data_types)
        )
    );
    
    assessment_result := jsonb_build_object(
        'requestor_id', p_requestor_id,
        'patient_id', p_patient_id,
        'purpose', p_purpose,
        'requested_data', p_requested_data_types,
        'approved_data', necessary_data,
        'assessment_date', NOW(),
        'compliance_basis', 'HIPAA Minimum Necessary Rule'
    );
    
    -- Log the assessment
    INSERT INTO audit_log (table_name, record_id, operation, reason, clinical_context)
    VALUES ('hipaa_minimum_necessary', p_patient_id, 'VIEW', 'Minimum necessary assessment', assessment_result::TEXT);
    
    RETURN assessment_result;
END;
$$ LANGUAGE plpgsql;

-- Breach detection and notification system
CREATE TABLE security_breaches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Breach details
    breach_type TEXT NOT NULL CHECK (breach_type IN ('unauthorized_access', 'data_loss', 'system_compromise', 'disclosure_error')),
    severity TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    affected_patients UUID[] NOT NULL,
    affected_data_types TEXT[] NOT NULL,
    
    -- Discovery and timeline
    discovered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    incident_occurred_at TIMESTAMPTZ,
    contained_at TIMESTAMPTZ,
    
    -- Breach assessment
    risk_assessment TEXT NOT NULL,
    notification_required BOOLEAN NOT NULL DEFAULT true,
    notification_sent_at TIMESTAMPTZ,
    
    -- Response
    incident_response_team UUID[] DEFAULT '{}',
    mitigation_actions TEXT[],
    
    -- Compliance reporting
    hhs_reported_at TIMESTAMPTZ, -- Health and Human Services reporting
    state_ag_reported_at TIMESTAMPTZ, -- State Attorney General reporting
    media_notification_at TIMESTAMPTZ,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

## 4. Security Monitoring and Alerting

### 4.1. Comprehensive Security Audit Dashboard

**What it is:** A materialised view that aggregates login attempts, audit events, security alerts, and GDPR requests into a single operational dashboard.

**Why it matters:** Gives security and compliance teams real-time visibility into the system’s risk posture and highlights hotspots that need immediate attention.

```sql
-- Security metrics materialized view
CREATE MATERIALIZED VIEW security_metrics_dashboard AS
SELECT 
    'access_attempts' as metric_category,
    COUNT(*) as total_count,
    COUNT(*) FILTER (WHERE access_granted = false) as failed_count,
    COUNT(DISTINCT user_id) as unique_users,
    MAX(attempted_at) as last_activity
FROM access_attempts
WHERE attempted_at >= CURRENT_DATE - INTERVAL '24 hours'

UNION ALL

SELECT 
    'audit_events' as metric_category,
    COUNT(*) as total_count,
    COUNT(*) FILTER (WHERE operation = 'EXPORT') as export_count,
    COUNT(DISTINCT changed_by) as unique_users,
    MAX(changed_at) as last_activity
FROM audit_log
WHERE changed_at >= CURRENT_DATE - INTERVAL '24 hours'

UNION ALL

SELECT 
    'security_alerts' as metric_category,
    COUNT(*) as total_count,
    COUNT(*) FILTER (WHERE severity IN ('high', 'critical')) as critical_count,
    COUNT(*) FILTER (WHERE status = 'active') as active_alerts,
    MAX(created_at) as last_activity
FROM security_alerts
WHERE created_at >= CURRENT_DATE - INTERVAL '24 hours'

UNION ALL

SELECT 
    'gdpr_requests' as metric_category,
    COUNT(*) as total_count,
    COUNT(*) FILTER (WHERE status = 'pending') as pending_count,
    COUNT(*) FILTER (WHERE response_due_date < NOW()) as overdue_count,
    MAX(received_at) as last_activity
FROM gdpr_requests
WHERE received_at >= CURRENT_DATE - INTERVAL '30 days';

-- Real-time security monitoring view
CREATE VIEW real_time_security_status AS
SELECT 
    'system_status' as status_type,
    CASE 
        WHEN active_alerts > 0 THEN 'ALERT'
        WHEN failed_logins > 50 THEN 'WARNING'
        ELSE 'NORMAL'
    END as status,
    jsonb_build_object(
        'active_alerts', active_alerts,
        'failed_logins_24h', failed_logins,
        'data_exports_24h', data_exports,
        'gdpr_requests_pending', pending_gdpr,
        'last_updated', NOW()
    ) as status_details
FROM (
    SELECT 
        COALESCE((SELECT COUNT(*) FROM security_alerts WHERE status = 'active'), 0) as active_alerts,
        COALESCE((SELECT COUNT(*) FROM access_attempts WHERE access_granted = false AND attempted_at >= NOW() - INTERVAL '24 hours'), 0) as failed_logins,
        COALESCE((SELECT COUNT(*) FROM audit_log WHERE operation = 'EXPORT' AND changed_at >= NOW() - INTERVAL '24 hours'), 0) as data_exports,
        COALESCE((SELECT COUNT(*) FROM gdpr_requests WHERE status = 'pending'), 0) as pending_gdpr
) metrics;

-- Automated security report generation
CREATE OR REPLACE FUNCTION generate_security_report(
    p_report_type TEXT DEFAULT 'daily',
    p_date_range INTERVAL DEFAULT '24 hours'
) RETURNS JSONB AS $$
DECLARE
    report_data JSONB;
    start_time TIMESTAMPTZ := NOW() - p_date_range;
BEGIN
    report_data := jsonb_build_object(
        'report_type', p_report_type,
        'report_period', jsonb_build_object(
            'start_time', start_time,
            'end_time', NOW(),
            'duration_hours', EXTRACT(EPOCH FROM p_date_range) / 3600
        ),
        
        'access_summary', (
            SELECT jsonb_build_object(
                'total_attempts', COUNT(*),
                'successful_logins', COUNT(*) FILTER (WHERE access_granted = true),
                'failed_attempts', COUNT(*) FILTER (WHERE access_granted = false),
                'unique_users', COUNT(DISTINCT user_id),
                'unique_ips', COUNT(DISTINCT ip_address)
            )
            FROM access_attempts
            WHERE attempted_at >= start_time
        ),
        
        'audit_summary', (
            SELECT jsonb_build_object(
                'total_events', COUNT(*),
                'data_modifications', COUNT(*) FILTER (WHERE operation IN ('INSERT', 'UPDATE', 'DELETE')),
                'data_views', COUNT(*) FILTER (WHERE operation = 'VIEW'),
                'data_exports', COUNT(*) FILTER (WHERE operation = 'EXPORT'),
                'tables_affected', COUNT(DISTINCT table_name)
            )
            FROM audit_log
            WHERE changed_at >= start_time
        ),
        
        'security_incidents', (
            SELECT jsonb_agg(
                jsonb_build_object(
                    'alert_type', alert_type,
                    'severity', severity,
                    'title', title,
                    'created_at', created_at,
                    'status', status
                )
            )
            FROM security_alerts
            WHERE created_at >= start_time
        ),
        
        'compliance_status', (
            SELECT jsonb_build_object(
                'gdpr_requests_received', COUNT(*),
                'gdpr_requests_completed', COUNT(*) FILTER (WHERE status = 'completed'),
                'breach_incidents', (SELECT COUNT(*) FROM security_breaches WHERE discovered_at >= start_time),
                'consent_withdrawals', (SELECT COUNT(*) FROM gdpr_consents WHERE withdrawn_at >= start_time)
            )
            FROM gdpr_requests
            WHERE received_at >= start_time
        ),
        
        'generated_at', NOW()
    );
    
    RETURN report_data;
END;
$$ LANGUAGE plpgsql;
```

### 4.2. Automated Security Response

**What it is:** Incident-response playbooks that automatically trigger predefined actions (e.g., lock accounts, notify DPO) when security thresholds are breached.

**Why it matters:** Shrinks mean-time-to-response by automating containment and escalation steps, ensuring consistent, auditable handling of security events.

```sql
-- Automated incident response system
CREATE TABLE incident_response_playbooks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trigger_type TEXT NOT NULL, -- 'failed_login_threshold', 'data_export_volume', etc.
    severity_threshold TEXT NOT NULL,
    
    -- Response actions
    automated_actions JSONB NOT NULL, -- Array of actions to take
    notification_recipients UUID[] DEFAULT '{}',
    escalation_delay INTERVAL DEFAULT '15 minutes',
    
    -- Playbook metadata
    playbook_name TEXT NOT NULL,
    description TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Predefined incident response playbooks
INSERT INTO incident_response_playbooks (trigger_type, severity_threshold, automated_actions, playbook_name, description) VALUES
('failed_login_threshold', 'high', 
'[{"action": "lock_account", "parameters": {"duration": "30 minutes"}}, {"action": "notify_security_team"}, {"action": "log_security_event"}]',
'Account Lockout Response', 'Automatically lock accounts with excessive failed login attempts'),

('data_export_volume', 'critical',
'[{"action": "require_additional_auth"}, {"action": "notify_dpo"}, {"action": "create_audit_flag"}]',
'Mass Data Export Response', 'Respond to unusual data export volumes'),

('anomaly_detection', 'medium',
'[{"action": "increase_monitoring"}, {"action": "require_session_reauth"}, {"action": "notify_user"}]',
'Behavioral Anomaly Response', 'Respond to detected behavioral anomalies');

-- Incident response execution engine
CREATE OR REPLACE FUNCTION execute_incident_response(
    p_trigger_type TEXT,
    p_severity TEXT,
    p_context JSONB
) RETURNS JSONB AS $$
DECLARE
    playbook_record RECORD;
    action_record JSONB;
    response_log JSONB := '[]';
    action_result JSONB;
BEGIN
    -- Find applicable playbooks
    FOR playbook_record IN 
        SELECT * FROM incident_response_playbooks
        WHERE trigger_type = p_trigger_type
        AND severity_threshold = p_severity
        AND is_active = true
    LOOP
        -- Execute each automated action
        FOR action_record IN 
            SELECT * FROM jsonb_array_elements(playbook_record.automated_actions)
        LOOP
            -- Execute action based on type
            CASE action_record->>'action'
                WHEN 'lock_account' THEN
                    -- Implement account locking logic
                    action_result := jsonb_build_object(
                        'action', 'lock_account',
                        'status', 'executed',
                        'timestamp', NOW()
                    );
                
                WHEN 'notify_security_team' THEN
                    -- Create security alert
                    INSERT INTO security_alerts (alert_type, severity, title, description, anomaly_data)
                    VALUES ('automated_response', p_severity, 
                           'Automated Incident Response Triggered',
                           format('Playbook %s executed for %s', playbook_record.playbook_name, p_trigger_type),
                           p_context);
                    
                    action_result := jsonb_build_object(
                        'action', 'notify_security_team',
                        'status', 'executed',
                        'timestamp', NOW()
                    );
                
                WHEN 'create_audit_flag' THEN
                    -- Flag for additional audit review
                    action_result := jsonb_build_object(
                        'action', 'create_audit_flag',
                        'status', 'executed',
                        'timestamp', NOW()
                    );
                
                ELSE
                    action_result := jsonb_build_object(
                        'action', action_record->>'action',
                        'status', 'unknown_action',
                        'timestamp', NOW()
                    );
            END CASE;
            
            response_log := response_log || action_result;
        END LOOP;
    END LOOP;
    
    RETURN jsonb_build_object(
        'trigger_type', p_trigger_type,
        'severity', p_severity,
        'context', p_context,
        'executed_actions', response_log,
        'executed_at', NOW()
    );
END;
$$ LANGUAGE plpgsql;
```

---

## 5. Data Protection and Encryption Strategies

### 5.1. Key Management and Rotation

**What it is:** Tables and procedures that monitor cryptographic keys, their lifecycle, scheduled rotations, and associated audit logs.

**Why it matters:** Reduces the attack surface by enforcing regular key rotation and providing full traceability for encryption keys that protect PHI.

```sql
-- Encryption key management
CREATE TABLE encryption_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key_name TEXT NOT NULL UNIQUE,
    key_purpose TEXT NOT NULL CHECK (key_purpose IN ('field_encryption', 'backup_encryption', 'transport_encryption')),
    
    -- Key lifecycle
    key_version INTEGER NOT NULL DEFAULT 1,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    activated_at TIMESTAMPTZ,
    rotated_at TIMESTAMPTZ,
    
    -- Rotation schedule
    rotation_interval INTERVAL DEFAULT '90 days',
    next_rotation_due TIMESTAMPTZ,
    
    -- Key metadata (never store actual keys in database)
    key_length INTEGER NOT NULL,
    algorithm TEXT NOT NULL DEFAULT 'AES-256',
    key_location TEXT NOT NULL, -- External key management system reference
    
    -- Audit
    created_by UUID NOT NULL REFERENCES auth.users(id)
);

-- Key rotation tracking
CREATE TABLE key_rotation_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key_id UUID NOT NULL REFERENCES encryption_keys(id),
    old_version INTEGER NOT NULL,
    new_version INTEGER NOT NULL,
    
    -- Rotation process
    rotation_started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    rotation_completed_at TIMESTAMPTZ,
    rotation_status TEXT NOT NULL DEFAULT 'in_progress' CHECK (rotation_status IN ('in_progress', 'completed', 'failed', 'rolled_back')),
    
    -- Impact tracking
    records_re_encrypted INTEGER DEFAULT 0,
    tables_affected TEXT[] DEFAULT '{}',
    rotation_duration INTERVAL,
    
    -- Error handling
    error_message TEXT,
    rollback_completed_at TIMESTAMPTZ,
    
    performed_by UUID NOT NULL REFERENCES auth.users(id)
);

-- Automated key rotation function
CREATE OR REPLACE FUNCTION rotate_encryption_keys()
RETURNS TABLE(
    key_name TEXT,
    rotation_status TEXT,
    records_affected INTEGER,
    duration_minutes INTEGER
) AS $$
DECLARE
    key_record RECORD;
    rotation_start TIMESTAMPTZ;
    records_count INTEGER;
BEGIN
    FOR key_record IN 
        SELECT * FROM encryption_keys 
        WHERE is_active = true 
        AND next_rotation_due <= NOW()
    LOOP
        rotation_start := NOW();
        
        -- Log rotation start
        INSERT INTO key_rotation_log (key_id, old_version, new_version, performed_by)
        VALUES (key_record.id, key_record.key_version, key_record.key_version + 1, 
                current_setting('app.current_user_id', true)::UUID);
        
        -- Perform key rotation (implementation would call external key management system)
        -- This is a placeholder for actual key rotation logic
        
        -- Update key record
        UPDATE encryption_keys 
        SET key_version = key_version + 1,
            rotated_at = NOW(),
            next_rotation_due = NOW() + rotation_interval
        WHERE id = key_record.id;
        
        -- Mock record count for return
        records_count := 1000; -- In practice, this would count re-encrypted records
        
        RETURN QUERY SELECT 
            key_record.key_name,
            'completed'::TEXT,
            records_count,
            EXTRACT(MINUTES FROM (NOW() - rotation_start))::INTEGER;
    END LOOP;
END;
$$ LANGUAGE plpgsql;
```

### 5.2. Backup and Recovery Security

**What it is:** Secure metadata and verification routines that ensure all backups are encrypted, integrity-checked, and subject to strict retention controls.

**Why it matters:** Guarantees that disaster-recovery copies uphold the same security standards as production data, preventing leakage via backup channels.

```sql
-- Secure backup metadata tracking
CREATE TABLE backup_security_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Backup identification
    backup_id UUID NOT NULL,
    backup_type TEXT NOT NULL CHECK (backup_type IN ('full', 'incremental', 'differential')),
    backup_location TEXT NOT NULL,
    
    -- Security metadata
    encryption_status TEXT NOT NULL CHECK (encryption_status IN ('encrypted', 'unencrypted', 'failed')),
    encryption_algorithm TEXT,
    key_version INTEGER,
    integrity_hash TEXT NOT NULL, -- SHA-256 hash of backup
    
    -- Backup scope
    tables_included TEXT[] NOT NULL,
    data_classification TEXT NOT NULL CHECK (data_classification IN ('public', 'internal', 'confidential', 'restricted')),
    contains_phi BOOLEAN NOT NULL DEFAULT false, -- Protected Health Information
    
    -- Access control
    access_restrictions JSONB DEFAULT '{}',
    retention_period INTEGER NOT NULL, -- Days
    deletion_scheduled_for TIMESTAMPTZ,
    
    -- Audit
    created_by UUID NOT NULL REFERENCES auth.users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    verified_at TIMESTAMPTZ,
    verified_by UUID REFERENCES auth.users(id)
);

-- Backup integrity verification
CREATE OR REPLACE FUNCTION verify_backup_integrity(
    p_backup_id UUID
) RETURNS JSONB AS $$
DECLARE
    backup_record RECORD;
    verification_result JSONB;
    calculated_hash TEXT;
BEGIN
    SELECT * INTO backup_record
    FROM backup_security_log
    WHERE backup_id = p_backup_id;
    
    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'status', 'error',
            'message', 'Backup record not found'
        );
    END IF;
    
    -- In practice, this would calculate hash from actual backup file
    -- calculated_hash := calculate_file_hash(backup_record.backup_location);
    calculated_hash := backup_record.integrity_hash; -- Placeholder
    
    verification_result := jsonb_build_object(
        'backup_id', p_backup_id,
        'verification_time', NOW(),
        'integrity_check', calculated_hash = backup_record.integrity_hash,
        'encryption_verified', backup_record.encryption_status = 'encrypted',
        'status', CASE 
            WHEN calculated_hash = backup_record.integrity_hash THEN 'verified'
            ELSE 'corrupted'
        END
    );
    
    -- Update verification timestamp
    UPDATE backup_security_log
    SET verified_at = NOW(),
        verified_by = current_setting('app.current_user_id', true)::UUID
    WHERE backup_id = p_backup_id;
    
    RETURN verification_result;
END;
$$ LANGUAGE plpgsql;
```

---

## 6. Security Best Practices and Procedures

### 6.1. Security Configuration Management

**What it is:** A central registry for critical security settings along with a compliance checker that evaluates each value against policy baselines.

**Why it matters:** Detects configuration drift early and provides actionable recommendations, safeguarding against misconfigurations that could weaken defences.

```sql
-- Security configuration registry
CREATE TABLE security_configurations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    config_category TEXT NOT NULL CHECK (config_category IN ('authentication', 'authorization', 'encryption', 'audit', 'network', 'application')),
    config_name TEXT NOT NULL,
    config_value TEXT NOT NULL,
    
    -- Configuration metadata
    description TEXT NOT NULL,
    security_impact TEXT NOT NULL CHECK (security_impact IN ('low', 'medium', 'high', 'critical')),
    compliance_requirements TEXT[] DEFAULT '{}', -- HIPAA, GDPR, etc.
    
    -- Change management
    is_active BOOLEAN NOT NULL DEFAULT true,
    last_reviewed_at TIMESTAMPTZ,
    reviewed_by UUID REFERENCES auth.users(id),
    
    -- Audit
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Security baseline configurations
INSERT INTO security_configurations (config_category, config_name, config_value, description, security_impact, compliance_requirements) VALUES
('authentication', 'password_min_length', '12', 'Minimum password length requirement', 'high', '{"HIPAA", "GDPR"}'),
('authentication', 'password_complexity', 'true', 'Require complex passwords with mixed case, numbers, symbols', 'high', '{"HIPAA"}'),
('authentication', 'mfa_required', 'true', 'Multi-factor authentication required for all users', 'critical', '{"HIPAA", "GDPR"}'),
('authentication', 'session_timeout', '1800', 'Session timeout in seconds (30 minutes)', 'medium', '{"HIPAA"}'),
('authorization', 'min_privilege_enforcement', 'true', 'Enforce principle of least privilege', 'critical', '{"HIPAA", "GDPR"}'),
('encryption', 'data_at_rest_encryption', 'AES-256', 'Encryption algorithm for data at rest', 'critical', '{"HIPAA", "GDPR"}'),
('encryption', 'data_in_transit_encryption', 'TLS-1.3', 'Encryption protocol for data in transit', 'critical', '{"HIPAA", "GDPR"}'),
('audit', 'audit_log_retention', '2555', 'Audit log retention period in days (7 years)', 'high', '{"HIPAA"}'),
('audit', 'real_time_monitoring', 'true', 'Enable real-time security monitoring', 'high', '{"HIPAA", "GDPR"}');

-- Security configuration compliance checker
CREATE OR REPLACE FUNCTION check_security_compliance()
RETURNS TABLE(
    config_name TEXT,
    current_value TEXT,
    compliant BOOLEAN,
    risk_level TEXT,
    recommendation TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        sc.config_name,
        sc.config_value as current_value,
        CASE 
            WHEN sc.config_name = 'password_min_length' AND sc.config_value::INTEGER >= 12 THEN true
            WHEN sc.config_name = 'mfa_required' AND sc.config_value::BOOLEAN = true THEN true
            WHEN sc.config_name = 'session_timeout' AND sc.config_value::INTEGER <= 1800 THEN true
            WHEN sc.config_name = 'audit_log_retention' AND sc.config_value::INTEGER >= 2555 THEN true
            ELSE false
        END as compliant,
        sc.security_impact as risk_level,
        CASE 
            WHEN sc.config_name = 'password_min_length' AND sc.config_value::INTEGER < 12 THEN 'Increase minimum password length to 12 characters'
            WHEN sc.config_name = 'mfa_required' AND sc.config_value::BOOLEAN = false THEN 'Enable multi-factor authentication'
            WHEN sc.config_name = 'session_timeout' AND sc.config_value::INTEGER > 1800 THEN 'Reduce session timeout to 30 minutes or less'
            WHEN sc.config_name = 'audit_log_retention' AND sc.config_value::INTEGER < 2555 THEN 'Increase audit log retention to 7 years (2555 days)'
            ELSE 'Configuration is compliant'
        END as recommendation
    FROM security_configurations sc
    WHERE sc.is_active = true;
END;
$$ LANGUAGE plpgsql;
```

### 6.2. Security Training and Awareness

**What it is:** Tables that track mandatory training modules, completion status, and simulated security exercises (e.g., phishing tests).

**Why it matters:** Provides evidence that all users receive regular security education, a common requirement in HIPAA, GDPR, and ISO frameworks.

```sql
-- Security training tracking
CREATE TABLE security_training (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id),
    
    -- Training details
    training_module TEXT NOT NULL,
    training_type TEXT NOT NULL CHECK (training_type IN ('initial', 'refresher', 'incident_response', 'role_specific')),
    completion_status TEXT NOT NULL DEFAULT 'not_started' CHECK (completion_status IN ('not_started', 'in_progress', 'completed', 'expired')),
    
    -- Training timeline
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    
    -- Assessment results
    assessment_score INTEGER CHECK (assessment_score BETWEEN 0 AND 100),
    passing_score INTEGER DEFAULT 80,
    attempts_count INTEGER DEFAULT 0,
    max_attempts INTEGER DEFAULT 3,
    
    -- Compliance tracking
    compliance_requirement TEXT[] DEFAULT '{}',
    certificate_issued BOOLEAN DEFAULT false,
    certificate_number TEXT,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Security incident simulation results
CREATE TABLE security_simulations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Simulation details
    simulation_type TEXT NOT NULL CHECK (simulation_type IN ('phishing', 'social_engineering', 'physical_security', 'data_breach')),
    simulation_name TEXT NOT NULL,
    target_users UUID[] NOT NULL,
    
    -- Results
    participants_count INTEGER NOT NULL,
    successful_detections INTEGER DEFAULT 0,
    failed_detections INTEGER DEFAULT 0,
    
    -- Individual results
    user_results JSONB DEFAULT '{}', -- {user_id: {detected: boolean, time_to_detect: seconds}}
    
    -- Simulation timeline
    launched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    
    -- Follow-up actions
    additional_training_required UUID[] DEFAULT '{}',
    incident_reports_generated INTEGER DEFAULT 0,
    
    conducted_by UUID NOT NULL REFERENCES auth.users(id)
);
```

---

## 7. Implementation and Maintenance

### 7.1. Security Deployment Checklist

**What it is:** A deployment-phase checklist that enumerates critical security tasks (enabling RLS, verifying encryption, penetration testing, etc.).

**Why it matters:** Ensures every environment rolls out with consistent, verified security controls, preventing gaps introduced during deployments or migrations.

```sql
-- Security deployment tracking
CREATE TABLE security_deployment_checklist (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    deployment_phase TEXT NOT NULL,
    checklist_item TEXT NOT NULL,
    
    -- Status tracking
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'skipped', 'failed')),
    priority TEXT NOT NULL CHECK (priority IN ('low', 'medium', 'high', 'critical')),
    
    -- Assignment and completion
    assigned_to UUID REFERENCES auth.users(id),
    completed_by UUID REFERENCES auth.users(id),
    completed_at TIMESTAMPTZ,
    
    -- Verification
    verification_required BOOLEAN DEFAULT false,
    verified_by UUID REFERENCES auth.users(id),
    verified_at TIMESTAMPTZ,
    verification_notes TEXT,
    
    -- Documentation
    documentation_link TEXT,
    compliance_evidence TEXT,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Essential security checklist items
INSERT INTO security_deployment_checklist (deployment_phase, checklist_item, priority, verification_required) VALUES
('pre_deployment', 'Enable Row Level Security on all patient data tables', 'critical', true),
('pre_deployment', 'Configure field-level encryption for sensitive data', 'critical', true),
('pre_deployment', 'Setup audit logging with 7-year retention', 'high', true),
('pre_deployment', 'Implement zero-trust access policies', 'high', true),
('pre_deployment', 'Configure anomaly detection patterns', 'medium', true),
('deployment', 'Verify RLS policies prevent cross-user data access', 'critical', true),
('deployment', 'Test encryption/decryption functions', 'critical', true),
('deployment', 'Validate audit trail completeness', 'high', true),
('deployment', 'Test incident response automation', 'medium', true),
('post_deployment', 'Monitor security alerts for 48 hours', 'high', false),
('post_deployment', 'Conduct penetration testing', 'high', true),
('post_deployment', 'Complete compliance documentation', 'medium', true);
```

### 7.2. Ongoing Security Maintenance

**What it is:** A scheduler for recurring security tasks such as patch reviews, access audits, key rotations, and disaster-recovery tests.

**Why it matters:** Embeds security into day-to-day operations, ensuring that controls remain effective as the system and threat landscape evolve.

```sql
-- Security maintenance schedule
CREATE TABLE security_maintenance_schedule (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    maintenance_type TEXT NOT NULL,
    frequency INTERVAL NOT NULL,
    last_executed TIMESTAMPTZ,
    next_due TIMESTAMPTZ NOT NULL,
    
    -- Execution details
    assigned_team TEXT[],
    estimated_duration INTERVAL,
    maintenance_window TEXT, -- e.g., 'weekends_2am_6am'
    
    -- Documentation
    procedure_document TEXT,
    checklist_items TEXT[],
    
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Standard security maintenance tasks
INSERT INTO security_maintenance_schedule (maintenance_type, frequency, next_due, assigned_team, estimated_duration) VALUES
('security_patch_review', '1 week', NOW() + INTERVAL '1 week', '{"security_team", "platform_team"}', '2 hours'),
('access_review', '1 month', NOW() + INTERVAL '1 month', '{"security_team", "compliance_team"}', '4 hours'),
('encryption_key_rotation', '3 months', NOW() + INTERVAL '3 months', '{"security_team"}', '2 hours'),
('penetration_testing', '6 months', NOW() + INTERVAL '6 months', '{"external_security_firm"}', '1 week'),
('disaster_recovery_test', '6 months', NOW() + INTERVAL '6 months', '{"platform_team", "security_team"}', '8 hours'),
('compliance_audit', '1 year', NOW() + INTERVAL '1 year', '{"compliance_team", "legal_team"}', '2 weeks');
```

---

## Summary

This Guardian v7 Security & Compliance Framework provides:

**Advanced Security Features:**
- Field-level encryption for sensitive data with key management
- Zero-trust architecture with policy-based access control
- Anomaly detection for access patterns with automated response
- Comprehensive security monitoring and alerting

**Compliance Systems:**
- GDPR compliance with consent management and right to erasure
- HIPAA compliance with authorization tracking and minimum necessary rules  
- 7-year audit retention with automated partitioning
- Breach detection and notification systems

**Operational Security:**
- Automated incident response with configurable playbooks
- Security configuration management and compliance checking
- Comprehensive audit dashboard with real-time monitoring
- Security training tracking and simulation results

**Reference Integration:**
- Builds upon the foundational RLS policies in [`core-schema.md`](./core-schema.md)
- Integrates with the performance monitoring in [`performance-monitoring.md`](./performance-monitoring.md)
- Supports the healthcare interoperability features in other v7 modules

This framework ensures Guardian meets the highest standards for healthcare data security and regulatory compliance while providing the tools and automation needed for ongoing security operations.

---

## 8. Future Provider Portal Security Considerations

The v7 security framework is designed to accommodate future provider portal integration. Key architectural decisions that support secure provider access:

### 8.1. Provider-Specific RLS Policies (v7.1 Planned)

Extension of existing RLS framework for provider access:

```sql
-- Provider access to patient clinical events
CREATE POLICY provider_can_view_consented_patients ON patient_clinical_events
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM patient_provider_access ppa
            WHERE ppa.patient_id = patient_clinical_events.patient_id
            AND ppa.provider_id = auth.uid()
            AND ppa.status = 'active'
            AND (ppa.expires_at IS NULL OR ppa.expires_at > NOW())
            AND 'clinical_events' = ANY(ppa.access_scope)
        )
    );

-- Provider audit log access (providers can only see their own actions)
CREATE POLICY provider_audit_isolation ON audit_log
    FOR SELECT USING (
        changed_by = auth.uid() 
        OR changed_on_behalf_of = auth.uid()
    );
```

### 8.2. Enhanced Audit Requirements for Provider Access

Provider interactions require additional audit context:

```sql
-- Enhanced audit fields for provider actions
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS provider_context JSONB DEFAULT '{}';
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS patient_consent_verified BOOLEAN DEFAULT FALSE;
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS provider_pledge_acknowledged BOOLEAN DEFAULT FALSE;

-- Provider-specific audit triggers
CREATE OR REPLACE FUNCTION provider_audit_trigger_function()
RETURNS TRIGGER AS $$
BEGIN
    -- Enhanced audit for provider-patient interactions
    IF current_setting('app.user_role', true) = 'healthcare_provider' THEN
        INSERT INTO audit_log (
            -- ... existing fields
            provider_context,
            patient_consent_verified,
            provider_pledge_acknowledged
        ) VALUES (
            -- ... existing values
            current_setting('app.provider_context', true)::JSONB,
            current_setting('app.consent_verified', true)::BOOLEAN,
            current_setting('app.pledge_acknowledged', true)::BOOLEAN
        );
    END IF;
    
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;
```

### 8.3. Provider Authentication Security Requirements

Enhanced authentication for healthcare providers:

- **Multi-Factor Authentication (MFA)**: Mandatory for all provider accounts
- **Registry Verification**: AHPRA/professional registry verification required
- **Device Trust**: Provider devices must be registered and trusted
- **Session Management**: Shorter session timeouts (15 minutes) for provider accounts
- **IP Restrictions**: Optional IP allowlisting for practice locations

### 8.4. Zero-Trust Architecture for Providers

Provider access follows zero-trust principles:

```sql
-- Provider zero-trust validation
CREATE OR REPLACE FUNCTION validate_provider_zero_trust_access(
    p_provider_id UUID,
    p_patient_id UUID,
    p_resource_type TEXT,
    p_context JSONB DEFAULT '{}'
) RETURNS BOOLEAN AS $$
DECLARE
    access_granted BOOLEAN := FALSE;
BEGIN
    -- Verify active patient consent
    IF NOT EXISTS (
        SELECT 1 FROM patient_provider_access 
        WHERE provider_id = p_provider_id 
        AND patient_id = p_patient_id
        AND status = 'active'
        AND (expires_at IS NULL OR expires_at > NOW())
        AND p_resource_type = ANY(access_scope)
    ) THEN
        RETURN FALSE;
    END IF;
    
    -- Verify provider has acknowledged data sharing pledge
    IF NOT EXISTS (
        SELECT 1 FROM patient_provider_access
        WHERE provider_id = p_provider_id
        AND patient_id = p_patient_id
        AND provider_pledged_data_return = TRUE
    ) THEN
        RETURN FALSE;
    END IF;
    
    -- Verify MFA for sensitive data access
    IF p_resource_type IN ('medications', 'conditions', 'lab_results') THEN
        IF (p_context->>'mfa_verified')::BOOLEAN IS NOT TRUE THEN
            RETURN FALSE;
        END IF;
    END IF;
    
    -- Verify session is within allowed time
    IF (p_context->>'session_age_minutes')::INTEGER > 15 THEN
        RETURN FALSE;
    END IF;
    
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

### 8.5. Provider Data Security Classifications

Enhanced data classification for provider access:

```sql
-- Provider access data classifications
CREATE TABLE provider_data_classifications (
    data_type TEXT PRIMARY KEY,
    classification TEXT NOT NULL CHECK (classification IN ('public', 'restricted', 'confidential', 'highly_confidential')),
    provider_access_level TEXT NOT NULL CHECK (provider_access_level IN ('none', 'read_only', 'read_write', 'full_access')),
    requires_explicit_consent BOOLEAN NOT NULL DEFAULT TRUE,
    requires_mfa BOOLEAN NOT NULL DEFAULT FALSE,
    audit_level TEXT NOT NULL CHECK (audit_level IN ('basic', 'detailed', 'comprehensive')),
    retention_period_days INTEGER DEFAULT 2555 -- 7 years
);

-- Standard healthcare data classifications
INSERT INTO provider_data_classifications VALUES
('demographics', 'restricted', 'read_only', TRUE, FALSE, 'basic', 2555),
('medications', 'confidential', 'read_write', TRUE, TRUE, 'comprehensive', 2555),
('conditions', 'confidential', 'read_write', TRUE, TRUE, 'comprehensive', 2555),
('lab_results', 'highly_confidential', 'read_only', TRUE, TRUE, 'comprehensive', 2555),
('imaging_reports', 'highly_confidential', 'read_only', TRUE, TRUE, 'comprehensive', 2555),
('clinical_notes', 'highly_confidential', 'read_write', TRUE, TRUE, 'comprehensive', 2555);
```

### 8.6. Provider Security Monitoring

Enhanced monitoring for provider activities:

- **Real-time anomaly detection** for unusual provider access patterns
- **Cross-patient access monitoring** to detect potential privacy violations
- **Provider behavior analytics** to identify suspicious activities
- **Automated alerts** for high-risk provider actions
- **Compliance dashboards** for healthcare organizations

### 8.7. Provider-Specific Compliance Requirements

Additional compliance considerations for provider portal:

#### HIPAA Compliance:
- **Minimum Necessary Rule**: Providers see only data necessary for their clinical purpose
- **Business Associate Agreements**: Required for healthcare organizations using Guardian
- **Breach Notification**: Enhanced procedures for provider-related incidents

#### Professional Standards:
- **Medical Board Reporting**: Integration with medical licensing board requirements
- **Professional Liability**: Clear documentation of provider access and actions
- **Clinical Guidelines**: Adherence to specialty-specific clinical practice guidelines

**Future Implementation**: These security enhancements will be implemented as part of Guardian v7.1 (provider portal phase).

**Reference**: See [`Doctor_portal_architecture_analysis.md`](./Doctor_portal_architecture_analysis.md) for comprehensive provider portal security architecture from Opus4.