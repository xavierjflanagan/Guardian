# Semantic Document Architecture: Shell Files and Clinical Narratives

**Created:** 2025-08-27  
**Status:** Architectural Decision Document  
**Purpose:** Define the semantic document segmentation approach for multi-document file uploads  

## Executive Summary

We discovered a critical architectural flaw: the current system assumes **1 uploaded file = 1 medical document**, when reality shows **1 uploaded file = potentially multiple distinct clinical narratives**. This document outlines our revolutionary solution: **semantic segmentation based on clinical meaning rather than physical document structure**.

## The Core Problem

### Current Architecture Assumption (WRONG)
```
User uploads file → 1 document_id → 1 ai_document_summary → Timeline confusion
```

### Reality (CRITICAL ISSUE)
```
User uploads file → Multiple distinct medical contexts → Clinical safety risk
```

**Example Failure:** 10-page file with 2 discharge summaries creates mixed document intelligence:
- Summary: "Patient had cardiac surgery followed by orthopedic surgery with medication changes"
- **Dangerous:** User can't distinguish which medications from which hospitalization
- **Timeline Chaos:** Clinical events attributed to wrong medical episode

## Document Upload Scenarios Analysis

### Scenario 1: Heterogeneous Multi-Document (Easy Detection)
**Characteristics:**
- Multiple different providers/facilities
- Different letterheads, logos, formatting
- Visual discontinuities (photos vs typed text)
- Clear formatting boundaries

**Examples:**
- Patient bundles loose documents: hospital discharge + clinic visit + lab results + prescription photos
- Insurance claim compilation from multiple providers
- Care coordination bundle from different specialists

**Detection Signals:**
- ✅ Document structure changes (headers/footers/logos)
- ✅ Formatting shifts (fonts, layouts)
- ✅ Provider/facility name changes
- ✅ Date discontinuities with large temporal gaps

### Scenario 2: Homogeneous Multi-Document (Hard Detection)
**Characteristics:**
- Same clinic/hospital system
- Consistent formatting and templates
- Sequential content over time
- Subtle content boundaries

**Examples:**
- GP clinic patient summary: 20 pages, sequential visits, same template
- Hospital system printout: Multiple admissions, consistent formatting
- Lab network results: Multiple test dates, same lab company format

**Detection Challenges:**
- ❌ Document structure analysis ineffective (all same formatting)
- ✅ Content topic shifts ("Visit Summary 1", "Visit Summary 2")
- ✅ Temporal clustering and visit sequences
- ✅ Provider signature changes within same clinic
- ✅ Section header patterns from clinic software

### Scenario 3: Embedded Sub-Documents
**Examples:**
- Referral letter containing embedded lab results
- Discharge summary with attached imaging reports
- Insurance authorization with medical history attachment

### Scenario 4: Mixed Administrative and Clinical Content
**Examples:**
- Random medication list photo inserted in discharge summary bundle
- Insurance cards mixed with medical records
- Administrative forms bundled with clinical notes

## The Revolutionary Solution: Semantic Architecture

### Core Insight: Meaning Over Structure
**Traditional Approach (WRONG):** Segment by where things are (pages, formatting)  
**Our Approach (RIGHT):** Segment by what things mean (clinical purpose, narrative coherence)

### Architectural Components

#### 1. Shell Files (Physical Layer)
**Definition:** The actual uploaded file - the physical container
**Naming:** Keep "shell file" - it IS a file, it's the protective shell containing clinical content

```sql
shell_files (
    shell_file_id UUID,
    original_filename TEXT,
    file_size_bytes BIGINT,
    storage_path TEXT,
    upload_timestamp TIMESTAMPTZ
)
```

#### 2. Clinical Narratives (Semantic Layer)
**Definition:** AI-determined clinical storylines based on medical meaning, not physical location  
**Alternative Names Considered:**
- ✅ **Clinical Narratives** - Medical storylines with coherent meaning
- ✅ **Clinical Streams** - Flowing sequences of related medical events  
- ✅ **Clinical Themes** - Unified medical purposes or conditions
- ✅ **Care Episodes** - Distinct episodes of medical care
- ❌ ~~Core Files~~ - Not actually files, misleading terminology

**Chosen Term:** **Clinical Narratives** - Best represents semantic medical storylines

```sql
clinical_narratives (
    narrative_id UUID,
    shell_file_id UUID, -- Parent relationship
    narrative_purpose TEXT, -- "hypertension_management", "acute_respiratory_episode"
    clinical_classification TEXT, -- "chronic_condition_journey", "acute_care_episode"
    semantic_coherence_score NUMERIC(3,2),
    
    -- AI-Generated Narrative Intelligence
    ai_narrative_summary TEXT, -- Clinically coherent summary
    ai_narrative_purpose TEXT,
    ai_key_findings TEXT[],
    ai_narrative_confidence NUMERIC(3,2),
    
    -- Physical mapping (can be non-contiguous!)
    source_page_ranges INT[], -- [1, 4, 8, 12] - spans multiple non-adjacent pages
    entity_count INTEGER,
    timeline_span TSTZRANGE -- Clinical timeframe this narrative covers
)
```

### Clinical Intelligence Examples

**Shell File:** 20-page GP patient summary spanning 3 years of care

**AI Creates Clinical Narratives by Medical Meaning:**

```json
{
  "narrative_1": {
    "narrative_purpose": "hypertension_diagnosis_and_management",
    "clinical_classification": "chronic_condition_journey", 
    "ai_narrative_summary": "Initial hypertension diagnosis, medication trials, and stabilization over 18 months with successful blood pressure control",
    "source_page_ranges": [1, 4, 8, 12, 16], // Non-contiguous pages!
    "timeline_span": "2022-01-15 to 2023-07-20",
    "semantic_coherence_score": 0.94
  },
  "narrative_2": {
    "narrative_purpose": "acute_respiratory_infection_episode",
    "clinical_classification": "acute_care_episode",
    "ai_narrative_summary": "Upper respiratory infection diagnosis, antibiotic treatment, and complete resolution within 2 weeks",
    "source_page_ranges": [6, 7], // Concentrated in specific visits
    "timeline_span": "2022-11-15 to 2022-12-01", 
    "semantic_coherence_score": 0.91
  },
  "narrative_3": {
    "narrative_purpose": "administrative_medication_reference",
    "clinical_classification": "reference_documentation",
    "ai_narrative_summary": "Current active medication list for patient reference and medication reconciliation",
    "source_page_ranges": [15], // Single administrative page
    "timeline_span": "2024-03-15", // Point in time snapshot
    "semantic_coherence_score": 0.88
  }
}
```

## Processing Architecture Options

### Option A: Pass 3 Semantic Segmentation (RECOMMENDED)

**Process Flow:**
1. **Pass 1:** Shell file → Entity detection + basic document intelligence
2. **Pass 2:** Shell file → Extract ALL clinical events with rich context and location data
3. **Pass 3:** Structured clinical events (JSON) → Semantic narrative creation

**Pass 3 Input (Cheap JSON Analysis):**
```json
[
  {
    "entity_id": "bp_001",
    "clinical_event": "blood_pressure_reading",
    "page_location": 3,
    "encounter_context": "cardiology_followup_visit", 
    "clinical_purpose": "hypertension_monitoring",
    "temporal_context": "2024-03-15",
    "provider_context": "Dr. Smith, Cardiologist"
  },
  {
    "entity_id": "med_002",
    "clinical_event": "medication_prescription", 
    "page_location": 15,
    "encounter_context": "administrative_medication_list",
    "clinical_purpose": "medication_reconciliation",
    "temporal_context": "current_active_medications"
  }
]
```

**Pass 3 Processing:**
```typescript
// AI analyzes extracted entities for clinical narrative coherence
const narrativeAnalysis = await ai.createClinicalNarratives(extractedEntities);

// Result: Intelligent semantic bundling
{
  clinical_narratives: [
    {
      narrative_purpose: "hypertension_management_journey",
      entity_ids: ["bp_001", "bp_007", "med_003", "encounter_002"],
      source_page_ranges: [3, 8, 12, 18], // Non-contiguous!
      timeline_span: "2022-01 to 2024-03",
      ai_narrative_summary: "18-month journey from initial diagnosis to stable blood pressure management with optimized medication regimen"
    }
  ]
}
```

### Option B: Enhanced Pass 2 with Inline Segmentation (COMPLEX)

**Challenges:**
- Pass 2 already complex with clinical extraction
- Would require simultaneous entity extraction + narrative analysis
- Higher token usage and processing complexity
- Less flexible for iterative narrative refinement

**Verdict:** Pass 3 approach provides better separation of concerns and cost optimization

## Implementation Plan

### Phase 1: Database Schema Enhancement
1. **Create clinical_narratives table** with semantic intelligence fields
2. **Update clinical events tables** to reference narrative_id instead of document_id
3. **Enhance shell_files table** with post-narrative synthesis fields:
   ```sql
   ALTER TABLE shell_files ADD COLUMN ai_synthesized_summary TEXT;
   ALTER TABLE shell_files ADD COLUMN narrative_count INTEGER DEFAULT 0;
   ALTER TABLE shell_files ADD COLUMN synthesis_completed_at TIMESTAMPTZ;
   ```
4. **Update timeline events** to link to clinical narratives for coherent context

### Phase 2: AI Processing Pipeline Enhancement  
1. **Enhance Pass 1** to include basic narrative detection signals
2. **Enhance Pass 2** to include rich location and context metadata for each entity
3. **Implement Pass 3** semantic narrative creator
   - Input: Structured clinical events JSON
   - Output: Clinical narrative definitions
   - Cost-optimized: Analyzing structured data vs raw text
4. **Implement Post-Pass 3 shell file synthesis**
   - Input: All clinical narratives from a shell file
   - Output: Intelligently synthesized shell file summary
   - Purpose: Coherent document overview combining all narrative purposes

### Phase 3: Application Integration
1. **Update timeline display** to show clinical narrative context
2. **Enhance document viewer** to highlight narrative-specific content
3. **Clinical event detail views** show meaningful narrative context
4. **Search functionality** across clinical narratives vs raw documents

### Phase 4: Clinical Safety Validation
1. **Narrative coherence validation** - Ensure medically logical groupings
2. **Cross-narrative contamination prevention** - Avoid mixing unrelated medical contexts  
3. **Timeline attribution accuracy** - Verify clinical events attributed to correct narratives
4. **Manual review queue** for complex multi-narrative scenarios

### Shell File Synthesis Example

**Before synthesis (Pass 1 - potentially confused):**
```sql
shell_files.ai_document_summary = "Patient had cardiac surgery followed by orthopedic surgery with medication changes and discharge planning"
```

**After synthesis (Post-Pass 3 - intelligently organized):**
```sql
shell_files.ai_synthesized_summary = "This document contains three distinct clinical narratives: 
1) Hypertension management journey (18-month progression from diagnosis to stable control)
2) Acute respiratory infection episode (2-week treatment and resolution) 
3) Administrative medication reference list (current active medications for reconciliation)"

shell_files.narrative_count = 3
```

## Benefits of Semantic Architecture

### Clinical Safety
- ✅ **Eliminates mixed medical contexts** in document summaries
- ✅ **Precise clinical event attribution** to correct medical episodes
- ✅ **Coherent timeline narratives** instead of chronological confusion
- ✅ **Prevents dangerous clinical misinterpretation** from document mixing

### User Experience  
- ✅ **Meaningful document context**: "This medication change was part of your hypertension management journey"
- ✅ **Logical timeline organization** by clinical narrative vs administrative chronology
- ✅ **Intelligent content discovery** based on medical meaning
- ✅ **Non-contiguous content coherence** - related medical info regardless of page location

### Technical Benefits
- ✅ **Cost optimization** - Post-extraction semantic analysis of structured JSON
- ✅ **Scalable architecture** - Handle any file complexity without format dependency  
- ✅ **Location independence** - Clinical narratives can span non-adjacent pages
- ✅ **Flexible segmentation** - Based on clinical meaning, not rigid formatting rules

### Healthcare Compliance
- ✅ **Audit trail preservation** - Complete mapping from narratives back to source pages
- ✅ **Clinical context integrity** - Medical decisions based on coherent clinical storylines
- ✅ **Professional medical organization** - Aligns with how healthcare providers think about patient care

## Migration Strategy

### Backwards Compatibility
1. **Existing documents** continue to work with single narrative per shell file
2. **Legacy clinical events** automatically migrated to default narratives
3. **API compatibility** maintained with narrative_id defaulting to shell_file_id for single-narrative documents

### Gradual Rollout
1. **Phase 1:** Multi-narrative detection (flag complex documents)
2. **Phase 2:** Pass 3 implementation (create narratives but don't break existing flow)
3. **Phase 3:** Application layer adoption (timeline, UI updates)
4. **Phase 4:** Full semantic architecture activation

## Success Metrics

### Technical Validation
- [ ] Complex documents correctly segmented into coherent clinical narratives
- [ ] Non-contiguous content properly attributed to correct narratives  
- [ ] Timeline events show meaningful clinical context instead of mixed summaries
- [ ] Processing cost reduction from JSON analysis vs repeated raw text processing

### Clinical Validation  
- [ ] Medical professionals validate narrative coherence and clinical safety
- [ ] No dangerous mixing of unrelated medical contexts
- [ ] Accurate attribution of clinical events to correct care episodes
- [ ] Improved clinical decision support from coherent medical storylines

### User Experience Validation
- [ ] Users can distinguish between different medical episodes in complex documents
- [ ] Timeline provides meaningful clinical narratives vs administrative chronology
- [ ] Document context provides relevant medical storyline information
- [ ] Search and discovery based on clinical meaning rather than document structure

---

## Conclusion: Semantic Intelligence Over Physical Structure

This architectural decision represents a fundamental shift from **document-centric** to **meaning-centric** medical data organization. By creating Clinical Narratives based on semantic medical coherence rather than physical document boundaries, we solve critical clinical safety issues while dramatically improving user experience and clinical utility.

The key insight: **Medical care happens in meaningful clinical storylines, not in arbitrary document formatting boundaries.** Our architecture now reflects how healthcare actually works - as coherent narratives of medical care rather than administrative document collections.

**Next Step:** Begin Phase 1 implementation with database schema enhancement and Pass 3 AI processing pipeline design.