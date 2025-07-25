# **Data Lifecycle, Provenance & Metadata Strategy - Claude's Approach**

**Date:** July 24, 2025  
**Author:** Claude (Anthropic)  
**Context:** Based on Xavier's detailed healthcare data requirements and architectural vision  

---

## **Executive Summary**

This document outlines Claude's approach to transforming Guardian into a sophisticated healthcare data platform that handles temporal medical data evolution, complete provenance tracking, rich metadata, and cross-entity relationships. The strategy prioritizes data integrity, clinical accuracy, and comprehensive audit trails.

---

## **I. Core Philosophy: Immutable Healthcare Records with Smart Aggregation**

### **Principle 1: Never Delete, Always Preserve**
Every piece of extracted medical data must be permanently stored with complete source traceability. The system should distinguish between **raw storage** (what was extracted) and **presentation logic** (what users see).

### **Principle 2: Multi-Layered Data Architecture**
```
Raw Document → AI Extraction → Individual Records → Smart Aggregation → User Dashboard
```

Each layer preserved independently for complete data lineage.

### **Principle 3: Temporal Medical Reality**
Healthcare data evolves - allergies are disproven, medications are discontinued, conditions resolve. The system must track these changes while preserving historical context.

---

## **II. Unified Medical Data Points Architecture**

### **Core Table Design**
```sql
CREATE TABLE medical_data_points (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id uuid REFERENCES auth.users ON DELETE CASCADE,
    
    -- Core Medical Data
    data_type text NOT NULL, -- 'medication', 'allergy', 'condition', 'lab_result', 'vital_sign', 'procedure'
    primary_value text NOT NULL, -- 'Paracetamol', 'Hypertension', 'Total Cholesterol'
    secondary_data jsonb, -- dosage, severity, units, reference ranges, etc.
    
    -- Temporal Status Tracking  
    clinical_status text DEFAULT 'active', -- 'active', 'discontinued', 'resolved', 'disproven', 'historical'
    status_reason text, -- 'medication_stopped', 'allergy_disproven', 'condition_resolved'
    effective_from date NOT NULL,
    effective_until date, -- NULL means still active
    superseded_by_document_id uuid REFERENCES documents(id),
    
    -- Rich AI-Generated Metadata
    extraction_metadata jsonb NOT NULL, -- All AI-generated context and analysis
    clinical_tags text[] DEFAULT '{}', -- ['severe', 'provider_verified', 'chronic', 'treatment_responsive']
    authenticity_level text DEFAULT 'unverified', -- 'provider_verified', 'patient_reported', 'inferred', 'unverified'
    
    -- Complete Source Traceability
    source_document_id uuid NOT NULL REFERENCES documents(id),
    source_page_number integer,
    source_coordinates jsonb, -- {x: 120, y: 450, width: 200, height: 30}
    ocr_text_context text, -- Surrounding OCR text for context
    ai_extraction_raw jsonb, -- Original AI JSON output
    ai_confidence_score decimal(3,2),
    
    -- Clinical Context & Relationships
    related_data_point_ids uuid[], -- Links to other medical data points
    clinical_context text, -- "due to menorrhagia", "for blood pressure control"
    prescriber_info jsonb, -- Provider information when applicable
    
    -- System Metadata
    extraction_date timestamptz DEFAULT now(),
    last_verified_date timestamptz,
    verification_method text, -- 'ai_extraction', 'human_verified', 'cross_document_confirmed'
    
    -- Audit Trail
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    
    -- Constraints
    CONSTRAINT valid_data_type CHECK (data_type IN ('medication', 'allergy', 'condition', 'lab_result', 'vital_sign', 'procedure', 'provider', 'insurance')),
    CONSTRAINT valid_clinical_status CHECK (clinical_status IN ('active', 'discontinued', 'resolved', 'disproven', 'historical', 'superseded')),
    CONSTRAINT valid_authenticity CHECK (authenticity_level IN ('provider_verified', 'patient_reported', 'inferred', 'unverified'))
);
```

### **Relationship Tracking Table**
```sql
CREATE TABLE medical_data_relationships (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    source_data_point_id uuid NOT NULL REFERENCES medical_data_points(id),
    target_data_point_id uuid NOT NULL REFERENCES medical_data_points(id),
    relationship_type text NOT NULL, -- 'treats', 'causes', 'contraindicated_with', 'monitors', 'indicates'
    relationship_strength decimal(3,2), -- 0.0 to 1.0 confidence in relationship
    extracted_from_document_id uuid NOT NULL REFERENCES documents(id),
    ai_rationale text, -- Why AI thinks these are related
    created_at timestamptz DEFAULT now(),
    
    CONSTRAINT valid_relationship_type CHECK (relationship_type IN ('treats', 'causes', 'contraindicated_with', 'monitors', 'indicates', 'related_to')),
    CONSTRAINT no_self_reference CHECK (source_data_point_id != target_data_point_id)
);
```

---

## **III. Complete Provenance Tracking System**

### **Document Processing Pipeline Tracking**
```sql
CREATE TABLE document_processing_stages (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    document_id uuid NOT NULL REFERENCES documents(id),
    stage_name text NOT NULL, -- 'raw_upload', 'ocr_extraction', 'ai_analysis', 'normalization'
    stage_output jsonb, -- Complete output from each stage
    stage_metadata jsonb, -- Processing metadata, timing, confidence scores
    storage_path text, -- Where this stage's output is stored
    processing_timestamp timestamptz DEFAULT now(),
    
    UNIQUE(document_id, stage_name)
);
```

### **Visual Source Mapping**
```sql
CREATE TABLE visual_source_mappings (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    medical_data_point_id uuid NOT NULL REFERENCES medical_data_points(id),
    document_id uuid NOT NULL REFERENCES documents(id),
    page_number integer DEFAULT 1,
    bounding_box jsonb NOT NULL, -- {x, y, width, height, page_width, page_height}
    surrounding_context_box jsonb, -- Larger box for contextual cropping
    ocr_text_snippet text, -- Exact OCR text from this region
    confidence_score decimal(3,2),
    created_at timestamptz DEFAULT now()
);
```

---

## **IV. Enhanced AI Extraction Requirements**

### **AI Prompt Enhancement Strategy**
The AI model must be enhanced to extract:

1. **Bounding Box Coordinates** for every piece of medical data
2. **Clinical Relationships** between extracted data points
3. **Temporal Indicators** (current vs historical mentions)
4. **Authenticity Markers** (doctor's note vs patient report)
5. **Clinical Context** (why medication prescribed, condition severity)

### **Enhanced AI Output Format**
```typescript
interface EnhancedMedicalExtraction {
  documentType: string;
  extractedDataPoints: Array<{
    id: string; // Unique identifier for this extraction
    dataType: 'medication' | 'allergy' | 'condition' | 'lab_result' | 'vital_sign';
    primaryValue: string;
    secondaryData: Record<string, any>;
    
    // Spatial Information
    boundingBox: {
      x: number; y: number; width: number; height: number;
      pageNumber: number; confidence: number;
    };
    
    // Clinical Context
    clinicalContext: string;
    temporalStatus: 'current' | 'historical' | 'planned' | 'discontinued';
    authenticityLevel: 'provider_verified' | 'patient_reported' | 'inferred';
    
    // Relationships
    relationships: Array<{
      targetDataPointId: string;
      relationshipType: 'treats' | 'causes' | 'monitors';
      confidence: number;
      rationale: string;
    }>;
    
    // Metadata
    extractionConfidence: number;
    aiRationale: string;
    surroundingContext: string;
  }>;
  
  // Document-level metadata
  documentMetadata: {
    documentDate: string;
    authenticityLevel: 'provider_document' | 'patient_document' | 'unknown';
    providerInfo?: {
      name: string; facility: string; specialty: string;
    };
  };
}
```

---

## **V. Temporal Data Evolution Handling**

### **Status Evolution Strategy**
1. **Never delete** previous extractions
2. **Mark as superseded** when newer information contradicts
3. **Preserve full audit trail** of why status changed
4. **Smart aggregation** for dashboard display

### **Supersession Logic**
```sql
-- Function to handle medical data supersession
CREATE OR REPLACE FUNCTION supersede_medical_data(
    old_data_point_id uuid,
    new_document_id uuid,
    supersession_reason text
) RETURNS void AS $$
BEGIN
    -- Mark old data as superseded
    UPDATE medical_data_points 
    SET clinical_status = 'superseded',
        effective_until = (SELECT created_at FROM documents WHERE id = new_document_id)::date,
        superseded_by_document_id = new_document_id,
        status_reason = supersession_reason,
        updated_at = now()
    WHERE id = old_data_point_id;
    
    -- Log the supersession event
    INSERT INTO medical_data_supersession_log (
        superseded_data_point_id,
        superseding_document_id,
        supersession_reason,
        supersession_timestamp
    ) VALUES (
        old_data_point_id,
        new_document_id,
        supersession_reason,
        now()
    );
END;
$$ LANGUAGE plpgsql;
```

---

## **VI. Dashboard Query Patterns**

### **Active Medical Data Queries**
```sql
-- Get all active allergies for patient dashboard
SELECT 
    primary_value as allergen,
    secondary_data->>'severity' as severity,
    array_agg(DISTINCT source_document_id) as source_documents,
    max(extraction_date) as last_confirmed,
    avg(ai_confidence_score) as avg_confidence
FROM medical_data_points 
WHERE user_id = $1 
    AND data_type = 'allergy' 
    AND clinical_status = 'active'
    AND effective_until IS NULL
GROUP BY primary_value, secondary_data->>'severity';
```

### **Historical View Queries**
```sql
-- Get allergy history including resolved/disproven
SELECT 
    primary_value as allergen,
    clinical_status,
    status_reason,
    effective_from,
    effective_until,
    source_document_id
FROM medical_data_points 
WHERE user_id = $1 
    AND data_type = 'allergy'
ORDER BY effective_from DESC;
```

### **Relationship Navigation Queries**
```sql
-- Get medications and what they treat
SELECT 
    m.primary_value as medication,
    m.secondary_data->>'dosage' as dosage,
    c.primary_value as treats_condition,
    r.relationship_strength
FROM medical_data_points m
JOIN medical_data_relationships r ON m.id = r.source_data_point_id
JOIN medical_data_points c ON r.target_data_point_id = c.id
WHERE m.user_id = $1 
    AND m.data_type = 'medication'
    AND c.data_type = 'condition'
    AND r.relationship_type = 'treats'
    AND m.clinical_status = 'active';
```

---

## **VII. Frontend Architecture Strategy**

### **Component Hierarchy**
```
PatientDashboard
├── ActiveMedicalData (status = 'active')
│   ├── AllergiesSection
│   ├── MedicationsSection
│   ├── ConditionsSection
│   └── VitalsSection
├── MedicalHistory (all statuses)
└── DocumentExplorer (filtered by document)
```

### **Provenance Modal API**
```typescript
// GET /api/medical-data/:id/provenance
interface ProvenanceResponse {
  dataPoint: MedicalDataPoint;
  sourceDocuments: Array<{
    id: string;
    filename: string;
    documentDate: string;
    viewUrl: string;
  }>;
  visualSources: Array<{
    pageNumber: number;
    boundingBox: BoundingBox;
    croppedImageUrl: string;
    ocrContext: string;
  }>;
  processingStages: Array<{
    stage: string;
    output: any;
    timestamp: string;
  }>;
  relationships: Array<{
    relatedDataPoint: MedicalDataPoint;
    relationshipType: string;
    confidence: number;
  }>;
}
```

---

## **VIII. Implementation Phases**

### **Phase 1: Database Architecture (Week 1)**
- [ ] Create unified `medical_data_points` table
- [ ] Create `medical_data_relationships` table  
- [ ] Create `visual_source_mappings` table
- [ ] Create `document_processing_stages` table
- [ ] Migrate existing data to new schema

### **Phase 2: Enhanced AI Extraction (Week 2)**
- [ ] Update AI prompts to extract bounding boxes
- [ ] Implement relationship detection
- [ ] Add temporal status recognition
- [ ] Enhance authenticity level detection

### **Phase 3: Normalization Engine (Week 3)**  
- [ ] Rewrite normalization Edge Function for new schema
- [ ] Implement supersession logic
- [ ] Add relationship creation
- [ ] Build visual mapping system

### **Phase 4: Frontend Implementation (Week 4)**
- [ ] Build patient-centric dashboard
- [ ] Implement provenance modals
- [ ] Create historical views
- [ ] Add relationship navigation

---

## **IX. Critical Success Factors**

### **Data Integrity**
- **Complete Audit Trail**: Every change tracked with reason and source
- **No Data Loss**: Historical data preserved even when superseded
- **Source Traceability**: Every data point traceable to exact location in original document

### **Clinical Accuracy**
- **Temporal Awareness**: System understands current vs historical medical data
- **Relationship Tracking**: Medications linked to conditions they treat
- **Authenticity Levels**: Clear distinction between provider vs patient reported data

### **User Experience**
- **Instant Source Access**: Click any data point → see original document location
- **Complete Context**: OCR text, AI analysis, and relationships all accessible
- **Historical Perspective**: Users can see how their medical data evolved over time

### **Performance Requirements**
- **Dashboard Load Time**: <2 seconds for complete patient summary
- **Provenance Lookup**: <500ms to load all source information
- **Relationship Queries**: <1 second to load cross-referenced data

---

## **X. Risk Mitigation**

### **Technical Risks**
- **Migration Complexity**: Gradual migration strategy with rollback capability
- **Performance Impact**: Strategic indexing and materialized views
- **Storage Growth**: Efficient JSONB compression and archival policies

### **Clinical Risks**
- **Data Accuracy**: Multiple validation layers and confidence thresholds
- **Temporal Confusion**: Clear UI indicators for current vs historical data
- **Relationship Errors**: Conservative relationship confidence thresholds

### **Compliance Risks**
- **HIPAA Compliance**: Enhanced RLS policies for all new tables
- **Audit Requirements**: Complete change logging for regulatory compliance
- **Data Retention**: Configurable retention policies while preserving clinical history

---

## **Conclusion**

This architecture transforms Guardian from a document management system into a sophisticated longitudinal health record platform. By preserving complete data lineage while enabling intelligent aggregation, users gain unprecedented insight into their health data evolution while maintaining full traceability to source documents.

The unified medical data points approach, combined with rich metadata and relationship tracking, creates a foundation for advanced healthcare analytics while ensuring clinical accuracy and regulatory compliance.