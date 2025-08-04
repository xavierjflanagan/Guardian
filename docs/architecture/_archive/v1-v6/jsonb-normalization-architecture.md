# JSONB Normalization Phase: Senior Engineering Architecture

**Status:** Active  
**Date:** 2025-07-22  
**Author:** Claude (Anthropic)  
**Phase:** Stage 2 - Data Normalization  

## Executive Summary

This document outlines the comprehensive architecture for Guardian's JSONB normalization phase, transforming the current document-centric JSONB storage into a patient-centric relational model. This represents Guardian's evolution from Stage 1 (document processing) to Stage 2 (intelligent health data aggregation).

## 1. Architectural Overview

The normalization phase represents Guardian's evolution from **Stage 1** (document-centric JSONB) to **Stage 2** (patient-centric relational model):

```
Stage 1: Documents → JSONB medical_data
Stage 2: JSONB → Normalized Tables → Patient Dashboard
```

### Current State Analysis

Based on analysis of the existing Guardian architecture:

**Current Database Schema:**
- `documents` table with `medical_data JSONB` field
- Document processing pipeline: `uploaded → processing → completed/failed`
- AI extraction using Google Cloud Vision OCR + GPT-4o Mini Vision
- Confidence scoring with 80% minimum threshold for medical accuracy

**Current JSONB Structure:**
```typescript
interface MedicalData {
  documentType: string; // "lab_results", "prescription", "medical_record", "insurance_card"
  patientInfo: {
    name: string | null;
    dateOfBirth: string | null;
    mrn: string | null;
    insuranceId: string | null;
  };
  medicalData: {
    medications?: Array<{name: string, dosage: string, frequency: string}>;
    allergies?: Array<{allergen: string, severity: string}>;
    labResults?: Array<{test: string, value: string, unit: string, reference: string}>;
    conditions?: Array<{condition: string, status: string}>;
    vitals?: {bloodPressure?: string, heartRate?: string, temperature?: string};
    procedures?: Array<{procedure: string, date: string}>;
  };
  dates: {
    documentDate: string | null;
    serviceDate: string | null;
  };
  provider: {
    name: string | null;
    facility: string | null;
    phone: string | null;
  };
  confidence: {
    overall: number;
    ocrMatch: number;
    extraction: number;
  };
  notes: string;
}
```

## 2. Normalized Database Schema Design

### Core Normalized Tables

```sql
-- Patient Medications (Active/Historical)
CREATE TABLE patient_medications (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id uuid REFERENCES auth.users ON DELETE CASCADE,
    
    -- Medication Details
    medication_name text NOT NULL,
    dosage text,
    frequency text,
    route text, -- oral, injection, topical, etc.
    prescriber text,
    
    -- Status & Timeline
    status text DEFAULT 'active', -- active, discontinued, completed
    start_date date,
    end_date date,
    
    -- Source Tracking & Quality
    source_document_ids uuid[] NOT NULL, -- Array of document IDs
    confidence_score decimal(3,2), -- 0.00 to 1.00
    last_confirmed_at timestamptz,
    
    -- Deduplication
    normalized_name text, -- Standardized drug name for matching
    duplicate_group_id uuid, -- Groups similar medications
    
    -- Metadata
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- Patient Allergies (Critical Safety Data)
CREATE TABLE patient_allergies (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id uuid REFERENCES auth.users ON DELETE CASCADE,
    
    -- Allergy Details
    allergen text NOT NULL,
    allergy_type text, -- drug, food, environmental, etc.
    severity text, -- mild, moderate, severe, life-threatening
    reaction_description text,
    
    -- Status & Timeline
    status text DEFAULT 'active', -- active, resolved, unconfirmed
    onset_date date,
    
    -- Source Tracking & Quality
    source_document_ids uuid[] NOT NULL,
    confidence_score decimal(3,2),
    last_confirmed_at timestamptz,
    
    -- Deduplication
    normalized_allergen text,
    duplicate_group_id uuid,
    
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- Patient Conditions/Diagnoses
CREATE TABLE patient_conditions (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id uuid REFERENCES auth.users ON DELETE CASCADE,
    
    -- Condition Details
    condition_name text NOT NULL,
    icd10_code text, -- Standard medical coding
    condition_category text, -- chronic, acute, resolved, etc.
    description text,
    
    -- Status & Timeline
    status text DEFAULT 'active', -- active, resolved, in_remission, etc.
    diagnosis_date date,
    resolution_date date,
    
    -- Source Tracking & Quality
    source_document_ids uuid[] NOT NULL,
    confidence_score decimal(3,2),
    last_confirmed_at timestamptz,
    
    -- Deduplication
    normalized_condition text,
    duplicate_group_id uuid,
    
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- Patient Lab Results (Trending Over Time)
CREATE TABLE patient_lab_results (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id uuid REFERENCES auth.users ON DELETE CASCADE,
    
    -- Lab Details
    test_name text NOT NULL,
    test_code text, -- Standard lab codes (LOINC, CPT)
    result_value text NOT NULL,
    unit text,
    reference_range text,
    
    -- Clinical Context
    result_status text, -- normal, abnormal, critical, etc.
    test_date date NOT NULL,
    ordering_provider text,
    lab_facility text,
    
    -- Source Tracking & Quality
    source_document_id uuid NOT NULL REFERENCES documents(id),
    confidence_score decimal(3,2),
    
    -- Trending & Analysis
    normalized_test_name text, -- For grouping same test over time
    numeric_value decimal(10,3), -- Parsed numeric value for trending
    
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- Patient Vital Signs
CREATE TABLE patient_vitals (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id uuid REFERENCES auth.users ON DELETE CASCADE,
    
    -- Vital Signs
    measurement_date date NOT NULL,
    blood_pressure_systolic integer,
    blood_pressure_diastolic integer,
    heart_rate integer, -- BPM
    temperature decimal(4,1), -- Degrees
    weight decimal(5,1), -- Pounds or Kg
    height decimal(5,1), -- Inches or CM
    bmi decimal(4,1),
    
    -- Units & Context
    temperature_unit text DEFAULT 'F', -- F or C
    weight_unit text DEFAULT 'lbs', -- lbs or kg
    height_unit text DEFAULT 'in', -- in or cm
    measurement_context text, -- office visit, home, hospital, etc.
    
    -- Source Tracking
    source_document_id uuid NOT NULL REFERENCES documents(id),
    confidence_score decimal(3,2),
    
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- Patient Healthcare Providers
CREATE TABLE patient_providers (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id uuid REFERENCES auth.users ON DELETE CASCADE,
    
    -- Provider Details
    provider_name text NOT NULL,
    specialty text,
    facility_name text,
    phone text,
    address text,
    
    -- Relationship
    provider_type text, -- primary_care, specialist, emergency, etc.
    relationship_status text DEFAULT 'active', -- active, former, referred
    first_seen_date date,
    last_seen_date date,
    
    -- Source Tracking & Quality
    source_document_ids uuid[] NOT NULL,
    confidence_score decimal(3,2),
    
    -- Deduplication
    normalized_name text,
    duplicate_group_id uuid,
    
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);
```

### Row Level Security (RLS) Policies

```sql
-- Enable RLS on all normalized tables
ALTER TABLE patient_medications ENABLE ROW LEVEL SECURITY;
ALTER TABLE patient_allergies ENABLE ROW LEVEL SECURITY;
ALTER TABLE patient_conditions ENABLE ROW LEVEL SECURITY;
ALTER TABLE patient_lab_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE patient_vitals ENABLE ROW LEVEL SECURITY;
ALTER TABLE patient_providers ENABLE ROW LEVEL SECURITY;

-- User isolation policies
CREATE POLICY "Users can only access their own medications" ON patient_medications
    FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can only access their own allergies" ON patient_allergies
    FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can only access their own conditions" ON patient_conditions
    FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can only access their own lab results" ON patient_lab_results
    FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can only access their own vitals" ON patient_vitals
    FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can only access their own providers" ON patient_providers
    FOR ALL USING (auth.uid() = user_id);
```

## 3. Normalization Service Architecture

### Event-Driven Normalization Service

```typescript
// supabase/functions/document-normalizer/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

interface NormalizationTrigger {
  document_id: string;
  user_id: string;
  medical_data: MedicalData;
  trigger_type: 'insert' | 'update' | 'manual';
}

serve(async (req) => {
  const { document_id, user_id, medical_data, trigger_type }: NormalizationTrigger = await req.json();
  
  try {
    // Initialize normalization pipeline
    const normalizer = new MedicalDataNormalizer(user_id, document_id);
    
    // Process each medical data category
    await Promise.all([
      normalizer.processMedications(medical_data.medicalData.medications),
      normalizer.processAllergies(medical_data.medicalData.allergies),
      normalizer.processConditions(medical_data.medicalData.conditions),
      normalizer.processLabResults(medical_data.medicalData.labResults),
      normalizer.processVitals(medical_data.medicalData.vitals),
      normalizer.processProviders(medical_data.provider)
    ]);
    
    // Update document processing status
    await normalizer.markNormalized(document_id);
    
    return new Response(JSON.stringify({ 
      success: true, 
      normalized_records: normalizer.getProcessedCounts() 
    }));
    
  } catch (error) {
    return new Response(JSON.stringify({ 
      success: false, 
      error: error.message 
    }), { status: 500 });
  }
});

class MedicalDataNormalizer {
  constructor(private userId: string, private documentId: string) {}
  
  async processMedications(medications: Medication[]) {
    for (const medication of medications || []) {
      // Step 1: Normalize medication name for deduplication
      const normalizedName = this.normalizeMedicationName(medication.name);
      
      // Step 2: Check for existing medication
      const existingMed = await this.findExistingMedication(normalizedName);
      
      if (existingMed) {
        // Update existing medication with new source document
        await this.updateMedicationSource(existingMed.id, this.documentId);
      } else {
        // Create new medication record
        await this.createMedication({
          user_id: this.userId,
          medication_name: medication.name,
          dosage: medication.dosage,
          frequency: medication.frequency,
          normalized_name: normalizedName,
          source_document_ids: [this.documentId],
          confidence_score: this.extractConfidenceScore(medication),
          status: 'active'
        });
      }
    }
  }
  
  private normalizeMedicationName(name: string): string {
    // Implement drug name standardization logic
    return name.toLowerCase()
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/\b(tablet|capsule|mg|mcg)\b/gi, '');
  }
  
  private async findExistingMedication(normalizedName: string): Promise<ExistingMedication | null> {
    const { data } = await this.supabase
      .from('patient_medications')
      .select('*')
      .eq('user_id', this.userId)
      .eq('normalized_name', normalizedName)
      .eq('status', 'active')
      .single();
    
    return data;
  }
}
```

### Database Triggers for Real-Time Normalization

```sql
-- Trigger normalization when document processing completes
CREATE OR REPLACE FUNCTION trigger_document_normalization()
RETURNS TRIGGER AS $$
BEGIN
  -- Only trigger normalization when status changes to 'completed'
  -- and medical_data is not null
  IF NEW.status = 'completed' 
     AND NEW.medical_data IS NOT NULL 
     AND (OLD.status IS NULL OR OLD.status != 'completed') THEN
    
    -- Call normalization edge function asynchronously
    PERFORM net.http_post(
      url := 'https://your-project.supabase.co/functions/v1/document-normalizer',
      headers := '{"Authorization": "Bearer ' || current_setting('app.jwt_token') || '"}',
      body := json_build_object(
        'document_id', NEW.id,
        'user_id', NEW.user_id,
        'medical_data', NEW.medical_data,
        'trigger_type', 'insert'
      )::text
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER documents_normalization_trigger
  AFTER INSERT OR UPDATE ON documents
  FOR EACH ROW
  EXECUTE FUNCTION trigger_document_normalization();
```

## 4. Deduplication & Conflict Resolution Strategy

### Intelligent Deduplication Algorithm

```typescript
class MedicalDataDeduplicator {
  
  // Medication deduplication with fuzzy matching
  async findDuplicateMedications(newMed: Medication): Promise<ExistingMedication[]> {
    const candidates = await this.supabase
      .from('patient_medications')
      .select('*')
      .eq('user_id', this.userId)
      .eq('status', 'active');
    
    return candidates.data?.filter(existing => {
      // Exact normalized name match
      if (existing.normalized_name === this.normalizeMedicationName(newMed.name)) {
        return true;
      }
      
      // Fuzzy string matching (Levenshtein distance)
      const similarity = this.calculateSimilarity(
        existing.medication_name.toLowerCase(),
        newMed.name.toLowerCase()
      );
      
      return similarity > 0.85; // 85% similarity threshold
    }) || [];
  }
  
  // Conflict resolution matrix
  async resolveMedicationConflict(existing: ExistingMedication, incoming: Medication): Promise<ResolutionAction> {
    const rules = [
      // Rule 1: Higher confidence wins
      {
        condition: () => incoming.confidence > existing.confidence_score + 0.1,
        action: 'replace',
        reason: 'Higher confidence source'
      },
      
      // Rule 2: More recent document wins (if confidence similar)
      {
        condition: () => Math.abs(incoming.confidence - existing.confidence_score) < 0.1 
                        && incoming.documentDate > existing.last_confirmed_at,
        action: 'replace',
        reason: 'More recent information'
      },
      
      // Rule 3: Provider document beats patient document
      {
        condition: () => incoming.documentType === 'prescription' 
                        && existing.source_type === 'patient_reported',
        action: 'replace',
        reason: 'Provider source authority'
      },
      
      // Rule 4: Merge compatible information
      {
        condition: () => this.isCompatibleUpdate(existing, incoming),
        action: 'merge',
        reason: 'Compatible information merge'
      },
      
      // Default: Flag for manual review
      {
        condition: () => true,
        action: 'flag_review',
        reason: 'Requires manual verification'
      }
    ];
    
    return rules.find(rule => rule.condition())?.action || 'flag_review';
  }
  
  private calculateSimilarity(str1: string, str2: string): number {
    // Levenshtein distance implementation
    const matrix = Array(str2.length + 1).fill(null).map(() => 
      Array(str1.length + 1).fill(null)
    );
    
    for (let i = 0; i <= str1.length; i += 1) {
      matrix[0][i] = i;
    }
    
    for (let j = 0; j <= str2.length; j += 1) {
      matrix[j][0] = j;
    }
    
    for (let j = 1; j <= str2.length; j += 1) {
      for (let i = 1; i <= str1.length; i += 1) {
        const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
        matrix[j][i] = Math.min(
          matrix[j][i - 1] + 1,
          matrix[j - 1][i] + 1,
          matrix[j - 1][i - 1] + indicator
        );
      }
    }
    
    const distance = matrix[str2.length][str1.length];
    const maxLength = Math.max(str1.length, str2.length);
    return 1 - (distance / maxLength);
  }
}
```

### Conflict Resolution UI Component

```tsx
// For the Main Dashboard - show confidence-based styling
const MedicationCard: React.FC<{medication: NormalizedMedication}> = ({medication}) => {
  const confidenceColor = medication.confidence_score >= 0.95 ? 'green' : 
                         medication.confidence_score >= 0.80 ? 'yellow' : 'red';
  
  return (
    <div className={`border-l-4 border-${confidenceColor}-500 bg-white p-4 shadow`}>
      <div className="flex justify-between items-start">
        <div>
          <h3 className="font-semibold">{medication.medication_name}</h3>
          <p className="text-gray-600">{medication.dosage} • {medication.frequency}</p>
          
          {/* Source traceability */}
          <button 
            onClick={() => showSourceDocuments(medication.source_document_ids)}
            className="text-blue-600 text-sm hover:underline"
          >
            📄 {medication.source_document_ids.length} source document(s)
          </button>
        </div>
        
        {/* Confidence indicator */}
        <div className={`px-2 py-1 rounded text-xs bg-${confidenceColor}-100 text-${confidenceColor}-800`}>
          {Math.round(medication.confidence_score * 100)}% confidence
        </div>
      </div>
      
      {/* Manual verification needed */}
      {medication.requires_review && (
        <div className="mt-2 p-2 bg-yellow-50 border border-yellow-200 rounded">
          <p className="text-sm text-yellow-800">⚠️ Requires manual verification</p>
          <button className="text-yellow-600 text-xs hover:underline">
            Review conflicting information
          </button>
        </div>
      )}
    </div>
  );
};
```

## 5. Performance Optimization Strategy

### Database Performance Optimization

```sql
-- Strategic Indexing for Main Dashboard Performance
CREATE INDEX CONCURRENTLY patient_medications_active_idx ON patient_medications(user_id, status) WHERE status = 'active';
CREATE INDEX CONCURRENTLY patient_allergies_active_idx ON patient_allergies(user_id, status) WHERE status = 'active';
CREATE INDEX CONCURRENTLY patient_conditions_active_idx ON patient_conditions(user_id, status) WHERE status = 'active';
CREATE INDEX CONCURRENTLY patient_lab_results_recent_idx ON patient_lab_results(user_id, test_date DESC);
CREATE INDEX CONCURRENTLY patient_vitals_recent_idx ON patient_vitals(user_id, measurement_date DESC);

-- Composite indexes for deduplication queries
CREATE INDEX CONCURRENTLY medications_dedup_idx ON patient_medications(user_id, normalized_name, status);
CREATE INDEX CONCURRENTLY allergies_dedup_idx ON patient_allergies(user_id, normalized_allergen, status);
CREATE INDEX CONCURRENTLY conditions_dedup_idx ON patient_conditions(user_id, normalized_condition, status);

-- Full-text search indexes
CREATE INDEX CONCURRENTLY medications_search_idx ON patient_medications USING gin(to_tsvector('english', medication_name));
CREATE INDEX CONCURRENTLY conditions_search_idx ON patient_conditions USING gin(to_tsvector('english', condition_name));
```

### Materialized Views for Dashboard Performance

```sql
-- Patient Health Summary (Main Dashboard Data)
CREATE MATERIALIZED VIEW patient_health_summary AS
SELECT 
    user_id,
    
    -- Medication Summary
    (SELECT COUNT(*) FROM patient_medications pm WHERE pm.user_id = p.user_id AND pm.status = 'active') as active_medications,
    (SELECT COUNT(*) FROM patient_allergies pa WHERE pa.user_id = p.user_id AND pa.status = 'active') as active_allergies,
    (SELECT COUNT(*) FROM patient_conditions pc WHERE pc.user_id = p.user_id AND pc.status = 'active') as active_conditions,
    
    -- Recent Data
    (SELECT MAX(test_date) FROM patient_lab_results plr WHERE plr.user_id = p.user_id) as last_lab_date,
    (SELECT MAX(measurement_date) FROM patient_vitals pv WHERE pv.user_id = p.user_id) as last_vitals_date,
    
    -- Data Quality Indicators
    (SELECT AVG(confidence_score) FROM patient_medications pm WHERE pm.user_id = p.user_id AND pm.status = 'active') as avg_med_confidence,
    (SELECT COUNT(*) FROM patient_medications pm WHERE pm.user_id = p.user_id AND pm.status = 'active' AND pm.confidence_score < 0.8) as low_confidence_items,
    
    -- Last Updated
    GREATEST(
        COALESCE((SELECT MAX(updated_at) FROM patient_medications pm WHERE pm.user_id = p.user_id), '1900-01-01'),
        COALESCE((SELECT MAX(updated_at) FROM patient_allergies pa WHERE pa.user_id = p.user_id), '1900-01-01'),
        COALESCE((SELECT MAX(updated_at) FROM patient_conditions pc WHERE pc.user_id = p.user_id), '1900-01-01')
    ) as last_updated

FROM (SELECT DISTINCT user_id FROM patient_medications 
      UNION SELECT DISTINCT user_id FROM patient_allergies 
      UNION SELECT DISTINCT user_id FROM patient_conditions) p;

-- Unique index for materialized view
CREATE UNIQUE INDEX patient_health_summary_user_id_idx ON patient_health_summary(user_id);

-- Refresh trigger for materialized view
CREATE OR REPLACE FUNCTION refresh_patient_health_summary()
RETURNS TRIGGER AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY patient_health_summary;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Triggers to refresh materialized view
CREATE TRIGGER refresh_summary_medications
    AFTER INSERT OR UPDATE OR DELETE ON patient_medications
    FOR EACH STATEMENT EXECUTE FUNCTION refresh_patient_health_summary();

CREATE TRIGGER refresh_summary_allergies
    AFTER INSERT OR UPDATE OR DELETE ON patient_allergies
    FOR EACH STATEMENT EXECUTE FUNCTION refresh_patient_health_summary();

CREATE TRIGGER refresh_summary_conditions
    AFTER INSERT OR UPDATE OR DELETE ON patient_conditions
    FOR EACH STATEMENT EXECUTE FUNCTION refresh_patient_health_summary();
```

### Optimized Dashboard Data Loader

```typescript
// Optimized data loading for Main Dashboard
export class PatientDashboardService {
  
  // Single query to load all critical dashboard data
  async loadPatientDashboard(userId: string): Promise<PatientDashboard> {
    const [summary, medications, allergies, conditions, recentLabs, recentVitals] = await Promise.all([
      // Quick summary from materialized view
      this.supabase
        .from('patient_health_summary')
        .select('*')
        .eq('user_id', userId)
        .single(),
      
      // Active medications with source traceability  
      this.supabase
        .from('patient_medications')
        .select(`
          *, 
          source_documents:documents!inner(id, original_name, created_at)
        `)
        .eq('user_id', userId)
        .eq('status', 'active')
        .order('updated_at', { ascending: false })
        .limit(20),
      
      // Critical allergies
      this.supabase
        .from('patient_allergies')
        .select('*')
        .eq('user_id', userId)
        .eq('status', 'active')
        .order('severity', { ascending: false }), // Show severe allergies first
      
      // Active conditions
      this.supabase
        .from('patient_conditions')
        .select('*')
        .eq('user_id', userId)
        .eq('status', 'active')
        .order('diagnosis_date', { ascending: false })
        .limit(10),
      
      // Recent lab results (last 6 months)
      this.supabase
        .from('patient_lab_results')
        .select('*')
        .eq('user_id', userId)
        .gte('test_date', this.getSixMonthsAgo())
        .order('test_date', { ascending: false })
        .limit(50),
      
      // Recent vitals (last 12 months)  
      this.supabase
        .from('patient_vitals')
        .select('*')
        .eq('user_id', userId)
        .gte('measurement_date', this.getTwelveMonthsAgo())
        .order('measurement_date', { ascending: false })
        .limit(20)
    ]);
    
    return {
      summary: summary.data,
      medications: medications.data || [],
      allergies: allergies.data || [],
      conditions: conditions.data || [],
      labResults: recentLabs.data || [],
      vitals: recentVitals.data || []
    };
  }
  
  // Progressive loading for secondary data
  async loadPatientTimeline(userId: string, offset: number = 0): Promise<TimelineEvent[]> {
    // Load historical data in chunks
    return this.supabase.rpc('get_patient_timeline', {
      p_user_id: userId,
      p_limit: 20,
      p_offset: offset
    });
  }
  
  private getSixMonthsAgo(): string {
    const date = new Date();
    date.setMonth(date.getMonth() - 6);
    return date.toISOString().split('T')[0];
  }
  
  private getTwelveMonthsAgo(): string {
    const date = new Date();
    date.setMonth(date.getMonth() - 12);
    return date.toISOString().split('T')[0];
  }
}
```

## 6. Migration Strategy

### Batch Migration for Existing Documents

```typescript
// supabase/functions/batch-normalize/index.ts
export const batchNormalize = async (req: Request) => {
  const { batchSize = 10, startFromId = null } = await req.json();
  
  try {
    // Get completed documents that haven't been normalized
    const { data: documents } = await supabase
      .from('documents')
      .select('id, user_id, medical_data')
      .eq('status', 'completed')
      .not('medical_data', 'is', null)
      .is('normalized_at', null)
      .range(0, batchSize - 1)
      .order('created_at', { ascending: true });
    
    const results = [];
    
    for (const doc of documents || []) {
      try {
        // Normalize each document
        const normalizer = new MedicalDataNormalizer(doc.user_id, doc.id);
        await normalizer.processDocument(doc.medical_data);
        
        // Mark as normalized
        await supabase
          .from('documents')
          .update({ normalized_at: new Date().toISOString() })
          .eq('id', doc.id);
        
        results.push({ id: doc.id, status: 'success' });
      } catch (error) {
        results.push({ id: doc.id, status: 'error', error: error.message });
      }
    }
    
    return new Response(JSON.stringify({
      processed: results.length,
      results,
      hasMore: documents?.length === batchSize
    }));
    
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
};
```

### Data Quality Monitoring

```sql
-- Data quality monitoring views
CREATE VIEW normalization_quality_report AS
SELECT 
    'medications' as table_name,
    user_id,
    COUNT(*) as total_records,
    AVG(confidence_score) as avg_confidence,
    COUNT(*) FILTER (WHERE confidence_score < 0.8) as low_confidence_count,
    COUNT(*) FILTER (WHERE requires_review = true) as review_required_count
FROM patient_medications
GROUP BY user_id

UNION ALL

SELECT 
    'allergies' as table_name,
    user_id,
    COUNT(*) as total_records,
    AVG(confidence_score) as avg_confidence,
    COUNT(*) FILTER (WHERE confidence_score < 0.8) as low_confidence_count,
    0 as review_required_count -- Allergies always require review if low confidence
FROM patient_allergies
GROUP BY user_id

UNION ALL

SELECT 
    'conditions' as table_name,
    user_id,
    COUNT(*) as total_records,
    AVG(confidence_score) as avg_confidence,
    COUNT(*) FILTER (WHERE confidence_score < 0.8) as low_confidence_count,
    0 as review_required_count
FROM patient_conditions
GROUP BY user_id;
```

## 7. Implementation Roadmap

### Phase 1: Core Normalization (Week 1-2)
- [ ] **Create normalized tables** with proper indexes and RLS policies
- [ ] **Build normalization Edge Function** with basic deduplication
- [ ] **Set up database triggers** for real-time processing
- [ ] **Test with sample data** to verify extraction accuracy
- [ ] **Add normalization status tracking** to documents table

### Phase 2: Deduplication & Quality (Week 3-4)  
- [ ] **Implement fuzzy matching** for medications/conditions
- [ ] **Build conflict resolution engine** with confidence scoring
- [ ] **Create manual review interface** for ambiguous cases
- [ ] **Add data quality dashboards** for monitoring
- [ ] **Implement batch migration tool** for existing documents

### Phase 3: Performance & Scale (Week 5-6)
- [ ] **Implement materialized views** and optimize queries
- [ ] **Add caching layer** for frequently accessed data
- [ ] **Performance testing** with realistic data volumes
- [ ] **Implement progressive data loading** for large datasets
- [ ] **Add monitoring and alerting** for normalization failures

### Phase 4: Main Dashboard (Week 7-8)
- [ ] **Build patient-centric dashboard** using normalized data
- [ ] **Implement source traceability** UI components
- [ ] **Add confidence indicators** and manual override options
- [ ] **User testing** and refinement
- [ ] **A/B test** normalized vs. document-centric views

## 8. Success Metrics

### Data Quality Metrics
- **Normalization Success Rate**: >95% of completed documents successfully normalized
- **Deduplication Accuracy**: <5% false positive duplicate detection
- **Confidence Score Distribution**: >80% of normalized records have confidence >0.8
- **Manual Review Rate**: <20% of normalized records require manual review

### Performance Metrics
- **Dashboard Load Time**: <2 seconds for patient summary
- **Normalization Processing Time**: <30 seconds per document
- **Database Query Performance**: <100ms for typical dashboard queries
- **Storage Efficiency**: <50% increase in storage usage vs. JSONB-only approach

### User Experience Metrics
- **Data Completeness**: Patient can see unified view of medical history
- **Source Traceability**: Users can trace any data point to source document
- **Confidence Visibility**: Users understand data quality through clear indicators
- **Review Workflow**: Efficient resolution of conflicting medical information

## 9. Risk Mitigation

### Technical Risks
- **Data Loss During Migration**: Implement comprehensive backup strategy and gradual rollout
- **Performance Degradation**: Use materialized views and strategic indexing
- **Normalization Errors**: Extensive testing with diverse document types
- **Scalability Issues**: Design for horizontal scaling with partitioning

### Clinical Risks  
- **Medical Data Accuracy**: Conservative confidence thresholds and manual review workflows
- **Drug Interaction Detection**: Integrate with pharmaceutical databases for safety checks
- **Allergy Management**: Strict policies for allergy data handling and visibility
- **Audit Trail**: Comprehensive logging of all data modifications and sources

### Compliance Risks
- **HIPAA Compliance**: Maintain all existing security controls in normalized tables
- **Data Retention**: Implement lifecycle policies for medical records
- **Access Control**: Ensure RLS policies are comprehensive and tested
- **Audit Requirements**: Detailed logging of data access and modifications

## Conclusion

This normalization architecture transforms Guardian from a document storage system into a true **Personal Health Record (PHR)** platform. By intelligently aggregating and deduplicating medical information while maintaining full traceability, Guardian provides patients with unprecedented insight into their health data.

**Key Benefits:**
1. **Patient-Centric View**: Unified health summary across all documents
2. **Data Quality Control**: Confidence scoring and conflict resolution
3. **Source Traceability**: Every data point traceable to original documents  
4. **Performance Optimization**: Sub-second dashboard loading for patient summaries
5. **Clinical Safety**: Conservative handling of critical medical information
6. **Scalable Architecture**: Designed for thousands of patients and millions of records

The phased implementation approach ensures that Guardian can deliver a functional POC by July 31 while laying the foundation for a sophisticated, enterprise-grade healthcare platform.