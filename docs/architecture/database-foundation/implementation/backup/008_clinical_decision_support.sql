-- Guardian v7.1 Provider Portal: Clinical Decision Support System
-- This migration creates provider-directed clinical alerts and action items
-- Status: Future (v7.1) - Deploy after patient-provider access control is operational

-- =============================================================================
-- 1. CLINICAL DECISION SUPPORT TABLES
-- =============================================================================

-- Provider action items for clinical decision support
CREATE TABLE provider_action_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES auth.users(id),
    
    -- Action details
    action_type TEXT NOT NULL CHECK (action_type IN (
        'medication_review', 'dose_optimization', 'polypharmacy_check',
        'screening_due', 'vaccination_due', 'follow_up_needed',
        'drug_interaction', 'allergy_alert', 'contraindication',
        'lab_abnormal', 'vital_sign_alert', 'care_gap'
    )),
    priority TEXT NOT NULL CHECK (priority IN ('routine', 'moderate', 'urgent', 'critical')),
    
    -- Clinical context
    related_entity_type TEXT, -- 'medication', 'condition', 'screening', 'lab_result'
    related_entity_id UUID,
    
    -- The action request
    question TEXT NOT NULL,
    context TEXT,
    ai_generated_rationale TEXT,
    supporting_data JSONB, -- Lab values, risk scores, calculations
    
    -- Provider assignment and response
    assigned_provider_id UUID REFERENCES provider_registry(id),
    provider_response TEXT,
    provider_action_taken TEXT,
    responded_at TIMESTAMPTZ,
    
    -- Billing/incentive codes
    applicable_billing_codes TEXT[], -- CPT codes for addressing this
    quality_measure_codes TEXT[], -- HEDIS, MIPS quality metrics
    estimated_reimbursement NUMERIC(10,2),
    
    -- Status and lifecycle
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'assigned', 'reviewed', 'actioned', 'deferred', 'not_applicable')),
    due_date TIMESTAMPTZ,
    resolved_at TIMESTAMPTZ,
    resolution_notes TEXT,
    
    -- Audit
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Clinical alert rules configuration
CREATE TABLE clinical_alert_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rule_name TEXT UNIQUE NOT NULL,
    rule_type TEXT NOT NULL CHECK (rule_type IN ('medication', 'screening', 'lab_value', 'vital_sign', 'care_gap')),
    
    -- Rule definition
    rule_description TEXT NOT NULL,
    trigger_condition JSONB NOT NULL, -- Conditions that trigger this rule
    alert_priority TEXT NOT NULL CHECK (alert_priority IN ('routine', 'moderate', 'urgent', 'critical')),
    
    -- Clinical context
    clinical_rationale TEXT,
    evidence_links TEXT[],
    specialty_specific TEXT[], -- Which specialties this applies to
    
    -- Action configuration
    suggested_action TEXT,
    billing_codes TEXT[],
    quality_measures TEXT[],
    
    -- Rule lifecycle
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    version INTEGER DEFAULT 1,
    effective_from TIMESTAMPTZ DEFAULT NOW(),
    effective_until TIMESTAMPTZ,
    
    -- Configuration
    auto_assign BOOLEAN DEFAULT FALSE, -- Auto-assign to patient's primary care provider
    requires_provider_verification BOOLEAN DEFAULT TRUE,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Provider clinical notes (for documentation and communication)
CREATE TABLE provider_clinical_notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES auth.users(id),
    provider_id UUID NOT NULL REFERENCES provider_registry(id),
    
    -- Note details
    note_type TEXT NOT NULL CHECK (note_type IN ('progress_note', 'consultation', 'assessment', 'plan', 'medication_review')),
    note_title TEXT,
    note_content TEXT NOT NULL,
    
    -- Clinical context
    related_action_item_id UUID REFERENCES provider_action_items(id),
    related_encounter_id UUID REFERENCES healthcare_encounters(id),
    clinical_context JSONB DEFAULT '{}',
    
    -- Visibility and sharing
    visibility TEXT NOT NULL DEFAULT 'patient_provider' CHECK (visibility IN ('private', 'patient_provider', 'care_team')),
    shared_with_patient BOOLEAN DEFAULT TRUE,
    patient_acknowledged BOOLEAN DEFAULT FALSE,
    acknowledged_at TIMESTAMPTZ,
    
    -- Audit and compliance
    is_confidential BOOLEAN DEFAULT FALSE,
    legal_hold BOOLEAN DEFAULT FALSE,
    retention_period_days INTEGER DEFAULT 2555, -- 7 years
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- 2. PERFORMANCE INDEXES
-- =============================================================================

-- Provider action items indexes
CREATE INDEX idx_provider_action_items_patient ON provider_action_items(patient_id) WHERE status IN ('pending', 'assigned');
CREATE INDEX idx_provider_action_items_provider ON provider_action_items(assigned_provider_id) WHERE status IN ('pending', 'assigned');
CREATE INDEX idx_provider_action_items_priority ON provider_action_items(priority, status) WHERE status IN ('pending', 'assigned');
CREATE INDEX idx_provider_action_items_due_date ON provider_action_items(due_date) WHERE due_date IS NOT NULL AND status IN ('pending', 'assigned');
CREATE INDEX idx_provider_action_items_type ON provider_action_items(action_type, status);
CREATE INDEX idx_provider_action_items_related_entity ON provider_action_items(related_entity_type, related_entity_id);

-- Clinical alert rules indexes
CREATE INDEX idx_clinical_alert_rules_type ON clinical_alert_rules(rule_type) WHERE is_active = TRUE;
CREATE INDEX idx_clinical_alert_rules_active ON clinical_alert_rules(is_active, effective_from, effective_until);
CREATE INDEX idx_clinical_alert_rules_specialty ON clinical_alert_rules USING GIN(specialty_specific) WHERE is_active = TRUE;

-- Provider clinical notes indexes
CREATE INDEX idx_provider_clinical_notes_patient ON provider_clinical_notes(patient_id, created_at DESC);
CREATE INDEX idx_provider_clinical_notes_provider ON provider_clinical_notes(provider_id, created_at DESC);
CREATE INDEX idx_provider_clinical_notes_type ON provider_clinical_notes(note_type, created_at DESC);
CREATE INDEX idx_provider_clinical_notes_shared ON provider_clinical_notes(shared_with_patient, patient_acknowledged);

-- =============================================================================
-- 3. CLINICAL ALERT GENERATION FUNCTIONS
-- =============================================================================

-- Generate medication review alerts (polypharmacy check)
CREATE OR REPLACE FUNCTION generate_medication_review_alerts()
RETURNS INTEGER AS $$
DECLARE
    patient_record RECORD;
    alerts_created INTEGER := 0;
BEGIN
    -- Find patients with multiple medications (polypharmacy risk)
    FOR patient_record IN 
        SELECT patient_id, COUNT(*) as med_count
        FROM patient_medications
        WHERE archived IS NOT TRUE
        AND status = 'active'
        GROUP BY patient_id
        HAVING COUNT(*) >= 5  -- 5+ medications = polypharmacy
    LOOP
        -- Check if alert already exists
        IF NOT EXISTS (
            SELECT 1 FROM provider_action_items
            WHERE patient_id = patient_record.patient_id
            AND action_type = 'polypharmacy_check'
            AND status IN ('pending', 'assigned')
            AND created_at > NOW() - INTERVAL '30 days'
        ) THEN
            -- Create polypharmacy review alert
            INSERT INTO provider_action_items (
                patient_id, action_type, priority, question, context,
                ai_generated_rationale, supporting_data,
                applicable_billing_codes, quality_measure_codes, due_date
            ) VALUES (
                patient_record.patient_id,
                'polypharmacy_check',
                'moderate',
                format('Patient has %s active medications. Review for potential interactions and optimization opportunities.', patient_record.med_count),
                'Polypharmacy increases risk of adverse drug events and medication interactions.',
                'AI detected potential for medication optimization based on current medication count and known interaction patterns.',
                jsonb_build_object(
                    'medication_count', patient_record.med_count,
                    'risk_level', CASE WHEN patient_record.med_count >= 10 THEN 'high' ELSE 'moderate' END
                ),
                ARRAY['99213', '99214', '99215'], -- Office visit codes
                ARRAY['HEDIS-MPM'], -- HEDIS Medication Management for People with Asthma
                NOW() + INTERVAL '30 days'
            );
            
            alerts_created := alerts_created + 1;
        END IF;
    END LOOP;
    
    RETURN alerts_created;
END;
$$ LANGUAGE plpgsql;

-- Generate screening due alerts based on age and guidelines
CREATE OR REPLACE FUNCTION generate_screening_alerts()
RETURNS INTEGER AS $$
DECLARE
    patient_record RECORD;
    alerts_created INTEGER := 0;
    patient_age INTEGER;
BEGIN
    -- Find patients due for age-based screenings
    FOR patient_record IN 
        SELECT u.id as patient_id, 
               EXTRACT(YEAR FROM AGE(NOW(), epd.date_of_birth_encrypted::DATE)) as age
        FROM auth.users u
        JOIN encrypted_patient_data epd ON u.id = epd.patient_id
        WHERE epd.archived IS NOT TRUE
    LOOP
        patient_age := patient_record.age;
        
        -- Mammography screening (women 50-74, every 2 years)
        IF patient_age >= 50 AND patient_age <= 74 THEN
            IF NOT EXISTS (
                SELECT 1 FROM provider_action_items
                WHERE patient_id = patient_record.patient_id
                AND action_type = 'screening_due'
                AND question LIKE '%mammography%'
                AND status IN ('pending', 'assigned')
                AND created_at > NOW() - INTERVAL '6 months'
            ) THEN
                INSERT INTO provider_action_items (
                    patient_id, action_type, priority, question, context,
                    ai_generated_rationale, supporting_data,
                    applicable_billing_codes, quality_measure_codes, due_date
                ) VALUES (
                    patient_record.patient_id,
                    'screening_due',
                    'routine',
                    format('Patient is due for mammography screening (age %s).', patient_age),
                    'USPSTF recommends biennial mammography for women aged 50-74.',
                    'AI analysis of patient age and screening history indicates mammography screening is due based on current guidelines.',
                    jsonb_build_object(
                        'patient_age', patient_age, 
                        'screening_type', 'mammography',
                        'guideline', 'USPSTF 2016'
                    ),
                    ARRAY['77067'], -- Mammography CPT code
                    ARRAY['HEDIS-BCS'], -- HEDIS Breast Cancer Screening
                    NOW() + INTERVAL '60 days'
                );
                
                alerts_created := alerts_created + 1;
            END IF;
        END IF;
        
        -- Colonoscopy screening (50-75, every 10 years)
        IF patient_age >= 50 AND patient_age <= 75 THEN
            IF NOT EXISTS (
                SELECT 1 FROM provider_action_items
                WHERE patient_id = patient_record.patient_id
                AND action_type = 'screening_due'
                AND question LIKE '%colorectal%'
                AND status IN ('pending', 'assigned')
                AND created_at > NOW() - INTERVAL '1 year'
            ) THEN
                INSERT INTO provider_action_items (
                    patient_id, action_type, priority, question, context,
                    ai_generated_rationale, supporting_data,
                    applicable_billing_codes, quality_measure_codes, due_date
                ) VALUES (
                    patient_record.patient_id,
                    'screening_due',
                    'routine',
                    format('Patient is due for colorectal cancer screening (age %s).', patient_age),
                    'USPSTF recommends colorectal cancer screening for adults aged 50-75.',
                    'AI analysis indicates patient is in age range for colorectal cancer screening.',
                    jsonb_build_object(
                        'patient_age', patient_age, 
                        'screening_type', 'colorectal',
                        'guideline', 'USPSTF 2021'
                    ),
                    ARRAY['45380', '45385'], -- Colonoscopy CPT codes
                    ARRAY['HEDIS-COL'], -- HEDIS Colorectal Cancer Screening
                    NOW() + INTERVAL '90 days'
                );
                
                alerts_created := alerts_created + 1;
            END IF;
        END IF;
    END LOOP;
    
    RETURN alerts_created;
END;
$$ LANGUAGE plpgsql;

-- Generate lab value alerts for abnormal results
CREATE OR REPLACE FUNCTION generate_lab_alerts()
RETURNS INTEGER AS $$
DECLARE
    lab_record RECORD;
    alerts_created INTEGER := 0;
BEGIN
    -- Find abnormal lab results that need follow-up
    FOR lab_record IN 
        SELECT patient_id, test_name, result_numeric, abnormal_flag, test_date, id
        FROM patient_lab_results
        WHERE abnormal_flag IN ('high', 'low', 'critical_high', 'critical_low')
        AND archived IS NOT TRUE
        AND test_date > NOW() - INTERVAL '30 days'
    LOOP
        -- Check if alert already exists for this lab result
        IF NOT EXISTS (
            SELECT 1 FROM provider_action_items
            WHERE patient_id = lab_record.patient_id
            AND action_type = 'lab_abnormal'
            AND related_entity_id = lab_record.id
            AND status IN ('pending', 'assigned')
        ) THEN
            INSERT INTO provider_action_items (
                patient_id, action_type, priority, question, context,
                ai_generated_rationale, supporting_data,
                related_entity_type, related_entity_id,
                applicable_billing_codes, due_date
            ) VALUES (
                lab_record.patient_id,
                'lab_abnormal',
                CASE 
                    WHEN lab_record.abnormal_flag LIKE 'critical%' THEN 'critical'
                    WHEN lab_record.abnormal_flag IN ('high', 'low') THEN 'moderate'
                    ELSE 'routine'
                END,
                format('Abnormal %s result (%s) requires follow-up.', lab_record.test_name, lab_record.abnormal_flag),
                format('Lab result from %s shows %s value that may require clinical intervention.', lab_record.test_date::DATE, lab_record.abnormal_flag),
                'AI detected abnormal lab value that may require provider review and potential intervention.',
                jsonb_build_object(
                    'test_name', lab_record.test_name,
                    'result_value', lab_record.result_numeric,
                    'abnormal_flag', lab_record.abnormal_flag,
                    'test_date', lab_record.test_date
                ),
                'lab_result',
                lab_record.id,
                ARRAY['99213'], -- Office visit for follow-up
                CASE 
                    WHEN lab_record.abnormal_flag LIKE 'critical%' THEN NOW() + INTERVAL '7 days'
                    ELSE NOW() + INTERVAL '14 days'
                END
            );
            
            alerts_created := alerts_created + 1;
        END IF;
    END LOOP;
    
    RETURN alerts_created;
END;
$$ LANGUAGE plpgsql;

-- Master function to generate all clinical alerts
CREATE OR REPLACE FUNCTION generate_all_clinical_alerts()
RETURNS JSONB AS $$
DECLARE
    medication_alerts INTEGER;
    screening_alerts INTEGER;
    lab_alerts INTEGER;
    total_alerts INTEGER;
BEGIN
    -- Generate medication alerts
    SELECT generate_medication_review_alerts() INTO medication_alerts;
    
    -- Generate screening alerts
    SELECT generate_screening_alerts() INTO screening_alerts;
    
    -- Generate lab alerts
    SELECT generate_lab_alerts() INTO lab_alerts;
    
    total_alerts := medication_alerts + screening_alerts + lab_alerts;
    
    -- Log the alert generation
    INSERT INTO audit_log (
        table_name, record_id, operation, reason, clinical_context
    ) VALUES (
        'provider_action_items', null, 'INSERT',
        'Automated clinical alert generation',
        format('Generated %s total alerts: %s medication, %s screening, %s lab', 
               total_alerts, medication_alerts, screening_alerts, lab_alerts)
    );
    
    RETURN jsonb_build_object(
        'total_alerts_generated', total_alerts,
        'medication_alerts', medication_alerts,
        'screening_alerts', screening_alerts,
        'lab_alerts', lab_alerts,
        'generated_at', NOW()
    );
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- 4. PROVIDER RESPONSE AND ACTION FUNCTIONS
-- =============================================================================

-- Assign action item to provider
CREATE OR REPLACE FUNCTION assign_action_item_to_provider(
    p_action_item_id UUID,
    p_provider_id UUID,
    p_assignment_reason TEXT DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
    action_item RECORD;
BEGIN
    -- Get action item details
    SELECT * INTO action_item
    FROM provider_action_items
    WHERE id = p_action_item_id;
    
    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'reason', 'action_item_not_found'
        );
    END IF;
    
    -- Verify provider has access to this patient
    IF NOT EXISTS (
        SELECT 1 FROM patient_provider_access
        WHERE patient_id = action_item.patient_id
        AND provider_id = p_provider_id
        AND status = 'active'
    ) THEN
        RETURN jsonb_build_object(
            'success', false,
            'reason', 'provider_no_patient_access'
        );
    END IF;
    
    -- Assign the action item
    UPDATE provider_action_items
    SET assigned_provider_id = p_provider_id,
        status = 'assigned',
        updated_at = NOW()
    WHERE id = p_action_item_id;
    
    -- Log the assignment
    INSERT INTO audit_log (
        table_name, record_id, operation, changed_by, reason, clinical_context
    ) VALUES (
        'provider_action_items', p_action_item_id, 'UPDATE', p_provider_id,
        'Action item assigned to provider', p_assignment_reason
    );
    
    RETURN jsonb_build_object(
        'success', true,
        'assigned_at', NOW(),
        'provider_id', p_provider_id
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Provider responds to action item
CREATE OR REPLACE FUNCTION respond_to_action_item(
    p_action_item_id UUID,
    p_provider_id UUID,
    p_response TEXT,
    p_action_taken TEXT,
    p_status TEXT DEFAULT 'reviewed'
) RETURNS JSONB AS $$
BEGIN
    -- Verify provider is assigned to this action item
    IF NOT EXISTS (
        SELECT 1 FROM provider_action_items
        WHERE id = p_action_item_id
        AND assigned_provider_id = p_provider_id
    ) THEN
        RETURN jsonb_build_object(
            'success', false,
            'reason', 'provider_not_assigned'
        );
    END IF;
    
    -- Update with provider response
    UPDATE provider_action_items
    SET provider_response = p_response,
        provider_action_taken = p_action_taken,
        status = p_status,
        responded_at = NOW(),
        resolved_at = CASE WHEN p_status IN ('actioned', 'not_applicable') THEN NOW() ELSE NULL END,
        updated_at = NOW()
    WHERE id = p_action_item_id;
    
    -- Log the response
    INSERT INTO audit_log (
        table_name, record_id, operation, changed_by, reason, clinical_context
    ) VALUES (
        'provider_action_items', p_action_item_id, 'UPDATE', p_provider_id,
        'Provider responded to action item', p_response
    );
    
    RETURN jsonb_build_object(
        'success', true,
        'responded_at', NOW(),
        'status', p_status
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- 5. RLS POLICIES FOR CLINICAL DECISION SUPPORT
-- =============================================================================

-- Enable RLS on clinical decision support tables
ALTER TABLE provider_action_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinical_alert_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_clinical_notes ENABLE ROW LEVEL SECURITY;

-- Providers can see action items assigned to them or for patients they have access to
CREATE POLICY provider_action_items_provider_access ON provider_action_items
    FOR SELECT USING (
        (auth.jwt() ->> 'role') = 'healthcare_provider'
        AND (
            assigned_provider_id = auth.uid()
            OR EXISTS (
                SELECT 1 FROM patient_provider_access ppa
                WHERE ppa.patient_id = provider_action_items.patient_id
                AND ppa.provider_id = auth.uid()
                AND ppa.status = 'active'
            )
        )
    );

-- Patients can see their own action items
CREATE POLICY provider_action_items_patient_access ON provider_action_items
    FOR SELECT USING (auth.uid() = patient_id);

-- Clinical alert rules are readable by healthcare providers
CREATE POLICY clinical_alert_rules_provider_read ON clinical_alert_rules
    FOR SELECT USING (
        (auth.jwt() ->> 'role') = 'healthcare_provider'
        AND is_active = TRUE
    );

-- Provider clinical notes access control
CREATE POLICY provider_clinical_notes_provider_access ON provider_clinical_notes
    FOR ALL USING (
        (auth.jwt() ->> 'role') = 'healthcare_provider'
        AND provider_id = auth.uid()
    );

-- Patients can see clinical notes shared with them
CREATE POLICY provider_clinical_notes_patient_access ON provider_clinical_notes
    FOR SELECT USING (
        auth.uid() = patient_id
        AND shared_with_patient = TRUE
    );

-- =============================================================================
-- 6. AUTOMATED CLINICAL ALERT SCHEDULING
-- =============================================================================

-- Create cron job configuration for clinical alerts
-- This would be configured in supabase/config.toml:
-- [edge-runtime.cron]
-- generate_clinical_alerts = "0 6 * * *"  # Daily at 6 AM

-- Function to be called by cron job
CREATE OR REPLACE FUNCTION scheduled_clinical_alert_generation()
RETURNS JSONB AS $$
DECLARE
    alert_results JSONB;
BEGIN
    -- Generate all clinical alerts
    SELECT generate_all_clinical_alerts() INTO alert_results;
    
    -- Auto-assign urgent/critical alerts to primary care providers
    -- (This would be enhanced with provider assignment logic)
    
    RETURN alert_results;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- 7. FEATURE FLAGS AND INITIAL DATA
-- =============================================================================

-- Update feature flags for clinical decision support
INSERT INTO feature_flags (feature_name, enabled, configuration) VALUES
('clinical_decision_support', false, '{"medication_reviews": true, "screening_alerts": true, "lab_alerts": true}')
ON CONFLICT (feature_name) DO UPDATE SET
    configuration = EXCLUDED.configuration,
    updated_at = NOW();

-- Insert basic clinical alert rules
INSERT INTO clinical_alert_rules (rule_name, rule_type, rule_description, trigger_condition, alert_priority, clinical_rationale, suggested_action, billing_codes, quality_measures) VALUES
('polypharmacy_check', 'medication', 'Patient has 5 or more active medications', 
 '{"medication_count": {">=": 5}}', 'moderate',
 'Polypharmacy increases risk of adverse drug events and drug interactions.',
 'Review medications for interactions, duplications, and optimization opportunities.',
 '["99213", "99214", "99215"]', '["HEDIS-MPM"]'),

('mammography_screening_due', 'screening', 'Women aged 50-74 due for mammography screening',
 '{"age": {">=": 50, "<=": 74}, "gender": "female", "last_mammography": {"months_ago": {">=": 24}}}', 'routine',
 'USPSTF recommends biennial mammography screening for women aged 50-74.',
 'Order mammography screening for breast cancer detection.',
 '["77067"]', '["HEDIS-BCS"]'),

('colonoscopy_screening_due', 'screening', 'Adults aged 50-75 due for colorectal cancer screening',
 '{"age": {">=": 50, "<=": 75}, "last_colonoscopy": {"years_ago": {">=": 10}}}', 'routine',
 'USPSTF recommends colorectal cancer screening for adults aged 50-75.',
 'Order appropriate colorectal cancer screening (colonoscopy, FIT, etc.).',
 '["45380", "45385"]', '["HEDIS-COL"]');

-- =============================================================================
-- 8. COMMENTS AND DOCUMENTATION
-- =============================================================================

COMMENT ON TABLE provider_action_items IS 'Clinical decision support action items for healthcare providers';
COMMENT ON TABLE clinical_alert_rules IS 'Configuration for automated clinical alert generation';
COMMENT ON TABLE provider_clinical_notes IS 'Provider clinical notes and documentation';

COMMENT ON COLUMN provider_action_items.supporting_data IS 'JSONB containing lab values, risk scores, and other supporting clinical data';
COMMENT ON COLUMN provider_action_items.applicable_billing_codes IS 'CPT codes that can be billed when addressing this action item';
COMMENT ON COLUMN provider_action_items.quality_measure_codes IS 'HEDIS/MIPS quality measures this action supports';

COMMENT ON FUNCTION generate_all_clinical_alerts() IS 'Master function to generate all types of clinical alerts (scheduled daily)';
COMMENT ON FUNCTION assign_action_item_to_provider(UUID, UUID, TEXT) IS 'Assign clinical action item to specific provider with access validation';
COMMENT ON FUNCTION respond_to_action_item(UUID, UUID, TEXT, TEXT, TEXT) IS 'Provider response to clinical action item with audit logging';