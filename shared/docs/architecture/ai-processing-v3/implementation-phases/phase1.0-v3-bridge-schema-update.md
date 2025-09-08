# Phase 1.0: V3 Bridge Schema Update Implementation Plan

**Date**: 8 September 2025  
**Phase**: 1.0 - V3 Bridge Schema Update (CRITICAL PREREQUISITE)  
**Priority**: URGENT - Must complete before any AI processing  
**Estimated Time**: 7-10 days (expanded scope from V3 architecture analysis)  
**Status**: Architecture Cross-Reference Complete - Ready for Implementation  

---

## **EXECUTIVE SUMMARY**

**Critical Problem**: Current AI bridge schemas are incompatible with V3 architecture and three-pass AI processing system. Cross-reference with DATABASE_V3_ARCHITECTURE_OVERVIEW.md reveals **bridge schemas only cover 6 tables vs 27 V3 core processing tables**.

**Current State**: 
- ✅ V3 database operational (50+ tables with three-pass AI integration)
- ❌ Bridge schemas only cover 6 tables vs **27 tables required for complete V3 processing**
- ❌ **MISSING V3 Architecture**: shell_files, clinical_narratives, narrative linking system (7 tables)
- ❌ **MISSING Core Clinical**: patient_vitals, patient_medications, healthcare_encounters, patient_demographics
- ❌ **MISSING AI Infrastructure**: entity_processing_audit_v2, profile_classification_audit
- ❌ **MISSING Business Intelligence**: user_usage_tracking, subscription_plans, usage_events
- ❌ Three-pass AI system cannot function without proper bridge schema support

**Target State**:
- ✅ **Complete V3 bridge schema coverage**: 27 core tables across all three passes
- ✅ **Pass 1 entity detection**: Specialized entity classification schema
- ✅ **Pass 2 clinical enrichment**: Dynamic schema loading based on Pass 1 results  
- ✅ **Pass 3 semantic narratives**: Clinical narrative creation and linking schemas
- ✅ Three-tier system maintained: source → detailed → minimal for all 27 tables
- ✅ Australian healthcare compliance: PBS, Medicare, SNOMED integration

---

## **THE BRIDGE SCHEMA PROBLEM**

### **Current V2 Schema Issues**
From V3-IMPLEMENTATION_ROADMAP.md Section 2:

```typescript
// WRONG: Current bridge schemas target V2 tables
interface PatientMedicalDataV2 {  // ❌ Table doesn't exist in V3
  patient_id: string;             // ❌ References auth.users(id) not user_profiles(id) 
  // ... V2 structure
}
```

### **Required V3 Schema Structure**
Based on `current_schema/03_clinical_core.sql`:

```sql
-- V3 Reality: Actual database tables
CREATE TABLE patient_clinical_events (
  id UUID PRIMARY KEY,
  patient_id UUID REFERENCES user_profiles(id),  -- ✅ V3 correct reference
  shell_file_id UUID REFERENCES shell_files(id), -- ✅ V3 document tracking
  narrative_id UUID REFERENCES clinical_narratives(id), -- ✅ V3 semantic architecture
  -- ... V3 structure
);
```

### **Three-Pass AI Processing & Bridge Schema Integration**

**Pass 1: Entity Detection** 
- **Purpose**: Classify document entities into categories (clinical_event, healthcare_context, document_structure)
- **Bridge Schema**: Single entity classification prompt (not table-specific)
- **Output**: Entity categories → determines Pass 2 schema selection
- **No database writes**: Pure classification for Pass 2 preparation

**Pass 2: Clinical Enrichment** 
- **Purpose**: Extract structured clinical data using entity-specific schemas
- **Bridge Schema Loading**: Dynamic loading based on Pass 1 entity detection results
- **Schema Selection**: Load specific bridge schemas (patient_clinical_events, patient_observations, etc.)
- **Database Writes**: All clinical data insertion happens in Pass 2

**Pass 3: Semantic Narratives**
- **Purpose**: Retrospectively create clinical storylines spanning multiple entities
- **Bridge Schema Focus**: clinical_narratives + narrative linking system (7 tables: 1 core + 6 specialty)
- **Database Writes**: Narrative creation + linking narrative_*_links tables to existing Pass 2 data
- **Enhancement Layer**: Adds semantic intelligence on top of Pass 2 structured data

**Critical Integration Points**:
1. **Pass 1 → Pass 2**: Entity categories determine which bridge schemas to load for Pass 2
2. **Pass 2 → Pass 3**: Clinical events created in Pass 2 become inputs for Pass 3 narrative creation
3. **Pass 3 Enhancement**: Links narratives back to Pass 2 clinical data via narrative_*_links tables

---

## **INVESTIGATION RESULTS: BRIDGE SCHEMA ARCHITECTURE AUDIT**

### **Current Bridge Schema Inventory**

**Existing Structure** (`shared/docs/architecture/ai-processing-v3/bridge-schema-architecture/`):
```
bridge-schemas/
├── detailed/      (6 files) ✅ Complete tier
│   ├── medical_coding_standards.json
│   ├── patient_allergies.json
│   ├── patient_clinical_events.json
│   ├── patient_conditions.json
│   ├── patient_interventions.json
│   └── patient_observations.json
├── minimal/       (6 files) ✅ Complete tier  
│   └── [same 6 files as detailed]
└── source/        (4 files) ❌ INCOMPLETE TIER
    ├── medical_coding_standards.json
    ├── patient_clinical_events.json
    ├── patient_interventions.json
    ├── patient_observations.json
    ├── ❌ MISSING: patient_allergies.json  
    └── ❌ MISSING: patient_conditions.json
```

### **Three-Tier Bridge Schema System**

**Purpose and Design Philosophy**:
```typescript
interface BridgeSchemaThreetierSystem {
  source: {
    purpose: "Raw database field mappings for direct table insertion";
    content: "Minimal field definitions, data types, constraints only";
    use_case: "Final Pass 2 output validation before database insert";
    priority: "CRITICAL - Must match V3 database structure exactly";
  };
  
  detailed: {
    purpose: "Comprehensive AI processing with examples and validation";
    content: "Full field definitions + examples + medical coding + validation rules";  
    use_case: "Standard AI processing with rich context and examples";
    priority: "PRIMARY - Default for most AI processing scenarios";
  };
  
  minimal: {
    purpose: "Token-optimized processing for large documents"; 
    content: "Required fields only, concise descriptions";
    use_case: "High entity count documents (>100 entities) with token constraints";
    priority: "OPTIMIZATION - Fallback when token budget is constrained";
  };
}
```

**Token Budget Strategy**:
- **Detailed schemas**: ~200-400 tokens each (full medical context)
- **Minimal schemas**: ~50-100 tokens each (essentials only)  
- **Source schemas**: ~100-150 tokens each (database-focused)

### **V3 Architecture Cross-Reference: Bridge Schema Coverage Analysis**

**Complete V3 Three-Pass Processing Requirements** (Based on DATABASE_V3_ARCHITECTURE_OVERVIEW.md):

**PASS 1: Entity Detection Bridge Schema**
```typescript
// Single entity classification prompt (not table-specific)
entity_classification_prompt: {
  purpose: "Classify document entities into V3 categories",
  output: "Entity categories for Pass 2 schema selection",
  categories: ["clinical_event", "healthcare_context", "document_structure"]
}
```

**PASS 2: Clinical Enrichment Bridge Schemas (19 tables)**
```sql
-- ✅ EXISTING (6 tables):
patient_allergies           -- Safety-critical medical allergies  
patient_clinical_events     -- Central clinical hub (Master timeline)
patient_conditions          -- Medical diagnoses with status tracking
patient_interventions       -- Medications, procedures, treatments
patient_observations        -- Vital signs, lab results, assessments
medical_coding_standards    -- ICD-10/SNOMED reference

-- ❌ MISSING V3 Core Architecture (2 tables):
shell_files                 -- CRITICAL: Physical document containers
healthcare_encounters       -- Provider visit context and details

-- ❌ MISSING Specialized Clinical Context (6 tables):
patient_vitals              -- Detailed vital sign measurements with trends
patient_medications         -- Current medications with PBS codes (CRITICAL for AU)
patient_immunizations       -- Vaccination records and schedules
patient_demographics        -- Extended demographic data
healthcare_timeline_events  -- UI timeline display optimization
medication_reference        -- Drug database with Australian PBS integration

-- ❌ MISSING AI Processing Infrastructure (2 tables):
entity_processing_audit_v2  -- Pass 1-2 entity processing audit trail
profile_classification_audit -- Profile detection and safety validation

-- ❌ MISSING User Analytics & Business Intelligence (3 tables):
user_usage_tracking         -- Monthly usage metrics and billing cycles
subscription_plans          -- Plan configuration and pricing tiers
usage_events               -- Detailed usage analytics and audit trail
```

**PASS 3: Semantic Narratives Bridge Schemas (8 tables)**
```sql  
-- ❌ MISSING V3 Semantic Architecture (2 tables):
clinical_narratives         -- CRITICAL: AI-generated clinical storylines
narrative_source_mappings   -- Links narratives to non-contiguous document pages

-- ❌ MISSING Core Clinical Event Linking (1 table):
patient_clinical_events_linking -- CRITICAL: Update narrative_id in ALL clinical events

-- ❌ MISSING Clinical Narrative Linking System (5 tables):
narrative_condition_links   -- Links narratives to conditions ("click condition → see story")
narrative_medication_links  -- Links narratives to medications ("click medication → see context")
narrative_allergy_links    -- Links narratives to allergies ("click allergy → see discovery story")
narrative_immunization_links -- Links narratives to vaccines ("click vaccine → see clinical context")
narrative_vital_links      -- Links narratives to vital patterns ("click vitals → see meaning")
```

**Total Bridge Schema Requirement: 27 tables (vs current 6 tables = 22% coverage)**

**Entity-to-Schema Mapping Issues**:
The `schema_loader.ts` has hardcoded mappings to tables without bridge schemas:
```typescript
// From schema_loader.ts - BROKEN MAPPINGS:
['clinical_event', [
  'patient_immunizations'        // ❌ NO bridge schema exists
]],
['healthcare_context', [
  'healthcare_encounters',       // ❌ NO bridge schema exists
  'patient_imaging_reports',     // ❌ Table doesn't exist in V3?
  'healthcare_provider_context'  // ❌ NO bridge schema exists  
]]
```

### **Transition Strategy: Tier Management During V3 Update**

**Option A: Preserve All Tiers** (RECOMMENDED):
- ✅ Maintains existing architecture philosophy
- ✅ Allows parallel updates across all tiers  
- ✅ Preserves token optimization capabilities
- ❌ Requires maintaining consistency across 3 versions per schema

**Option B: Temporary Tier Reduction** (CONSIDERED BUT NOT RECOMMENDED):
- ❌ Loses token optimization during critical transition period
- ❌ Breaks existing schema_loader.ts architecture
- ❌ Requires rebuilding tiered system after V3 updates
- ✅ Simpler to maintain during transition

**DECISION**: Keep all tiers but implement **systematic update approach**:
1. **Phase 1A**: Fix source tier completeness (add missing files)
2. **Phase 1B**: Add new V3 table schemas to source tier first  
3. **Phase 1C**: Systematically expand to detailed and minimal tiers
4. **Phase 1D**: Validate consistency across all tiers

### **Immediate Action Items from Investigation**

**Critical Fixes Required**:
1. **Complete Source Tier**: Add missing `patient_allergies.json` and `patient_conditions.json` to source/
2. **Add V3 Critical Tables**: Create bridge schemas for `shell_files` and `clinical_narratives` (blocking V3 processing)
3. **Fix Schema Loader Mappings**: Update entity-to-schema mappings to match available bridge schemas
4. **Expand Core Clinical Coverage**: Add bridge schemas for `patient_vitals`, `patient_medications`, `patient_immunizations`, `healthcare_encounters`

---

## **PHASED IMPLEMENTATION STRATEGY**

**Expanded Scope Impact**: 27 bridge schemas required (vs original 13) based on V3 architecture cross-reference + universal click-to-narrative UX requirements
**Timeline**: 7-10 days phased implementation to manage complexity

### **PHASE 1.0A: Three-Pass AI Architecture Foundation** (Days 1-2)
**Purpose**: Enable basic three-pass AI processing with core V3 architecture
**Priority**: CRITICAL - Blocking all AI processing

**Pass 1 Entity Detection Schema**:
```typescript  
// Single entity classification prompt (not table-specific)
entity_classification_schema: {
  categories: ["clinical_event", "healthcare_context", "document_structure"],
  output_format: "EntityCategory[]",
  token_budget: "~200 tokens"
}
```

**Critical V3 Architecture Tables**:
```typescript
// IMMEDIATE BLOCKERS - V3 Core Architecture:
'shell_files'                   // CRITICAL: Physical document containers (Pass 2)
'clinical_narratives'           // CRITICAL: Pass 3 semantic storylines
'narrative_source_mappings'     // CRITICAL: Links narratives to document pages

// SOURCE TIER COMPLETION:
'patient_allergies'            // Missing source/patient_allergies.json  
'patient_conditions'           // Missing source/patient_conditions.json
```

**Implementation Tasks**:
- [ ] Create Pass 1 entity classification prompt schema
- [ ] Create shell_files bridge schemas (source/detailed/minimal) 
- [ ] Create clinical_narratives bridge schemas (source/detailed/minimal)
- [ ] Create narrative_source_mappings bridge schemas (source/detailed/minimal)
- [ ] Fix source tier gaps: patient_allergies.json, patient_conditions.json
- [ ] Update schema_loader.ts for Pass 1→Pass 2 integration

**Success Criteria**: Three-pass AI system can initialize and Pass 1→Pass 2→Pass 3 flow functional

---

### **PHASE 1.0B: Pass 2 Core Clinical Enrichment Schemas** (Days 3-4)
**Purpose**: Complete Pass 2 clinical data extraction with specialized clinical context
**Priority**: HIGH - Essential for clinical data extraction

**Pass 2 Core Clinical Tables**:
```typescript
// V3 SPECIALIZED CLINICAL CONTEXT (6 tables):
'patient_vitals'               // Detailed vital sign measurements with trends
'patient_medications'          // Current medications with Australian PBS codes  
'patient_immunizations'        // Vaccination records and schedules
'patient_demographics'         // Extended demographic data
'healthcare_encounters'        // Provider visit context and details
'healthcare_timeline_events'   // UI timeline display optimization

// REFERENCE DATA (1 table):
'medication_reference'         // Drug database with Australian PBS integration
```

**Implementation Tasks**:
- [ ] Extract exact field structures from V3 database schema files
- [ ] Create bridge schemas for all 7 tables (source/detailed/minimal)
- [ ] Integrate Australian healthcare standards (PBS codes, Medicare items)
- [ ] Map entity categories to target tables for dynamic loading
- [ ] Update schema_loader.ts entity-to-schema mappings
- [ ] Implement Pass 2 clinical enrichment workflow integration

**Success Criteria**: Pass 2 can extract complete clinical data to V3 specialized tables

---

### **PHASE 1.0C: Pass 3 Semantic Narrative Schemas** (Days 5-6)
**Purpose**: Complete Pass 3 semantic narrative creation and clinical storyline linking
**Priority**: HIGH - V3 Semantic Architecture & Universal Click-to-Narrative UX

**Pass 3 Semantic Architecture Tables**:
```typescript
// CORE CLINICAL EVENT LINKING (1 table):
'patient_clinical_events_linking' // CRITICAL: Update narrative_id in ALL clinical events (universal UX)

// CLINICAL NARRATIVE LINKING SYSTEM (5 tables):
'narrative_condition_links'    // Links narratives to conditions ("click condition → see story")
'narrative_medication_links'   // Links narratives to medications ("click medication → see context")
'narrative_allergy_links'     // Links narratives to allergies ("click allergy → see discovery story")
'narrative_immunization_links' // Links narratives to vaccines ("click vaccine → see clinical context")
'narrative_vital_links'       // Links narratives to vital patterns ("click vitals → see meaning")
```

**Implementation Tasks**:
- [ ] Create core clinical event linking bridge schema (patient_clinical_events_linking)
- [ ] Create bridge schemas for all 5 narrative linking tables (source/detailed/minimal)
- [ ] Design Pass 3 retrospective linking workflow with universal coverage
- [ ] Implement narrative-to-clinical-data relationship mapping (both core and specialty)
- [ ] Create Pass 3 semantic processing integration points
- [ ] Develop clinical storyline creation bridge schemas
- [ ] Test universal "click any clinical data → see story" UX integration

**Critical UX Requirement**: Every clinical event identified by Pass 1 must receive narrative_id link for universal click-to-narrative functionality

**Success Criteria**: Pass 3 can create clinical narratives and link them to ALL existing Pass 2 data (core events + specialty contexts)

---

### **PHASE 1.0D: AI Processing Infrastructure & Analytics** (Days 7-8)
**Purpose**: Complete AI processing audit trails and business intelligence integration
**Priority**: MEDIUM - Operational monitoring and business intelligence

**AI Processing Infrastructure Tables**:
```typescript
// AI PROCESSING AUDIT INFRASTRUCTURE (2 tables):
'entity_processing_audit_v2'   // Pass 1-2 entity processing audit trail
'profile_classification_audit' // Profile detection and safety validation

// USER ANALYTICS & BUSINESS INTELLIGENCE (3 tables):
'user_usage_tracking'          // Monthly usage metrics and billing cycles
'subscription_plans'           // Plan configuration and pricing tiers  
'usage_events'                 // Detailed usage analytics and audit trail
```

**Implementation Tasks**:
- [ ] Create AI processing audit bridge schemas (source/detailed/minimal)
- [ ] Create user analytics bridge schemas for business intelligence
- [ ] Implement subscription and billing workflow integration
- [ ] Design AI processing provenance tracking
- [ ] Create comprehensive audit trail bridge schemas
- [ ] Integrate with V3 business analytics system

**Success Criteria**: Complete AI processing audit trail and business intelligence integration

---

### **PHASE 1.0E: V2→V3 Existing Schema Migration** (Day 9)
**Purpose**: Line-by-line validation and update of existing V2 bridge schemas for V3 compatibility
**Priority**: CRITICAL - Prevents V2→V3 compatibility failures in production

**The V2→V3 Bridge Schema Problem**:
The existing 6 bridge schemas were designed for V2 architecture and **cannot be assumed to work with V3**. Each schema requires line-by-line validation and updates for:
- V3 database field structures and constraints
- V3 foreign key references (patient_id → user_profiles, not auth.users)
- V3 semantic architecture fields (shell_file_id, narrative_id)
- Australian healthcare standards integration
- V3 AI processing metadata requirements

**Schema-by-Schema V3 Migration Tasks**:
```typescript
EXISTING SCHEMAS REQUIRING COMPLETE V3 VALIDATION:
1. patient_clinical_events.json    // V3 O3 two-axis system + shell_file_id + narrative_id
2. patient_observations.json       // V3 central hub linkage + shell_file_id 
3. patient_interventions.json      // V3 central hub linkage + shell_file_id
4. patient_conditions.json         // V3 status tracking + shell_file_id + narrative_id
5. patient_allergies.json          // V3 safety integration + shell_file_id + narrative_id
6. medical_coding_standards.json   // Australian healthcare codes (PBS, Medicare)
```

**Critical V3 Field Additions Required**:
- `shell_file_id: UUID` - MANDATORY for V3 document tracking
- `narrative_id?: UUID` - Optional for Pass 3 semantic linking  
- `patient_id: UUID` - Must reference user_profiles(id) not auth.users(id)
- `processing_job_id?: UUID` - V3 job coordination integration
- `ai_extracted: boolean` - V3 AI processing provenance
- `confidence_score: number` - V3 AI confidence tracking

**Validation Process**:
- [ ] Compare each existing schema field-by-field against V3 database tables
- [ ] Add missing V3 critical fields to all existing schemas
- [ ] Update foreign key references to V3 architecture
- [ ] Test schema compatibility with V3 database constraints
- [ ] Validate three-tier consistency (source/detailed/minimal) for existing schemas

**Success Criteria**: All 6 existing bridge schemas fully migrated to V3 with zero compatibility failures

---

### **PHASE 1.0F: Three-Tier Validation & Integration Testing** (Day 10)
**Purpose**: Validate consistency across all bridge schema tiers and test complete system
**Priority**: CRITICAL - Quality assurance and system validation

**Three-Tier Validation Tasks**:
- [ ] Validate source/detailed/minimal consistency across all 27 bridge schemas
- [ ] Test Pass 1 entity detection → Pass 2 schema selection workflow
- [ ] Test Pass 2 clinical enrichment → V3 database integration
- [ ] Test Pass 3 semantic narrative creation → narrative linking system
- [ ] Validate Australian healthcare field integration (PBS, Medicare, SNOMED)
- [ ] Performance testing: schema loading within token budget constraints
- [ ] Cross-reference all bridge schemas against V3 database table structures

**Integration Testing**:
- [ ] End-to-end three-pass AI processing with complete bridge schema coverage
- [ ] Validate no broken entity-to-schema mappings in schema_loader.ts
- [ ] Test complete V3 clinical data flow from document upload to narrative creation
- [ ] Validate business intelligence and analytics data collection

**Success Criteria**: Complete 27-table bridge schema system operational with three-pass AI integration

---

## **UPDATED ENTITY CATEGORY TO SCHEMA MAPPING**

**Pass 1: Entity Detection Mapping**
```typescript
// Single AI call for entity classification
interface Pass1EntityDetection {
  input: "Complete document text";
  output: {
    clinical_event_entities: number;      // Count of clinical events detected
    healthcare_context_entities: number; // Count of healthcare context detected  
    document_structure_entities: number; // Count of document structure detected
  };
  determines_pass2_schemas: true; // Output determines Pass 2 schema loading
}
```

**Pass 2: Clinical Enrichment Mapping** (Multiple AI Calls)
```typescript
interface Pass2ClinicalEnrichment {
  // CLINICAL EVENT ENTITIES → Core Clinical Hub + Specialized Tables
  clinical_event: {
    core_schemas: [
      'patient_clinical_events',     // Always created (central hub)
      'shell_files'                 // Always updated (document metadata)
    ],
    specialized_schemas: [
      'patient_observations',       // If vital signs/lab results detected
      'patient_interventions',      // If medications/procedures detected
      'patient_conditions',         // If diagnoses detected  
      'patient_allergies',         // If allergies detected
      'patient_vitals',           // If vital measurements detected
      'patient_medications',       // If prescriptions detected
      'patient_immunizations',     // If vaccines detected
      'healthcare_timeline_events' // UI display optimization
    ],
    processing_priority: 'high',
    ai_calls_required: 'multiple' // One per detected specialized context
  },
  
  // HEALTHCARE CONTEXT ENTITIES → Visit and Provider Context
  healthcare_context: {
    target_schemas: [
      'healthcare_encounters',     // Provider visit context
      'patient_demographics',      // Patient demographic updates
      'medication_reference'       // Drug database lookups
    ],
    processing_priority: 'medium',
    ai_calls_required: 'single'   // Consolidated context extraction
  },
  
  // DOCUMENT STRUCTURE ENTITIES → No Pass 2 Processing  
  document_structure: {
    target_schemas: [],            // Skip Pass 2 entirely
    processing_priority: 'low',
    pass2_required: false,         // Audit logging only
    ai_calls_required: 'none'
  }
}
```

**Pass 3: Semantic Narratives** (Independent AI Calls)
```typescript
interface Pass3SemanticNarratives {
  purpose: "Retrospectively create clinical storylines from Pass 2 data";
  input: "All clinical events from Pass 2 for a single shell file";
  
  narrative_creation: {
    primary_schema: 'clinical_narratives', // AI-generated storylines
    support_schema: 'narrative_source_mappings' // Page range mapping
  },
  
  narrative_linking: {
    // Links narratives back to Pass 2 clinical data (UNIVERSAL + SPECIALTY)
    core_linking_schema: 'patient_clinical_events_linking', // CRITICAL: Update narrative_id in ALL clinical events
    specialty_linking_schemas: [
      'narrative_condition_links',    // Link stories to conditions (rich context)
      'narrative_medication_links',   // Link stories to medications (rich context)
      'narrative_allergy_links',     // Link stories to allergies (rich context)
      'narrative_immunization_links', // Link stories to vaccines (rich context)
      'narrative_vital_links'        // Link stories to vital patterns (rich context)
    ]
  },
  
  processing_mode: 'retrospective', // Processes existing Pass 2 data
  ai_calls_required: 'multiple',    // One for creation + one for core linking + one per specialty linking
  enhances_ux: true,               // Enables universal "click ANY clinical data → see story" UX
  universal_coverage: true         // EVERY clinical event gets narrative link via narrative_id
}
```

**Implementation**:
- [ ] Create entity-to-schema mapping configuration
- [ ] Define processing priority rules
- [ ] Implement schema loading logic based on detected entities
- [ ] Add fallback handling for unknown entity types

---

### **Task 1.0.4: V3 Bridge Schema Creation**
**Purpose**: Create bridge schemas for all V3 tables that align perfectly with database structure

**Critical V3 Bridge Schema Requirements**:
```typescript
// All V3 bridge schemas must include these critical fields:
interface V3BridgeSchemaBase {
  patient_id: string;           // UUID → user_profiles(id) (V3 correction)
  shell_file_id: string;        // UUID → shell_files(id) (V3 requirement)  
  narrative_id?: string;        // UUID → clinical_narratives(id) (V3 semantic)
  confidence_score: number;     // AI extraction confidence 0.0-1.0
  processing_job_id?: string;   // V3 job coordination
  ai_extracted: boolean;        // V3 AI processing provenance
}
```

**Australian Healthcare Integration**:
- PBS codes, Medicare item numbers for medications/procedures
- SNOMED-CT, LOINC, ICD-10, CPT medical coding standards
- Pathology provider references for lab results

**Schema Creation Process**:
1. Extract exact field structures from V3 database SQL files  
2. Map V3 foreign key relationships and constraints
3. Add Australian healthcare compliance fields
4. Create three-tier versions (source/detailed/minimal)
5. Validate against actual V3 database structure

---

### **Task 1.0.5: Schema Versioning System**  
**Purpose**: Create minimal/detailed/source versions for token optimization

**Schema Version Strategy**:
```typescript
interface SchemaVersioning {
  minimal: {
    purpose: 'Token optimization for large documents';
    fields: 'Required fields only';
    use_case: 'High entity count documents (>100 entities)';
  };
  detailed: {
    purpose: 'Complete clinical data extraction';
    fields: 'Required + optional + Australian healthcare fields'; 
    use_case: 'Standard processing (default)';
  };
  source: {
    purpose: 'Maximum medical coding and clinical context';
    fields: 'All fields including spatial coordinates and medical coding';
    use_case: 'Complex clinical documents requiring full context';
  };
}

// Example implementation
export class V3BridgeSchemaLoader {
  async getSchema(
    tableName: string, 
    version: 'minimal' | 'detailed' | 'source' = 'detailed'
  ): Promise<BridgeSchemaDefinition> {
    
    const baseSchema = await this.loadBaseSchema(tableName);
    
    switch (version) {
      case 'minimal':
        return this.createMinimalSchema(baseSchema);
      case 'detailed': 
        return this.createDetailedSchema(baseSchema);
      case 'source':
        return this.createSourceSchema(baseSchema);
      default:
        return this.createDetailedSchema(baseSchema);
    }
  }
  
  // Estimate token usage for schema selection
  estimateTokens(schema: BridgeSchemaDefinition): number {
    // Calculate token usage based on field count and description length
    return schema.fields.length * 15 + schema.description.length / 4;
  }
}
```

---

### **Task 1.0.6: Dynamic Schema Loading Implementation**
**Purpose**: Create system that loads appropriate schemas based on Pass 1 entity detection

**Core Schema Loading Requirements**:
- **Entity-based loading**: Pass 1 entity categories determine which schemas to load
- **Token budget management**: Automatic tier selection (detailed→minimal) based on budget
- **Schema caching**: Performance optimization for repeated loads
- **Priority-based loading**: Critical schemas loaded first within budget constraints

**Key Implementation Points**:
1. Map entity categories to target bridge schemas
2. Implement token estimation and budget management  
3. Create fallback logic (detailed→minimal when budget constrained)
4. Integrate with existing schema_loader.ts architecture
5. Add performance monitoring and caching

---

### **Task 1.0.7: Pass 1 → Pass 2 Integration**
**Purpose**: Integrate bridge schema loading into Pass 1 → Pass 2 workflow

**Integration Requirements**:
- **Pass 1 enhancement**: Add bridge schema preparation to entity detection results
- **Pass 2 enhancement**: Use pre-loaded schemas for AI prompt construction
- **Token coordination**: Ensure Pass 1 + Pass 2 stay within combined budget
- **Error handling**: Graceful fallback when schema loading fails

**Critical Integration Points**:
1. Pass 1 loads appropriate bridge schemas based on detected entities
2. Bridge schemas passed to Pass 2 with entity detection results
3. Pass 2 constructs AI prompts using bridge schema structures
4. AI responses parsed and validated against bridge schema requirements
5. Database insertion uses bridge schema to V3 table mapping

---

## **TESTING STRATEGY**

### **Schema Validation Tests**
- [ ] Each bridge schema matches V3 table structure exactly
- [ ] Required fields validation  
- [ ] Foreign key reference validation
- [ ] Data type compatibility testing

### **Integration Tests** 
- [ ] Pass 1 entity detection → bridge schema selection
- [ ] Bridge schema loading with different entity combinations
- [ ] Token budget management and schema version selection
- [ ] Pass 2 output validation against bridge schemas

### **Database Compatibility Tests**
- [ ] AI output successfully inserts into V3 tables
- [ ] Foreign key constraints satisfied
- [ ] No data truncation or type conversion errors
- [ ] Australian healthcare fields properly populated

---

## **SUCCESS CRITERIA**

### **Functional Requirements**
- [ ] All V3 core tables have corresponding bridge schemas
- [ ] Entity categories correctly map to target tables  
- [ ] Dynamic schema loading based on detected entities
- [ ] Schema versioning system operational (minimal/detailed/source)
- [ ] Pass 1 → Pass 2 integration with bridge schemas

### **Performance Requirements**  
- [ ] Schema loading: < 500ms for typical entity combinations
- [ ] Token optimization: Schema selection stays within budget
- [ ] Memory efficiency: Schema caching prevents repeated loads

### **Quality Requirements**
- [ ] 100% compatibility with V3 database structure
- [ ] All required fields documented and validated
- [ ] Australian healthcare fields properly integrated
- [ ] Medical coding standards supported (ICD-10, SNOMED, PBS, Medicare)

---

## **RISK MITIGATION**

### **Technical Risks**
- **Schema-database mismatch**: Automated testing against real V3 tables  
- **Token budget overflow**: Dynamic version selection and fallback to minimal
- **Complex entity combinations**: Comprehensive testing matrix
- **Performance degradation**: Schema caching and optimization

### **Medical Data Risks**
- **Missing required clinical fields**: Validation rules and manual review flags
- **Incorrect medical coding**: Cross-reference with Australian healthcare standards
- **Data integrity**: Foreign key validation and constraint checking  

---

## **DELIVERABLES**

### **Phase 1.0 Comprehensive Deliverables** 

**Complete V3 Three-Pass AI Bridge Schema System (27 Tables)**:

**PHASE 1.0A: Three-Pass AI Architecture Foundation** (Days 1-2):
```
bridge-schemas/
├── pass1/
│   └── entity_classification_schema.json    // Single entity detection prompt
├── source/        (5 files) - V3 architecture foundation
├── detailed/      (5 files) - Complete contexts
└── minimal/       (5 files) - Token-optimized

CORE V3 ARCHITECTURE:
- shell_files.json                 (all 3 tiers) ✅ Document containers  
- clinical_narratives.json         (all 3 tiers) ✅ Pass 3 storylines
- narrative_source_mappings.json   (all 3 tiers) ✅ Page range mapping
- patient_allergies.json           (source tier fix) ✅ Missing file added
- patient_conditions.json          (source tier fix) ✅ Missing file added
```

**PHASE 1.0B: Pass 2 Core Clinical Schemas** (Days 3-4):
```
SPECIALIZED CLINICAL CONTEXT (7 new tables):
- patient_vitals.json              (all 3 tiers) ✅ Vital measurements
- patient_medications.json         (all 3 tiers) ✅ PBS-integrated prescriptions
- patient_immunizations.json       (all 3 tiers) ✅ Vaccination records
- patient_demographics.json        (all 3 tiers) ✅ Extended demographics
- healthcare_encounters.json       (all 3 tiers) ✅ Provider visit context
- healthcare_timeline_events.json  (all 3 tiers) ✅ UI timeline optimization
- medication_reference.json        (all 3 tiers) ✅ Australian drug database
```

**PHASE 1.0C: Pass 3 Semantic Narrative Schemas** (Days 5-6):
```
CORE CLINICAL EVENT LINKING (1 new table):
- patient_clinical_events_linking.json (all 3 tiers) ✅ Universal click-to-narrative UX

CLINICAL NARRATIVE LINKING SYSTEM (5 new tables):
- narrative_condition_links.json   (all 3 tiers) ✅ Condition storylines  
- narrative_medication_links.json  (all 3 tiers) ✅ Medication contexts
- narrative_allergy_links.json     (all 3 tiers) ✅ Allergy discovery stories
- narrative_immunization_links.json (all 3 tiers) ✅ Vaccine clinical contexts
- narrative_vital_links.json       (all 3 tiers) ✅ Vital sign interpretations
```

**PHASE 1.0D: Infrastructure & Business Intelligence** (Days 7-8):
```
AI PROCESSING INFRASTRUCTURE (2 new tables):
- entity_processing_audit_v2.json  (all 3 tiers) ✅ Pass 1-2 audit trails
- profile_classification_audit.json (all 3 tiers) ✅ Profile safety validation

BUSINESS INTELLIGENCE (3 new tables):  
- user_usage_tracking.json         (all 3 tiers) ✅ Monthly usage metrics
- subscription_plans.json          (all 3 tiers) ✅ Plan configurations
- usage_events.json               (all 3 tiers) ✅ Behavioral analytics
```

**PHASE 1.0E: V2→V3 Existing Schema Migration** (Day 9):
```
CRITICAL V2→V3 MIGRATION (6 existing schemas):
- patient_clinical_events.json     (V3 field additions) ✅ V3 O3 system + shell_file_id
- patient_observations.json        (V3 field additions) ✅ V3 linkage + shell_file_id
- patient_interventions.json       (V3 field additions) ✅ V3 linkage + shell_file_id  
- patient_conditions.json          (V3 field additions) ✅ V3 status + shell_file_id
- patient_allergies.json           (V3 field additions) ✅ V3 safety + shell_file_id
- medical_coding_standards.json    (Australian standards) ✅ PBS + Medicare integration

LINE-BY-LINE VALIDATION REQUIRED: 
- Shell_file_id field addition across all schemas
- Patient_id reference corrections (user_profiles vs auth.users)
- V3 AI processing metadata additions
- Australian healthcare field integration
```

**PHASE 1.0F: System Integration** (Day 10):
- ✅ **Complete 27-table bridge schema system** operational
- ✅ **Three-pass AI integration**: Pass 1 → Pass 2 → Pass 3 workflow
- ✅ **Universal click-to-narrative UX**: Every clinical event linked to narratives
- ✅ **Enhanced schema_loader.ts**: V3-aligned entity mappings with three-pass support  
- ✅ **Australian healthcare compliance**: PBS, Medicare, SNOMED integration
- ✅ **Business intelligence integration**: Usage tracking and subscription management
- ✅ **Three-tier consistency validation**: source/detailed/minimal across all 27 tables
- ✅ **Performance optimization**: Token budget management and automatic tier selection

**Final Architecture**:
```
TOTAL BRIDGE SCHEMAS: 27 tables × 3 tiers = 81 schema files
├── Pass 1: 1 entity classification schema
├── Pass 2: 19 clinical enrichment schemas (existing 6 + new 13)  
├── Pass 3: 7 semantic narrative schemas (6 specialty + 1 core linking)
└── Infrastructure: 5 audit and analytics schemas

COVERAGE: 100% of V3 core processing architecture
INTEGRATION: Complete three-pass AI processing support + universal click-to-narrative UX
COMPLIANCE: Australian healthcare standards integrated
UX CAPABILITY: Click ANY clinical data point → see narrative story
```

---

## **DEPLOYMENT PLAN**

### **Phase 1.0 Rollout**
1. **Development**: Create all bridge schemas and loading system
2. **Testing**: Validate against V3 database tables
3. **Integration**: Connect to Pass 1 and Pass 2 systems
4. **Validation**: End-to-end testing with real medical documents

### **Quality Gates**
- All bridge schemas pass database compatibility tests
- Schema loading system handles all entity category combinations
- Token optimization stays within budget constraints  
- Performance targets met for schema loading operations

---

## **SUMMARY: COMPREHENSIVE V3 BRIDGE SCHEMA ARCHITECTURE UPDATE**

**Critical Investigation Findings**:
- **Original scope severely underestimated**: 6 tables vs **27 core V3 processing tables required**
- **Three-pass AI system needs specialized bridge schema support**: Pass 1 entity detection, Pass 2 clinical enrichment, Pass 3 semantic narratives
- **V3 semantic architecture missing entirely**: Clinical narrative linking system (7 tables) not covered
- **Universal click-to-narrative UX missing**: Core clinical events need narrative_id linking for complete user experience
- **Business intelligence integration required**: Usage tracking and subscription management (3 tables)
- **Australian healthcare compliance gaps**: PBS codes, Medicare items, medication reference database

**Comprehensive Three-Pass AI Bridge Schema Strategy**:
- **PASS 1**: Single entity classification schema (not table-specific)
- **PASS 2**: Dynamic schema loading based on Pass 1 results (19 clinical tables)  
- **PASS 3**: Semantic narrative creation and retrospective linking (7 narrative tables: 1 core + 6 specialty)
- **INFRASTRUCTURE**: AI processing audit and business intelligence (5 support tables)
- **MAINTAIN**: Complete three-tier system (source/detailed/minimal) across all 27 tables

**Dramatic Scope Expansion Impact**:
- **Original scope**: 6 bridge schemas → **Final scope**: 27 bridge schemas (450% increase)
- **Original timeline**: 2-3 days → **New timeline**: 7-10 days (phased implementation required)
- **Critical path**: V3 architecture foundation → Core clinical → Semantic narratives → Infrastructure
- **Total deliverable**: 81 schema files (27 tables × 3 tiers) + Pass 1 entity detection

**Phased Implementation Approach**:
- **Phase 1.0A** (Days 1-2): Three-pass AI architecture foundation + source tier fixes
- **Phase 1.0B** (Days 3-4): Pass 2 core clinical enrichment schemas  
- **Phase 1.0C** (Days 5-6): Pass 3 semantic narrative and linking schemas
- **Phase 1.0D** (Days 7-8): AI processing infrastructure and business intelligence
- **Phase 1.0E** (Day 9): **V2→V3 existing schema migration and validation**
- **Phase 1.0F** (Day 10): Three-tier validation and complete system integration

---

**Status**: COMPREHENSIVE ARCHITECTURE PLANNING COMPLETE - Ready for Phased Implementation
**Next Phase Dependencies**: Phase 1.1 AI processing completely blocked until Phase 1.0 delivers complete 27-table bridge schema system  
**Final Estimated Completion**: 7-10 days (dramatically expanded from 2-3 days due to V3 architecture cross-reference)
**Critical Success Factors**: 
- **Complete V3 coverage**: 27 core processing tables with bridge schema support
- **Three-pass AI integration**: Pass 1 entity detection → Pass 2 clinical enrichment → Pass 3 semantic narratives
- **Universal click-to-narrative UX**: Every clinical data point can show its narrative story when clicked
- **Australian healthcare compliance**: PBS, Medicare, SNOMED integration across all clinical tables
- **Business intelligence operational**: Usage tracking, subscription management, and audit trail systems
- **Three-tier consistency**: source/detailed/minimal maintained across all 27 tables for token optimization