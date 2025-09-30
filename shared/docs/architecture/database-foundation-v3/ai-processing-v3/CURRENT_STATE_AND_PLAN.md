# AI Processing v3: Current State & Implementation Plan

**Date:** 26 September 2025
**Status:** Infrastructure Complete - Ground-Up AI System Build Required
**Approach:** Clean slate implementation aligned with deployed V3 database foundation
**Priority:** CRITICAL - Replace worker simulation code with real AI processing

---

## **CURRENT INFRASTRUCTURE STATUS**

### ✅ **OPERATIONAL: V3 Foundation (Production-Ready)**

#### **Database Foundation**
- **V3 Schema Deployed:** 50+ tables across 8 schema files
- **Enhanced Clinical Core:** `patient_clinical_events`, `patient_observations`, `patient_interventions`, `patient_conditions` with full temporal data management
- **Medical Code Resolution:** Universal and regional medical codes with vector search capability
- **Narrative Architecture:** `clinical_narratives` table with semantic relationship tracking
- **Job Coordination:** `job_queue`, `api_rate_limits` with heartbeat monitoring

#### **Worker Infrastructure**
- **Render.com Deployment:** `exora-v3-worker` operational on staging/main branches
- **Job Processing:** Successfully claiming jobs via `claim_next_job_v3()` RPC function
- **Health Monitoring:** Worker heartbeat tracking and timeout recovery
- **Error Handling:** Job completion, failure tracking, audit logging operational

#### **Edge Functions**
- **File Upload Pipeline:** `shell-file-processor-v3` successfully creating jobs from file uploads
- **Audit Logging:** `audit-logger-v3` with healthcare compliance correlation IDs
- **API Integration:** OpenAI and Google Vision API keys configured in environment

### ❌ **MISSING: Complete AI Processing System**

#### **No AI Processing Logic**
```typescript
// Current worker reality (simulation only)
private async processShellFile(job: Job): Promise<any> {
    console.log(`Processing shell file ${job.job_payload.shell_file_id}`);

    // TODO: Replace simulation with real processing
    await this.sleep(2000); // ❌ NO ACTUAL AI PROCESSING

    return { status: 'completed' }; // ❌ NO CLINICAL DATA EXTRACTION
}
```

#### **Critical Gaps**
- **No Bridge Schemas:** Deleted existing schemas - complete rebuild needed
- **No Pass Functions:** Entity detection, clinical enrichment, semantic narratives don't exist
- **No OpenAI Integration:** API configured but unused
- **No OCR Processing:** Google Cloud Vision configured but unused
- **No Database Writes:** Clinical data extraction to V3 tables not implemented
- **No Schema Loading:** Dynamic bridge schema system doesn't exist

---

## 🎯 **WHAT WE'RE BUILDING**

### **Three-Pass AI Architecture Overview**

```
Pass 1: Document → Entity Detection → Category Classification
         ↓
Pass 2: Entities → Clinical Enrichment → V3 Database → Fully Functional System
         ↓
Pass 3: Clinical Data → Semantic Narratives → Enhanced User Experience
```

### **Pass 1: Entity Detection (New Build)**
**Purpose:** Classify document content into processing categories
**AI Model:** GPT-4o-mini (cost-optimized)
**Input:** Complete document text + spatial coordinates
**Output:** Entity classification with processing priorities

**Categories:**
- `clinical_event`: Medical data requiring full Pass 2 processing
- `healthcare_context`: Provider/encounter info needing limited processing
- `document_structure`: Administrative content (audit logging only)

### **Pass 2: Clinical Enrichment (New Build)**
**Purpose:** Extract structured medical data to V3 database
**AI Model:** GPT-4 (accuracy-optimized)
**Input:** Filtered entities + dynamic bridge schemas
**Output:** Clinical data written to V3 tables

**Target Tables:**
- `patient_clinical_events` (master timeline)
- `patient_observations` (vitals, lab results)
- `patient_interventions` (medications, procedures)
- `patient_conditions` (diagnoses)
- `shell_files` (document metadata updates)

### **Pass 3: Semantic Narratives (New Build)**
**Purpose:** Create clinical storylines from structured data
**AI Model:** GPT-4 (narrative optimization)
**Input:** Structured Pass 2 clinical data (JSON)
**Output:** Clinical narratives and document synthesis

**Enhancements:**
- Clinical storylines spanning document sections
- AI-generated shell file summaries
- Narrative linking to clinical data

---

## 📋 **DETAILED IMPLEMENTATION PLAN**

### **PHASE 1.5: Database Cleanup (3 Days) - NEW CRITICAL PHASE**
**Priority:** URGENT - Must complete before bridge schema creation
**Discovery:** Migration 03 left redundant narrative linking tables

**Critical Issues Found:**
- **Redundant Linking Tables:** 5 specific `narrative_*_links` tables still exist
- **Architecture Inconsistency:** Dual linking system (old + new generic table)
- **Schema Misalignment:** Current schema doesn't match intended design

**Cleanup Tasks:**
1. **Narrative Linking Cleanup:** Migrate data from 5 specific tables to generic `narrative_event_links` table, then drop old tables
2. **Missing Column Audit:** Verify all clinical tables have required `clinical_event_id` columns
3. **Schema Consistency:** Align deployed database with architectural plans

**Impact:** Reduces bridge schema scope from 25 to 20 tables

### **PHASE 1: Bridge Schema System (7-10 Days)**
**Priority:** CRITICAL BLOCKER - Cannot proceed without this foundation
**Dependencies:** Phase 1.5 database cleanup completion
**Approach:** Ground-up creation aligned with cleaned V3 database

#### **Scope: 20 Core Processing Tables**
Based on actual database analysis (73 total tables), need bridge schemas for **clinical data processing tables only**:

**Core Clinical Data Extraction (10 tables):**
```sql
-- Primary AI processing targets
patient_clinical_events       -- Central hub for all clinical activity
patient_observations         -- Lab results, measurements, assessments
patient_interventions        -- Medications, procedures, treatments
patient_conditions          -- Medical diagnoses with status tracking
patient_allergies           -- Safety-critical allergy records
patient_vitals             -- Vital signs with measurement details
patient_medications        -- Prescription management and tracking
healthcare_encounters      -- Provider visit context and details
healthcare_timeline_events -- UI timeline display optimization
clinical_narratives        -- AI-generated clinical storylines
```

**AI Processing Infrastructure (4 tables):**
```sql
-- Processing audit and management
entity_processing_audit_v2  -- Pass 1 & 2 entity processing audit
profile_classification_audit -- Profile safety validation
shell_files                 -- Document containers with AI synthesis
ai_processing_sessions      -- AI processing session management
```

**Medical Code Resolution (4 tables):**
```sql
-- Medical code assignment system
universal_medical_codes     -- Global medical code library (RxNorm, SNOMED)
regional_medical_codes      -- Country-specific codes (PBS, MBS)
medical_code_assignments    -- Entity-to-code mapping
code_resolution_log         -- Performance monitoring
```

**User Analytics (2 tables):**
```sql
-- Usage tracking during processing
user_usage_tracking         -- Monthly usage metrics
usage_events               -- Detailed usage analytics
```

**Total Bridge Schemas Required: 20 core processing tables × 3 tiers = 60 schema files**

**Note:** Narrative linking tables (`narrative_condition_links`, etc.) planned for removal in Phase 1.5 cleanup

#### **Three-Tier Schema System**
**Source Tier:** Database-focused field definitions for final validation
**Detailed Tier:** Complete medical context with examples (default processing)
**Minimal Tier:** Token-optimized for large documents

#### **Dynamic Schema Loading System**
```typescript
interface V3BridgeSchemaLoader {
  // Pass 1 → Pass 2 integration
  getSchemasForEntityCategories(categories: EntityCategory[]): BridgeSchema[];

  // Token budget management
  getOptimalSchemaVersion(entities: number, budget: number): 'minimal' | 'detailed' | 'source';

  // Performance optimization
  loadSchemaWithCaching(tableName: string, version: string): BridgeSchema;
}
```

### **PHASE 2: Pass 1 Entity Detection System (3-4 Days)**
**Dependencies:** Phase 1 bridge schema system operational

#### **Entity Classification Implementation**
```typescript
class Pass1EntityDetector {
  async detectEntities(documentText: string, spatialData: BoundingBox[]): Promise<{
    entities: EntityDetectionResult[];
    categories: {
      clinical_event: number;
      healthcare_context: number;
      document_structure: number;
    };
    processingStrategy: Pass2ProcessingPlan;
  }>;
}
```

#### **Integration Points**
- **Input:** Complete document text + OCR spatial coordinates
- **Processing:** Single GPT-4o-mini call with 3-category taxonomy
- **Output:** Entity classification + Pass 2 schema loading instructions
- **Cost Target:** ~$0.0002-0.0005 per document

### **PHASE 3: Pass 2 Clinical Enrichment System (5-7 Days)**
**Dependencies:** Phase 1 + Phase 2 complete

#### **Clinical Data Extraction Implementation**
```typescript
class Pass2ClinicalEnrichment {
  async enrichClinicalData(
    entities: EntityDetectionResult[],
    schemas: BridgeSchema[],
    documentContext: DocumentContext
  ): Promise<{
    clinicalEvents: ClinicalEvent[];
    observations: Observation[];
    interventions: Intervention[];
    conditions: Condition[];
    databaseWrites: DatabaseWriteResult[];
  }>;
}
```

#### **Database Integration**
- **Multiple AI calls:** One per entity category detected in Pass 1
- **Dynamic schema application:** Use bridge schemas loaded based on Pass 1 results
- **V3 database writes:** Clinical data insertion with audit trails
- **Cost Target:** ~$0.003-0.006 per document

### **PHASE 4: Pass 3 Semantic Narratives System (4-5 Days)**
**Dependencies:** Phase 2 clinical data extraction operational

#### **Narrative Creation Implementation**
```typescript
class Pass3SemanticNarratives {
  async createClinicalNarratives(
    clinicalData: ClinicalData,
    shellFileId: string
  ): Promise<{
    narratives: ClinicalNarrative[];
    shellFileSynthesis: string;
    narrativeLinks: NarrativeLink[];
  }>;
}
```

#### **Narrative Enhancement**
- **Input:** Structured clinical data from Pass 2 (not raw document text)
- **Processing:** Clinical storyline creation with narrative coherence
- **Output:** Semantic narratives + shell file synthesis
- **Cost Target:** ~$0.001-0.003 per document (processes structured JSON)

### **PHASE 5: Integration & Testing (3-4 Days)**
**Dependencies:** All phases operational

#### **End-to-End Validation**
- **Real document processing:** Test with actual medical documents
- **Database verification:** Confirm clinical data appears in V3 tables
- **Performance testing:** Validate cost and timing targets
- **Error handling:** Test failure recovery and manual review triggers

---

## 🔧 **TECHNICAL IMPLEMENTATION DETAILS**

### **Worker Integration Points**
**File Location:** `current_workers/exora-v3-worker/src/worker.ts`
**Target Method:** `processShellFile()` (lines 204-238)

**Current State:**
```typescript
private async processShellFile(job: Job): Promise<any> {
  // TODO: Replace this entire method with three-pass processing
  await this.sleep(2000);
  return { status: 'completed' };
}
```

**Target Implementation:**
```typescript
private async processShellFile(job: Job): Promise<any> {
  const { shell_file_id, patient_id } = job.job_payload;

  // Step 1: Download file from Supabase Storage
  const fileData = await this.downloadShellFile(shell_file_id);

  // Step 2: Extract text with OCR (Google Cloud Vision)
  const ocrResult = await this.extractTextWithOCR(fileData);

  // Step 3: Pass 1 - Entity Detection
  const pass1Result = await this.pass1EntityDetector.detectEntities(
    ocrResult.text, ocrResult.spatialData
  );

  // Step 4: Load bridge schemas based on Pass 1 results
  const schemas = await this.schemaLoader.getSchemasForEntityCategories(
    pass1Result.categories
  );

  // Step 5: Pass 2 - Clinical Enrichment
  const pass2Result = await this.pass2ClinicalEnrichment.enrichClinicalData(
    pass1Result.entities, schemas, { shell_file_id, patient_id }
  );

  // Step 6: Pass 3 - Semantic Narratives (optional enhancement)
  const pass3Result = await this.pass3SemanticNarratives.createClinicalNarratives(
    pass2Result, shell_file_id
  );

  return {
    shell_file_id,
    status: 'completed',
    processing_summary: {
      entities_detected: pass1Result.entities.length,
      clinical_events_created: pass2Result.clinicalEvents.length,
      narratives_created: pass3Result.narratives.length
    }
  };
}
```

### **API Integration Requirements**
**OpenAI Integration:**
```typescript
// Pass 1: GPT-4o-mini for cost efficiency
const pass1Response = await openai.chat.completions.create({
  model: 'gpt-4o-mini',
  messages: [{ role: 'user', content: entityDetectionPrompt }],
  temperature: 0.1,
  max_tokens: 2000
});

// Pass 2 & 3: GPT-4 for medical accuracy
const pass2Response = await openai.chat.completions.create({
  model: 'gpt-4',
  messages: [{ role: 'user', content: clinicalEnrichmentPrompt }],
  temperature: 0.1,
  max_tokens: 4000
});
```

**Google Cloud Vision Integration:**
```typescript
const ocrResult = await googleVision.documentTextDetection({
  image: { content: fileBuffer },
  features: [{ type: 'DOCUMENT_TEXT_DETECTION' }]
});
```

---

## 📈 **SUCCESS METRICS & TARGETS**

### **Performance Targets**
- **Processing Time:** < 15 seconds per document end-to-end
- **Success Rate:** > 99% for valid medical documents
- **Cost Per Document:** < $0.007 average (85-90% reduction vs traditional)
- **Clinical Accuracy:** > 95% for structured medical data extraction

### **Quality Gates**
- **Pass 1:** > 90% accurate entity classification
- **Pass 2:** > 95% successful clinical data extraction
- **Pass 3:** > 90% narrative coherence scores
- **Database:** 100% successful writes to V3 tables

### **Business Impact**
- **Infrastructure Ready:** Operational worker and database
- **Cost Optimization:** Massive reduction vs traditional document processing
- **User Experience:** Rich clinical narratives with click-to-source functionality
- **Scalability:** Foundation for multi-document clinical journeys

---

## 🚨 **CRITICAL SUCCESS FACTORS**

### **Technical Requirements**
1. **Perfect V3 Database Alignment:** Bridge schemas must match deployed database exactly
2. **Token Budget Management:** Three-tier schema system for cost optimization
3. **Error Handling:** Graceful degradation and manual review triggers
4. **Healthcare Compliance:** Complete audit trails and PII protection

### **Implementation Priorities**
1. **Phase 1 is BLOCKING:** Cannot proceed with any AI processing without bridge schemas
2. **Incremental Testing:** Validate each phase before proceeding to next
3. **Real Document Validation:** Test with actual medical documents throughout
4. **Performance Monitoring:** Track cost and timing metrics from Phase 1

---

## 📅 **ESTIMATED TIMELINE**

**Total Estimated Duration:** 25-33 days for complete system

- **Phase 1.5:** 3 days (Database Cleanup - NEW URGENT PHASE)
- **Phase 1:** 7-10 days (Bridge Schema System - CRITICAL BLOCKER)
- **Phase 2:** 3-4 days (Pass 1 Entity Detection)
- **Phase 3:** 5-7 days (Pass 2 Clinical Enrichment)
- **Phase 4:** 4-5 days (Pass 3 Semantic Narratives)
- **Phase 5:** 3-4 days (Integration & Testing)

**Success Criteria:** Replace worker simulation code with real AI processing that writes clinical data to V3 database tables and creates meaningful medical narratives.

---

*This implementation plan builds a complete three-pass AI processing system from the ground up, aligned with the deployed V3 database foundation and operational infrastructure. The clean slate approach ensures perfect integration with current database schema while delivering cost-efficient, accurate medical document processing.*