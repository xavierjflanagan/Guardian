# Bridge Schema Architecture - Three-Pass AI Processing Pipeline

**Date:** 30 September 2025
**Purpose:** Comprehensive guide to Guardian's bridge schema architecture for V3 AI processing pipeline
**Status:** Complete for Pass 1 & Pass 2 implementation

---

## **Overview**

Guardian's V3 AI processing pipeline uses a **three-pass architecture** with **bridge schemas** that define the exact data extraction requirements for each processing phase. Bridge schemas serve as the contract between AI models and database tables, ensuring structured, validated data insertion at each pass.

### **Three-Pass Processing Pipeline**

```
Document → Pass 1 (Entity Detection) → Pass 2 (Clinical Enrichment) → Pass 3 (Semantic Narratives)
```

1. **Pass 1 - Entity Detection**: OCR + Vision AI to extract and identify medical entities
2. **Pass 2 - Clinical Enrichment**: Clinical AI models to enrich entities with medical context
3. **Pass 3 - Semantic Narratives**: Semantic AI to create patient timelines and narratives

### **Bridge Schema Architecture**

Each database table has **pass-specific bridge schemas** that define:
- **AI extraction requirements** for that processing pass
- **Required vs optional fields** for AI models to populate
- **Validation rules** and data formats
- **Example extractions** showing expected AI outputs

---

## **Schema Organization Structure**

### **Directory Layout**
```
bridge-schemas/
├── source/
│   ├── pass-1/ (7 schemas total)
│   │   ├── [2 pass-specific schemas]
│   │   │   ├── pass1_entity_metrics.md
│   │   │   └── profile_classification_audit.md
│   │   └── pass-1-versions/ (5 multi-pass schemas)
│   │       ├── ai_confidence_scoring.md
│   │       ├── ai_processing_sessions.md
│   │       ├── entity_processing_audit.md
│   │       ├── manual_review_queue.md
│   │       └── shell_files.md
│   ├── pass-2/ (18 schemas total)
│   │   ├── [13 pass-specific clinical schemas]
│   │   │   ├── pass2_clinical_metrics.md
│   │   │   ├── patient_conditions.md
│   │   │   ├── patient_medications.md
│   │   │   ├── patient_observations.md
│   │   │   ├── patient_interventions.md
│   │   │   ├── patient_allergies.md
│   │   │   ├── patient_immunizations.md
│   │   │   ├── patient_vitals.md
│   │   │   ├── patient_clinical_events.md
│   │   │   ├── healthcare_encounters.md
│   │   │   ├── medical_code_assignments.md
│   │   │   ├── profile_appointments.md
│   │   │   └── user_profiles.md
│   │   └── pass-2-versions/ (5 multi-pass schemas)
│   │       ├── ai_confidence_scoring.md
│   │       ├── ai_processing_sessions.md
│   │       ├── entity_processing_audit.md
│   │       ├── manual_review_queue.md
│   │       └── shell_files.md
│   └── pass-3/ (future implementation)
├── detailed/ (future three-tier system)
└── minimal/ (future three-tier system)
```

### **Schema Categorization**

#### **Pass-Specific Schemas**
Tables that are **only populated during specific passes**:
- **Pass 1 Only**: Entity detection metrics, profile classification audit
- **Pass 2 Only**: Clinical enrichment data (conditions, medications, observations, vitals, encounters)
- **Pass 3 Only**: Semantic narratives, patient timelines (future)

#### **Multi-Pass Schemas**
Tables that are **updated across multiple passes**:
- **Pass 1**: Initial creation (INSERT operations)
- **Pass 2**: Clinical enrichment (UPDATE operations)
- **Pass 3**: Semantic completion (UPDATE operations)

**Multi-Pass Tables:**
1. `ai_confidence_scoring` - Confidence score tracking across passes
2. `ai_processing_sessions` - AI processing session management across passes
3. `entity_processing_audit` - Entity processing status across passes
4. `manual_review_queue` - Manual review workflow across passes
5. `shell_files` - File processing completion status

---

## **Database Table Coverage**

### **Complete Schema Coverage**
**Total Bridge Schemas**: 25 schemas (100% coverage)
- **Pass 1**: 7 schemas (2 pass-specific + 5 multi-pass)
- **Pass 2**: 18 schemas (13 pass-specific + 5 multi-pass)
- **Pass 3**: Future implementation

### **Core Processing Tables (20 current, 27 when complete)**

#### **Pass 1 Entity Detection (7 tables)**
```
✅ pass1_entity_metrics       - Pass 1 processing performance metrics
✅ profile_classification_audit - Profile classification and audit
✅ ai_confidence_scoring      - Confidence score tracking (Pass 1 version)
✅ ai_processing_sessions     - AI processing session management (Pass 1 version)
✅ entity_processing_audit    - Entity audit trail (Pass 1 version)
✅ manual_review_queue        - Manual review workflow (Pass 1 version)
✅ shell_files               - File processing status (Pass 1 version)
```

#### **Pass 2 Clinical Enrichment (18 tables)**
```
✅ pass2_clinical_metrics     - Pass 2 clinical enrichment metrics
✅ patient_conditions         - Medical conditions and diagnoses
✅ patient_medications        - Medication records and prescriptions
✅ patient_observations       - Lab results and clinical assessments
✅ patient_interventions      - Medical procedures and treatments
✅ patient_allergies          - Allergy and adverse reaction records
✅ patient_immunizations      - Vaccination and immunization records
✅ patient_vitals             - Vital signs and physiological measurements
✅ patient_clinical_events    - Clinical events and healthcare activities
✅ healthcare_encounters      - Healthcare visits and appointments
✅ medical_code_assignments   - Medical coding and classification
✅ profile_appointments       - Appointment scheduling and management
✅ user_profiles              - Profile clinical enrichment
✅ ai_confidence_scoring      - Confidence score tracking (Pass 2 version)
✅ ai_processing_sessions     - AI processing sessions (Pass 2 version)
✅ entity_processing_audit    - Entity audit (Pass 2 clinical version)
✅ manual_review_queue        - Manual review workflow (Pass 2 version)
✅ shell_files               - File status (Pass 2 clinical version)
```

#### **Pass 3 Semantic Narratives (7 tables - future)**
```
🔲 pass3_narrative_metrics     - Pass 3 semantic processing metrics
🔲 patient_timelines           - Patient timeline and chronological data
🔲 semantic_relationships      - Clinical data relationships and connections
🔲 care_coordination           - Care coordination and provider communication
🔲 health_summaries           - Automated health summaries and insights
🔲 provider_communications    - Provider-to-provider communication records
🔲 clinical_decision_support  - Clinical decision support recommendations
```

### **Non-Processing Tables (No Bridge Schemas Required)**
These tables handle authentication, billing, and system infrastructure:
```
- subscription_plans (billing configuration)
- user_usage_tracking (billing aggregates)
- api_rate_limits (rate limiting)
- job_queue (background job management)
- file_processing_queue (file processing coordination)
- ai_processing_summary (cross-pass aggregation)
```

---

## **Bridge Schema Design Patterns**

### **TypeScript Interface Pattern**
Each bridge schema defines a TypeScript interface with specific field requirements:

```typescript
interface TableNameExtraction {
  // CORE IDENTIFICATION
  profile_id: string;           // Always required
  shell_file_id?: string;       // When document-related

  // PASS-SPECIFIC FIELDS
  // ... fields specific to this processing pass

  // QUALITY AND VALIDATION
  confidence: number;           // 0.0-1.0 confidence score

  // TEMPORAL DATA
  created_at: string;          // ISO format timestamp
}
```

### **Multi-Pass Schema Pattern**
Multi-pass tables have different interfaces for each pass:

**Pass 1 (INSERT operations):**
```typescript
interface ShellFilesPass1Creation {
  // Initial file processing fields
  file_path: string;
  file_size: number;
  processing_status: 'uploaded' | 'processing' | 'completed';
  entities_detected: number;
  // ...
}
```

**Pass 2 (UPDATE operations):**
```typescript
interface ShellFilesPass2Update {
  // RECORD IDENTIFICATION (for UPDATE operations)
  shell_file_id: string;

  // CLINICAL ENRICHMENT STATUS
  pass2_status: 'pending' | 'completed' | 'failed';
  clinical_entities_enriched: number;
  // ...
}
```

### **Example Extraction Pattern**
Each schema includes realistic example extractions:

```json
{
  "profile_id": "profile_abc123",
  "patient_condition": "Type 2 Diabetes Mellitus",
  "condition_code": "E11.9",
  "coding_system": "ICD-10",
  "severity": "moderate",
  "confidence": 0.92,
  "created_at": "2025-09-30T14:23:45Z"
}
```

---

## **AI Model Integration**

### **Pass 1 - Entity Detection Models**
- **Primary**: GPT-4o Mini Vision for document analysis
- **Secondary**: Google Cloud Vision OCR for text extraction safety net
- **Output**: Entity identification with confidence scores
- **Bridge Schema Focus**: Entity detection, OCR validation, processing metrics

### **Pass 2 - Clinical Enrichment Models**
- **Primary**: GPT-4 Turbo for clinical data enrichment
- **Secondary**: Claude for complex clinical reasoning
- **Output**: Clinical coding, medical context, validation results
- **Bridge Schema Focus**: Clinical data population, medical coding, validation metrics

### **Pass 3 - Semantic Narrative Models** (Future)
- **Primary**: GPT-4 for narrative synthesis
- **Secondary**: Specialized semantic models for timeline creation
- **Output**: Patient narratives, timelines, care coordination
- **Bridge Schema Focus**: Narrative quality, semantic relationships, care workflows

---

## **Quality Assurance and Validation**

### **Confidence Scoring System**
All bridge schemas require confidence scores (0.0-1.0):
- **>0.9**: Very high confidence - Auto-accept
- **0.8-0.9**: High confidence - Standard processing
- **0.6-0.8**: Medium confidence - Additional validation
- **0.4-0.6**: Low confidence - Manual review recommended
- **<0.4**: Very low confidence - Manual review required

### **Manual Review Triggers**
Bridge schemas define when manual review is required:
- Low confidence scores
- Complex medical conditions
- Medication dosage uncertainties
- Clinical safety flags
- Validation failures

### **Clinical Safety Integration**
Pass 2 clinical schemas include safety considerations:
- Patient safety flags for critical conditions
- Medication interaction warnings
- Provider notification requirements
- Clinical alert triggers

---

## **Database Migration and Version Control**

### **Migration History**
- **30 September 2025**: Database metrics restructuring completed
  - Removed obsolete `usage_events` table
  - Created pass-specific metrics tables (`pass1_entity_metrics`, `pass2_clinical_metrics`)
  - Enhanced `entity_processing_audit` with multi-pass capabilities
  - Updated all tracking functions for new table structure

### **Bridge Schema Versioning**
- Bridge schemas are versioned with database schema changes
- Multi-pass schemas have pass-specific versions in organized subfolders
- Obsolete schemas are removed (e.g., `entity_processing_audit_v2.md`)

---

## **Implementation Status**

### **Completed (✅)**
- **Bridge Schema Architecture**: Complete design and organization
- **Pass 1 Bridge Schemas**: 7 schemas created and validated
- **Pass 2 Bridge Schemas**: 18 schemas created and validated
- **Database Integration**: All schemas align with current database structure
- **Multi-Pass Organization**: Clear separation between pass-specific and multi-pass schemas

### **In Progress (🚧)**
- **Pass 1 AI Implementation**: Ready for development with complete bridge schemas
- **Pass 2 AI Implementation**: Ready for development with complete bridge schemas

### **Future (🔲)**
- **Pass 3 Bridge Schemas**: 7 schemas planned for semantic narrative processing
- **Three-Tier System**: Detailed and minimal schema variants for different use cases
- **Advanced Validation**: Schema-specific validation rules and quality gates

---

## **Usage Guidelines**

### **For AI Model Development**
1. **Select appropriate bridge schema** for your processing pass
2. **Follow TypeScript interface** exactly for data structure
3. **Include confidence scores** for all extractions
4. **Use example extractions** as reference for expected output format
5. **Implement validation rules** as specified in schema

### **For Database Integration**
1. **Multi-pass tables** require both INSERT (Pass 1) and UPDATE (Pass 2+) operations
2. **Pass-specific tables** only require INSERT operations during their designated pass
3. **Foreign key relationships** must be maintained across pass boundaries
4. **Audit trails** are automatically maintained through `entity_processing_audit`

### **For Quality Assurance**
1. **Validate against bridge schema** before database insertion
2. **Check confidence thresholds** for manual review triggers
3. **Monitor processing metrics** through pass-specific metrics tables
4. **Maintain clinical safety** through integrated safety checks

---

## **Next Steps**

### **Immediate Development Priorities**
1. **Pass 1 AI Implementation**: Use bridge schemas to implement entity detection pipeline
2. **Pass 2 AI Implementation**: Use bridge schemas to implement clinical enrichment pipeline
3. **Quality Assurance Testing**: Validate bridge schema compliance with test data

### **Future Enhancements**
1. **Pass 3 Bridge Schemas**: Complete semantic narrative processing schemas
2. **Three-Tier System**: Implement detailed/minimal schema variants
3. **Advanced Validation**: Schema-specific validation and quality gates
4. **Performance Optimization**: Bridge schema loading and caching strategies

---

This comprehensive bridge schema architecture provides the foundation for Guardian's three-pass AI processing pipeline, ensuring structured, validated, and clinically-safe data extraction and enrichment across all processing phases.