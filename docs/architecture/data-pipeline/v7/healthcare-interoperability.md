# Guardian Healthcare Interoperability

**Module:** Healthcare Interoperability & Standards  
**Version:** 7.0  
**Status:** In Development - High Priority  
**Dependencies:** [Core Schema](./core-schema.md)

---

## Overview

Guardian v7 introduces comprehensive healthcare interoperability through FHIR (Fast Healthcare Interoperability Resources) and HL7 standards integration. This module enables seamless data exchange with external healthcare systems while maintaining Guardian's patient-owned data model.

**Key Features:**
- 🏥 **FHIR R4 Compliance** - Full resource mapping and transformation
- 🔄 **Bidirectional Integration** - Import from and export to external systems
- 📋 **HL7 Message Processing** - Standard healthcare message formats
- 🛡️ **Security Compliant** - HIPAA and OAuth 2.0 integration
- 📊 **Data Quality** - Validation and normalization workflows

---

## 1. FHIR Resource Mapping

### 1.1. Core FHIR Resources

Based on Opus-4's recommendations, we start with these essential FHIR resources:

#### Patient Resource Mapping
```sql
-- FHIR Patient resource mapping
CREATE TABLE fhir_patient_mappings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    guardian_user_id UUID NOT NULL REFERENCES auth.users(id),
    fhir_patient_id TEXT NOT NULL,
    source_system TEXT NOT NULL,
    
    -- FHIR Patient fields
    identifier JSONB NOT NULL, -- Multiple identifiers (SSN, MRN, etc.)
    name_official JSONB, -- HumanName structure
    name_usual JSONB,
    telecom JSONB, -- ContactPoint array
    gender TEXT CHECK (gender IN ('male', 'female', 'other', 'unknown')),
    birth_date DATE,
    deceased_boolean BOOLEAN,
    deceased_datetime TIMESTAMPTZ,
    address JSONB, -- Address array
    marital_status TEXT,
    multiple_birth JSONB,
    photo JSONB, -- Attachment array
    contact JSONB, -- Patient contact persons
    communication JSONB, -- Communication preferences
    general_practitioner JSONB, -- Reference array
    managing_organization TEXT, -- Reference
    
    -- Metadata
    active BOOLEAN NOT NULL DEFAULT true,
    last_sync TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    sync_status TEXT NOT NULL DEFAULT 'active' CHECK (sync_status IN ('active', 'error', 'deprecated')),
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Unique constraint per source system
    UNIQUE(fhir_patient_id, source_system)
);

-- Index for efficient lookups
CREATE INDEX idx_fhir_patient_mappings_user ON fhir_patient_mappings(guardian_user_id);
CREATE INDEX idx_fhir_patient_mappings_source ON fhir_patient_mappings(source_system, fhir_patient_id);
```

#### Observation Resource Mapping (Lab Results & Vitals)
```sql
-- FHIR Observation resource for lab results and vitals
CREATE TABLE fhir_observations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    guardian_patient_id UUID NOT NULL REFERENCES auth.users(id),
    fhir_observation_id TEXT NOT NULL,
    source_system TEXT NOT NULL,
    
    -- FHIR Observation core fields
    identifier JSONB, -- Business identifiers
    based_on JSONB, -- Reference array - what triggered this observation
    part_of JSONB, -- Reference array - procedure this is part of
    status TEXT NOT NULL CHECK (status IN (
        'registered', 'preliminary', 'final', 'amended', 
        'corrected', 'cancelled', 'entered-in-error', 'unknown'
    )),
    category JSONB NOT NULL, -- CodeableConcept array (vital-signs, laboratory, etc.)
    code JSONB NOT NULL, -- CodeableConcept - what was observed
    subject TEXT NOT NULL, -- Reference to Patient
    focus JSONB, -- Reference array - actual focus of observation
    encounter TEXT, -- Reference to Encounter
    
    -- Timing
    effective_datetime TIMESTAMPTZ,
    effective_period JSONB, -- Period structure
    effective_timing JSONB, -- Timing structure
    effective_instant TIMESTAMPTZ,
    
    issued TIMESTAMPTZ, -- When result was published
    performer JSONB, -- Reference array - who performed
    
    -- Values (one of these will be populated)
    value_quantity JSONB, -- Quantity structure
    value_codeable_concept JSONB, -- CodeableConcept
    value_string TEXT,
    value_boolean BOOLEAN,
    value_integer INTEGER,
    value_range JSONB, -- Range structure
    value_ratio JSONB, -- Ratio structure
    value_sampled_data JSONB, -- SampledData structure
    value_time TIME,
    value_datetime TIMESTAMPTZ,
    value_period JSONB, -- Period structure
    
    -- Additional fields
    data_absent_reason JSONB, -- CodeableConcept - why no value
    interpretation JSONB, -- CodeableConcept array (H, L, N, etc.)
    note JSONB, -- Annotation array
    body_site JSONB, -- CodeableConcept
    method JSONB, -- CodeableConcept - how measurement was made
    specimen TEXT, -- Reference to Specimen
    device TEXT, -- Reference to Device
    reference_range JSONB, -- ObservationReferenceRange array
    has_member JSONB, -- Reference array - related observations
    derived_from JSONB, -- Reference array - source observations
    component JSONB, -- ObservationComponent array - multi-component observations
    
    -- Guardian linkage
    guardian_lab_result_id UUID REFERENCES patient_lab_results(id),
    guardian_vital_id UUID REFERENCES patient_vitals(id),
    
    -- Sync metadata
    last_sync TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    sync_status TEXT NOT NULL DEFAULT 'active',
    sync_errors JSONB,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    UNIQUE(fhir_observation_id, source_system)
);

-- Indexes for efficient querying
CREATE INDEX idx_fhir_observations_patient ON fhir_observations(guardian_patient_id);
CREATE INDEX idx_fhir_observations_category ON fhir_observations USING GIN(category);
CREATE INDEX idx_fhir_observations_code ON fhir_observations USING GIN(code);
CREATE INDEX idx_fhir_observations_effective ON fhir_observations(effective_datetime);
CREATE INDEX idx_fhir_observations_status ON fhir_observations(status);
```

#### MedicationRequest Resource Mapping
```sql
-- FHIR MedicationRequest resource
CREATE TABLE fhir_medication_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    guardian_patient_id UUID NOT NULL REFERENCES auth.users(id),
    fhir_request_id TEXT NOT NULL,
    source_system TEXT NOT NULL,
    
    -- FHIR MedicationRequest core fields
    identifier JSONB, -- Business identifiers
    status TEXT NOT NULL CHECK (status IN (
        'active', 'on-hold', 'cancelled', 'completed', 
        'entered-in-error', 'stopped', 'draft', 'unknown'
    )),
    status_reason JSONB, -- CodeableConcept
    intent TEXT NOT NULL CHECK (intent IN (
        'proposal', 'plan', 'order', 'original-order', 
        'reflex-order', 'filler-order', 'instance-order', 'option'
    )),
    category JSONB, -- CodeableConcept array
    priority TEXT CHECK (priority IN ('routine', 'urgent', 'asap', 'stat')),
    do_not_perform BOOLEAN,
    
    -- Medication reference
    medication_codeable_concept JSONB, -- CodeableConcept
    medication_reference TEXT, -- Reference to Medication
    
    subject TEXT NOT NULL, -- Reference to Patient
    encounter TEXT, -- Reference to Encounter
    supporting_information JSONB, -- Reference array
    authored_on TIMESTAMPTZ,
    requester TEXT, -- Reference to practitioner/organization
    performer TEXT, -- Reference - intended performer
    performer_type JSONB, -- CodeableConcept
    recorder TEXT, -- Reference - who recorded
    reason_code JSONB, -- CodeableConcept array
    reason_reference JSONB, -- Reference array
    instantiates_canonical TEXT,
    instantiates_uri TEXT,
    based_on JSONB, -- Reference array
    group_identifier JSONB, -- Identifier
    course_of_therapy_type JSONB, -- CodeableConcept
    insurance JSONB, -- Reference array
    note JSONB, -- Annotation array
    
    -- Dosage instructions
    dosage_instruction JSONB, -- Dosage array
    
    -- Dispense request
    dispense_request JSONB, -- MedicationRequestDispenseRequest
    
    -- Substitution
    substitution JSONB, -- MedicationRequestSubstitution
    
    prior_prescription TEXT, -- Reference to MedicationRequest
    detection_date TIMESTAMPTZ,
    event_history JSONB, -- Reference array
    
    -- Guardian linkage
    guardian_medication_id UUID REFERENCES patient_medications(id),
    
    -- Sync metadata
    last_sync TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    sync_status TEXT NOT NULL DEFAULT 'active',
    sync_errors JSONB,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    UNIQUE(fhir_request_id, source_system)
);

-- Indexes
CREATE INDEX idx_fhir_medication_requests_patient ON fhir_medication_requests(guardian_patient_id);
CREATE INDEX idx_fhir_medication_requests_status ON fhir_medication_requests(status);
CREATE INDEX idx_fhir_medication_requests_authored ON fhir_medication_requests(authored_on);
```

#### DocumentReference Resource Mapping
```sql
-- FHIR DocumentReference for Guardian's document system
CREATE TABLE fhir_document_references (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    guardian_patient_id UUID NOT NULL REFERENCES auth.users(id),
    fhir_document_id TEXT NOT NULL,
    source_system TEXT NOT NULL,
    
    -- FHIR DocumentReference core fields
    master_identifier JSONB, -- Identifier
    identifier JSONB, -- Identifier array
    status TEXT NOT NULL CHECK (status IN ('current', 'superseded', 'entered-in-error')),
    doc_status TEXT CHECK (doc_status IN ('preliminary', 'final', 'amended', 'entered-in-error')),
    type JSONB, -- CodeableConcept
    category JSONB, -- CodeableConcept array
    subject TEXT NOT NULL, -- Reference to Patient
    date TIMESTAMPTZ,
    author JSONB, -- Reference array
    authenticator TEXT, -- Reference
    custodian TEXT, -- Reference to Organization
    relates_to JSONB, -- DocumentReferenceRelatesTo array
    description TEXT,
    security_label JSONB, -- CodeableConcept array
    content JSONB NOT NULL, -- DocumentReferenceContent array
    context JSONB, -- DocumentReferenceContext
    
    -- Guardian linkage
    guardian_document_id UUID REFERENCES documents(id),
    
    -- Sync metadata
    last_sync TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    sync_status TEXT NOT NULL DEFAULT 'active',
    sync_errors JSONB,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    UNIQUE(fhir_document_id, source_system)
);

-- Indexes
CREATE INDEX idx_fhir_document_references_patient ON fhir_document_references(guardian_patient_id);
CREATE INDEX idx_fhir_document_references_document ON fhir_document_references(guardian_document_id);
CREATE INDEX idx_fhir_document_references_type ON fhir_document_references USING GIN(type);
CREATE INDEX idx_fhir_document_references_date ON fhir_document_references(date);
```

---

## 2. FHIR Transformation Functions

### 2.1. Guardian to FHIR Transformation

```sql
-- Transform Guardian patient data to FHIR Patient resource
CREATE OR REPLACE FUNCTION guardian_to_fhir_patient(
    p_user_id UUID
) RETURNS JSONB AS $$
DECLARE
    patient_data RECORD;
    fhir_patient JSONB;
BEGIN
    -- Get Guardian patient data
    SELECT u.id, u.email, up.first_name, up.last_name, up.date_of_birth, up.phone
    INTO patient_data
    FROM auth.users u
    LEFT JOIN user_profiles up ON u.id = up.user_id
    WHERE u.id = p_user_id;
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Patient not found: %', p_user_id;
    END IF;
    
    -- Build FHIR Patient resource
    fhir_patient := jsonb_build_object(
        'resourceType', 'Patient',
        'id', patient_data.id::text,
        'identifier', jsonb_build_array(
            jsonb_build_object(
                'use', 'usual',
                'system', 'https://guardian.health/patient-id',
                'value', patient_data.id::text
            )
        ),
        'active', true,
        'name', jsonb_build_array(
            jsonb_build_object(
                'use', 'official',
                'family', patient_data.last_name,
                'given', jsonb_build_array(patient_data.first_name)
            )
        ),
        'telecom', jsonb_build_array(
            jsonb_build_object(
                'system', 'email',
                'value', patient_data.email,
                'use', 'home'
            )
        )
    );
    
    -- Add phone if available
    IF patient_data.phone IS NOT NULL THEN
        fhir_patient := jsonb_set(
            fhir_patient,
            '{telecom}',
            (fhir_patient->'telecom') || jsonb_build_array(
                jsonb_build_object(
                    'system', 'phone',
                    'value', patient_data.phone,
                    'use', 'home'
                )
            )
        );
    END IF;
    
    -- Add birth date if available
    IF patient_data.date_of_birth IS NOT NULL THEN
        fhir_patient := jsonb_set(
            fhir_patient,
            '{birthDate}',
            to_jsonb(patient_data.date_of_birth::text)
        );
    END IF;
    
    RETURN fhir_patient;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Transform Guardian lab result to FHIR Observation
CREATE OR REPLACE FUNCTION guardian_to_fhir_observation(
    p_lab_result_id UUID
) RETURNS JSONB AS $$
DECLARE
    lab_data RECORD;
    fhir_observation JSONB;
BEGIN
    SELECT 
        lr.id, lr.user_id, lr.test_name, lr.result_value, 
        lr.unit_of_measure, lr.reference_range, lr.test_date,
        lr.lab_provider, lr.status
    INTO lab_data
    FROM patient_lab_results lr
    WHERE lr.id = p_lab_result_id;
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Lab result not found: %', p_lab_result_id;
    END IF;
    
    -- Build FHIR Observation resource
    fhir_observation := jsonb_build_object(
        'resourceType', 'Observation',
        'id', lab_data.id::text,
        'status', CASE 
            WHEN lab_data.status = 'active' THEN 'final'
            ELSE 'unknown'
        END,
        'category', jsonb_build_array(
            jsonb_build_object(
                'coding', jsonb_build_array(
                    jsonb_build_object(
                        'system', 'http://terminology.hl7.org/CodeSystem/observation-category',
                        'code', 'laboratory',
                        'display', 'Laboratory'
                    )
                )
            )
        ),
        'code', jsonb_build_object(
            'text', lab_data.test_name
        ),
        'subject', jsonb_build_object(
            'reference', 'Patient/' || lab_data.user_id::text
        ),
        'effectiveDateTime', lab_data.test_date::text
    );
    
    -- Add value and unit if available
    IF lab_data.result_value IS NOT NULL THEN
        fhir_observation := jsonb_set(
            fhir_observation,
            '{valueQuantity}',
            jsonb_build_object(
                'value', lab_data.result_value::numeric,
                'unit', COALESCE(lab_data.unit_of_measure, ''),
                'system', 'http://unitsofmeasure.org'
            )
        );
    END IF;
    
    -- Add reference range if available
    IF lab_data.reference_range IS NOT NULL THEN
        fhir_observation := jsonb_set(
            fhir_observation,
            '{referenceRange}',
            jsonb_build_array(
                jsonb_build_object(
                    'text', lab_data.reference_range
                )
            )
        );
    END IF;
    
    RETURN fhir_observation;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

### 2.2. FHIR to Guardian Transformation

```sql
-- Import FHIR Patient resource to Guardian
CREATE OR REPLACE FUNCTION fhir_to_guardian_patient(
    p_fhir_patient JSONB,
    p_source_system TEXT
) RETURNS UUID AS $$
DECLARE
    guardian_user_id UUID;
    patient_name JSONB;
    patient_telecom JSONB;
    patient_email TEXT;
    patient_phone TEXT;
BEGIN
    -- Extract basic patient information
    patient_name := (p_fhir_patient->'name'->0);
    patient_telecom := p_fhir_patient->'telecom';
    
    -- Extract email and phone
    SELECT value INTO patient_email
    FROM jsonb_array_elements(patient_telecom) telecom
    WHERE telecom->>'system' = 'email'
    LIMIT 1;
    
    SELECT value INTO patient_phone
    FROM jsonb_array_elements(patient_telecom) telecom
    WHERE telecom->>'system' = 'phone'
    LIMIT 1;
    
    -- Create or update Guardian user
    INSERT INTO auth.users (email, created_at)
    VALUES (COALESCE(patient_email, 'imported-' || gen_random_uuid()::text || '@guardian.health'), NOW())
    ON CONFLICT (email) DO UPDATE SET updated_at = NOW()
    RETURNING id INTO guardian_user_id;
    
    -- Create or update user profile
    INSERT INTO user_profiles (
        user_id, 
        first_name, 
        last_name,
        date_of_birth,
        phone
    ) VALUES (
        guardian_user_id,
        patient_name->'given'->>0,
        patient_name->>'family',
        (p_fhir_patient->>'birthDate')::date,
        patient_phone
    )
    ON CONFLICT (user_id) DO UPDATE SET
        first_name = EXCLUDED.first_name,
        last_name = EXCLUDED.last_name,
        date_of_birth = EXCLUDED.date_of_birth,
        phone = EXCLUDED.phone,
        updated_at = NOW();
    
    -- Create FHIR mapping record
    INSERT INTO fhir_patient_mappings (
        guardian_user_id,
        fhir_patient_id,
        source_system,
        identifier,
        name_official,
        telecom,
        gender,
        birth_date
    ) VALUES (
        guardian_user_id,
        p_fhir_patient->>'id',
        p_source_system,
        p_fhir_patient->'identifier',
        patient_name,
        patient_telecom,
        p_fhir_patient->>'gender',
        (p_fhir_patient->>'birthDate')::date
    )
    ON CONFLICT (fhir_patient_id, source_system) DO UPDATE SET
        identifier = EXCLUDED.identifier,
        name_official = EXCLUDED.name_official,
        telecom = EXCLUDED.telecom,
        gender = EXCLUDED.gender,
        birth_date = EXCLUDED.birth_date,
        last_sync = NOW();
    
    RETURN guardian_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Import FHIR Observation to Guardian lab results
CREATE OR REPLACE FUNCTION fhir_to_guardian_observation(
    p_fhir_observation JSONB,
    p_source_system TEXT
) RETURNS UUID AS $$
DECLARE
    guardian_user_id UUID;
    lab_result_id UUID;
    observation_code JSONB;
    observation_value JSONB;
BEGIN
    -- Extract patient reference and find Guardian user
    SELECT guardian_user_id INTO guardian_user_id
    FROM fhir_patient_mappings
    WHERE fhir_patient_id = substring(p_fhir_observation->'subject'->>'reference', 9) -- Remove 'Patient/' prefix
    AND source_system = p_source_system;
    
    IF guardian_user_id IS NULL THEN
        RAISE EXCEPTION 'Guardian patient not found for FHIR observation';
    END IF;
    
    observation_code := p_fhir_observation->'code';
    observation_value := p_fhir_observation->'valueQuantity';
    
    -- Create Guardian lab result
    INSERT INTO patient_lab_results (
        user_id,
        test_name,
        result_value,
        unit_of_measure,
        test_date,
        status,
        lab_provider
    ) VALUES (
        guardian_user_id,
        COALESCE(observation_code->>'text', observation_code->'coding'->0->>'display'),
        (observation_value->>'value')::numeric,
        observation_value->>'unit',
        (p_fhir_observation->>'effectiveDateTime')::timestamptz,
        CASE p_fhir_observation->>'status'
            WHEN 'final' THEN 'active'
            ELSE 'unknown'
        END,
        p_source_system
    )
    RETURNING id INTO lab_result_id;
    
    -- Create FHIR mapping record
    INSERT INTO fhir_observations (
        guardian_patient_id,
        fhir_observation_id,
        source_system,
        status,
        category,
        code,
        effective_datetime,
        value_quantity,
        guardian_lab_result_id
    ) VALUES (
        guardian_user_id,
        p_fhir_observation->>'id',
        p_source_system,
        p_fhir_observation->>'status',
        p_fhir_observation->'category',
        observation_code,
        (p_fhir_observation->>'effectiveDateTime')::timestamptz,
        observation_value,
        lab_result_id
    );
    
    RETURN lab_result_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

---

## 3. Integration APIs & Sync Framework

### 3.1. FHIR API Integration Table

```sql
-- FHIR endpoint configurations
CREATE TABLE fhir_endpoints (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    system_name TEXT NOT NULL UNIQUE,
    base_url TEXT NOT NULL,
    fhir_version TEXT NOT NULL DEFAULT 'R4',
    
    -- Authentication
    auth_type TEXT NOT NULL CHECK (auth_type IN ('oauth2', 'bearer', 'basic', 'none')),
    auth_config JSONB NOT NULL DEFAULT '{}',
    
    -- Capabilities
    supported_resources TEXT[] NOT NULL DEFAULT '{}',
    supported_operations TEXT[] NOT NULL DEFAULT '{}',
    
    -- Sync configuration
    sync_enabled BOOLEAN NOT NULL DEFAULT true,
    sync_frequency_minutes INTEGER DEFAULT 60,
    last_sync TIMESTAMPTZ,
    sync_errors JSONB,
    
    -- Rate limiting
    rate_limit_requests INTEGER DEFAULT 100,
    rate_limit_window_minutes INTEGER DEFAULT 60,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- FHIR sync jobs tracking
CREATE TABLE fhir_sync_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    endpoint_id UUID NOT NULL REFERENCES fhir_endpoints(id),
    resource_type TEXT NOT NULL,
    operation TEXT NOT NULL CHECK (operation IN ('import', 'export', 'sync')),
    
    -- Job configuration
    patient_filter UUID, -- Specific patient or null for all
    date_filter JSONB, -- Date range filters
    resource_filter JSONB, -- Additional filters
    
    -- Status tracking
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
        'pending', 'running', 'completed', 'failed', 'cancelled'
    )),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    
    -- Progress tracking
    total_resources INTEGER,
    processed_resources INTEGER DEFAULT 0,
    failed_resources INTEGER DEFAULT 0,
    
    -- Results
    success_count INTEGER DEFAULT 0,
    error_count INTEGER DEFAULT 0,
    warnings JSONB DEFAULT '[]',
    errors JSONB DEFAULT '[]',
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for job monitoring
CREATE INDEX idx_fhir_sync_jobs_status ON fhir_sync_jobs(status);
CREATE INDEX idx_fhir_sync_jobs_endpoint ON fhir_sync_jobs(endpoint_id);
CREATE INDEX idx_fhir_sync_jobs_created ON fhir_sync_jobs(created_at);
```

### 3.2. Data Quality & Validation

```sql
-- FHIR data validation results
CREATE TABLE fhir_validation_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    resource_type TEXT NOT NULL,
    resource_id TEXT NOT NULL,
    source_system TEXT NOT NULL,
    
    -- Validation results
    is_valid BOOLEAN NOT NULL,
    validation_errors JSONB DEFAULT '[]',
    validation_warnings JSONB DEFAULT '[]',
    validation_profile TEXT, -- FHIR profile used for validation
    
    -- Data quality scores
    completeness_score NUMERIC(3,2), -- 0.00 to 1.00
    consistency_score NUMERIC(3,2),
    accuracy_score NUMERIC(3,2),
    
    -- Guardian mapping status
    mapping_status TEXT DEFAULT 'pending' CHECK (mapping_status IN (
        'pending', 'mapped', 'failed', 'partial'
    )),
    mapping_errors JSONB DEFAULT '[]',
    guardian_resource_id UUID, -- Link to Guardian entity
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Data quality monitoring function
CREATE OR REPLACE FUNCTION validate_fhir_resource(
    p_resource_type TEXT,
    p_resource_data JSONB,
    p_source_system TEXT
) RETURNS UUID AS $$
DECLARE
    validation_id UUID;
    is_valid BOOLEAN := true;
    errors JSONB := '[]';
    warnings JSONB := '[]';
    completeness_score NUMERIC := 1.0;
BEGIN
    -- Basic FHIR resource validation
    IF p_resource_data->>'resourceType' != p_resource_type THEN
        is_valid := false;
        errors := errors || jsonb_build_array(
            jsonb_build_object(
                'code', 'invalid-resource-type',
                'message', 'Resource type mismatch'
            )
        );
    END IF;
    
    -- Resource-specific validation
    CASE p_resource_type
        WHEN 'Patient' THEN
            -- Patient must have identifier
            IF p_resource_data->'identifier' IS NULL THEN
                is_valid := false;
                errors := errors || '["Patient must have at least one identifier"]'::jsonb;
            END IF;
            
            -- Calculate completeness based on available fields
            completeness_score := 0.0;
            IF p_resource_data->'identifier' IS NOT NULL THEN completeness_score := completeness_score + 0.3; END IF;
            IF p_resource_data->'name' IS NOT NULL THEN completeness_score := completeness_score + 0.3; END IF;
            IF p_resource_data->'birthDate' IS NOT NULL THEN completeness_score := completeness_score + 0.2; END IF;
            IF p_resource_data->'telecom' IS NOT NULL THEN completeness_score := completeness_score + 0.2; END IF;
            
        WHEN 'Observation' THEN
            -- Observation must have code and status
            IF p_resource_data->'code' IS NULL THEN
                is_valid := false;
                errors := errors || '["Observation must have a code"]'::jsonb;
            END IF;
            
            IF p_resource_data->'status' IS NULL THEN
                is_valid := false;
                errors := errors || '["Observation must have a status"]'::jsonb;
            END IF;
    END CASE;
    
    -- Insert validation results
    INSERT INTO fhir_validation_results (
        resource_type,
        resource_id,
        source_system,
        is_valid,
        validation_errors,
        validation_warnings,
        completeness_score
    ) VALUES (
        p_resource_type,
        p_resource_data->>'id',
        p_source_system,
        is_valid,
        errors,
        warnings,
        completeness_score
    )
    RETURNING id INTO validation_id;
    
    RETURN validation_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

---

## 4. HL7 Message Processing

### 4.1. HL7 Message Storage

```sql
-- HL7 message processing
CREATE TABLE hl7_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Message identification
    message_type TEXT NOT NULL, -- ADT^A08, ORU^R01, etc.
    message_control_id TEXT,
    sending_application TEXT,
    sending_facility TEXT,
    receiving_application TEXT,
    receiving_facility TEXT,
    
    -- Raw message
    raw_message TEXT NOT NULL,
    message_segments JSONB, -- Parsed HL7 segments
    
    -- Processing status
    processing_status TEXT NOT NULL DEFAULT 'received' CHECK (processing_status IN (
        'received', 'parsing', 'parsed', 'processing', 'processed', 'failed', 'rejected'
    )),
    processing_errors JSONB DEFAULT '[]',
    
    -- Patient identification
    patient_identifier TEXT, -- MRN or other ID from PID segment
    guardian_patient_id UUID REFERENCES auth.users(id),
    
    -- Timestamps
    message_timestamp TIMESTAMPTZ,
    received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    processed_at TIMESTAMPTZ,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- HL7 to FHIR conversion tracking
CREATE TABLE hl7_to_fhir_conversions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    hl7_message_id UUID NOT NULL REFERENCES hl7_messages(id),
    
    -- Conversion results
    fhir_resources JSONB NOT NULL, -- Array of FHIR resources
    conversion_status TEXT NOT NULL DEFAULT 'pending',
    conversion_errors JSONB DEFAULT '[]',
    
    -- Mapping metadata
    conversion_rules_version TEXT,
    conversion_profile TEXT,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

## 5. OAuth 2.0 & Security Integration

### 5.1. FHIR OAuth Configuration

```sql
-- OAuth 2.0 configurations for FHIR endpoints
CREATE TABLE fhir_oauth_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    endpoint_id UUID NOT NULL REFERENCES fhir_endpoints(id),
    
    -- OAuth 2.0 settings
    authorization_url TEXT NOT NULL,
    token_url TEXT NOT NULL,
    client_id TEXT NOT NULL,
    client_secret TEXT, -- Encrypted
    scope TEXT NOT NULL DEFAULT 'patient/*.read',
    
    -- Token management
    access_token TEXT, -- Encrypted
    refresh_token TEXT, -- Encrypted
    token_expires_at TIMESTAMPTZ,
    
    -- SMART on FHIR settings
    smart_enabled BOOLEAN DEFAULT false,
    launch_url TEXT,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Audit FHIR API access
CREATE TABLE fhir_api_audit (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    endpoint_id UUID NOT NULL REFERENCES fhir_endpoints(id),
    
    -- Request details
    operation TEXT NOT NULL, -- GET, POST, PUT, DELETE
    resource_type TEXT,
    resource_id TEXT,
    request_url TEXT NOT NULL,
    
    -- Response details
    response_status INTEGER,
    response_time_ms INTEGER,
    data_transferred_bytes INTEGER,
    
    -- Guardian context
    guardian_user_id UUID REFERENCES auth.users(id),
    initiated_by TEXT NOT NULL, -- 'user', 'system', 'sync'
    
    -- Audit trail
    ip_address INET,
    user_agent TEXT,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for audit queries
CREATE INDEX idx_fhir_api_audit_endpoint ON fhir_api_audit(endpoint_id);
CREATE INDEX idx_fhir_api_audit_user ON fhir_api_audit(guardian_user_id);
CREATE INDEX idx_fhir_api_audit_created ON fhir_api_audit(created_at);
```

---

## 6. Implementation Roadmap

### Phase 1: Foundation (Weeks 1-2)
1. **Core FHIR Tables** - Implement Patient, Observation, MedicationRequest, DocumentReference mappings
2. **Basic Transformation Functions** - Guardian ↔ FHIR conversion functions
3. **Validation Framework** - FHIR resource validation and data quality scoring

### Phase 2: Integration (Weeks 3-4)
1. **FHIR API Client** - OAuth 2.0 integration and endpoint management
2. **Sync Framework** - Automated synchronization jobs
3. **HL7 Message Processing** - Basic HL7 parsing and FHIR conversion

### Phase 3: Advanced Features (Weeks 5-6)
1. **Real-time Sync** - Webhook-based updates
2. **Advanced Validation** - FHIR profile validation
3. **Analytics Integration** - FHIR resource analytics

---

## 7. Testing & Validation

### 7.1. FHIR Compliance Testing

```sql
-- FHIR compliance test cases
CREATE TABLE fhir_test_cases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    resource_type TEXT NOT NULL,
    test_category TEXT NOT NULL, -- 'validation', 'transformation', 'integration'
    test_name TEXT NOT NULL,
    
    -- Test data
    input_data JSONB NOT NULL,
    expected_output JSONB,
    test_assertions JSONB NOT NULL,
    
    -- Test status
    is_active BOOLEAN NOT NULL DEFAULT true,
    last_run TIMESTAMPTZ,
    last_result TEXT, -- 'pass', 'fail', 'error'
    last_error TEXT,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Performance benchmarks
CREATE VIEW fhir_performance_metrics AS
SELECT 
    endpoint_id,
    resource_type,
    operation,
    COUNT(*) as request_count,
    AVG(response_time_ms) as avg_response_time,
    PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY response_time_ms) as p95_response_time,
    COUNT(*) FILTER (WHERE response_status >= 400) as error_count,
    AVG(data_transferred_bytes) as avg_data_size
FROM fhir_api_audit
WHERE created_at >= NOW() - INTERVAL '24 hours'
GROUP BY endpoint_id, resource_type, operation;
```

---

## 8. Migration from Legacy Systems

### 8.1. Legacy Data Import Pipeline

```sql
-- Legacy system mappings
CREATE TABLE legacy_system_mappings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    legacy_system_name TEXT NOT NULL,
    legacy_resource_type TEXT NOT NULL,
    fhir_resource_type TEXT NOT NULL,
    
    -- Field mappings
    field_mappings JSONB NOT NULL,
    transformation_rules JSONB,
    
    -- Validation rules
    validation_rules JSONB,
    data_quality_threshold NUMERIC(3,2) DEFAULT 0.7,
    
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Import jobs tracking
CREATE TABLE legacy_import_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mapping_id UUID NOT NULL REFERENCES legacy_system_mappings(id),
    
    -- Job configuration
    source_connection JSONB NOT NULL,
    import_filter JSONB,
    dry_run BOOLEAN DEFAULT false,
    
    -- Status
    status TEXT NOT NULL DEFAULT 'pending',
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    
    -- Results
    records_processed INTEGER DEFAULT 0,
    records_imported INTEGER DEFAULT 0,
    records_failed INTEGER DEFAULT 0,
    import_report JSONB,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

## Dependencies

This module depends on:
- **[Core Schema](./core-schema.md)** - Patient data tables and relationships
- **[Security & Compliance](./security-compliance.md)** - Audit trails and data protection
- **[Performance & Monitoring](./performance-monitoring.md)** - Sync job monitoring

---

## Next Steps

1. **Review and approve** FHIR resource mappings
2. **Implement basic transformation functions** for Patient and Observation resources
3. **Set up first FHIR endpoint integration** with a test system
4. **Create validation test suite** for FHIR compliance
5. **Begin HL7 message processing** implementation

This healthcare interoperability foundation enables Guardian to seamlessly integrate with existing healthcare ecosystems while maintaining patient data ownership and control.