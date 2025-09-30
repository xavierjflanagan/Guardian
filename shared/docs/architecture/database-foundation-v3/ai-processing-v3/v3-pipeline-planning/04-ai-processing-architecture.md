# AI Processing Architecture: Three-Pass Semantic System with Clinical Narratives

## Document Status
- **Created**: 25 August 2025
- **Updated**: 27 August 2025 - Updated to Three-Pass Architecture with Semantic Processing
- **Purpose**: Define the AI processing strategy for clinical file extraction using semantic clinical narrative architecture
- **Status**: Implementation-ready specification aligned with semantic architecture
- **Related**: Implements semantic architecture from `07-semantic-document-architecture.md`. Follows `03-ocr-processing-architecture.md`. Uses `05-entity-classification-taxonomy.md`

## Executive Summary

This document outlines a **three-pass AI architecture** for extracting structured clinical data from unstructured medical documents and creating semantically coherent clinical narratives. The approach solves the critical multi-file problem by creating clinically meaningful storylines while maintaining reliable shell file organization, ensuring both clinical safety and complete data capture.

**Key Innovation**: Semantic processing that creates **clinical narratives** based on medical meaning rather than physical file structure, preventing dangerous clinical context mixing while enabling coherent clinical storylines.

## Core Architecture: Three-Pass Semantic Processing

### Revolutionary Approach: Meaning Over Structure
**Traditional Approach (WRONG):** Process by file boundaries and physical structure  
**Our Approach (RIGHT):** Create semantic clinical narratives based on medical coherence and clinical storylines

### Architecture Overview

```yaml
AI Processing: Three-Pass Semantic Architecture
  Pass 1: Entity Detection with Semantic Preparation (Lightweight)
    Purpose: Comprehensive entity identification with clinical context hints
    Model: Lightweight model (GPT-4o-mini, Claude Haiku)
    Input: Shell file + OCR output + spatial coordinates
    Output: Complete entity inventory with location data and semantic preparation

  Pass 2: Clinical Events Population (High-Performance)
    Purpose: Multi-layered schema-based clinical enrichment with shell file references
    Model: High-performance model (Claude Sonnet, GPT-5)
    Input: Full document + filtered entities + dynamically loaded schemas
    Output: Fully enriched clinical data with shell file references (system fully functional)

  Pass 3: Semantic Narrative Creation (Enhancement Layer)
    Purpose: Clinical storyline analysis and shell file synthesis
    Model: High-performance model with narrative optimization
    Input: Structured clinical events JSON from Pass 2 + shell file metadata
    Output: Clinical narratives + AI shell file summary (enhancement layer)
```

## Pass 1: Entity Detection with Semantic Preparation

### Enhanced Entity Detection Purpose
Beyond basic entity identification, Pass 1 now includes **semantic preparation** for narrative creation:

#### Input Prompt Structure
```python
prompt = """
Identify EVERY piece of information in this uploaded file as an entity, with special attention to clinical narrative potential.

For each entity found, provide:
1. entity_id: Unique identifier (e.g., "ent_001")
2. text: Exact text as it appears in the file
3. entity_category: One of:
   - clinical_event (medical observations, interventions, diagnoses requiring full analysis)
   - healthcare_context (patient/provider info, appointments requiring profile matching)
   - document_structure (logos, headers, signatures requiring logging only)
4. entity_subtype: Specific classification within category
5. unique_marker: A searchable text pattern to relocate this entity
6. location_context: Where in the document this appears
7. spatial_bbox: Map to OCR spatial bounding box data (page, x_min, y_min, x_max, y_max)
8. confidence: Confidence score (0.0-1.0)
9. requires_schemas: Database schemas needed based on entity_category
10. processing_priority: Based on entity_category
11. clinical_context_hints: NEW - Potential clinical narrative themes this entity relates to
12. temporal_context: NEW - Time/date context for narrative sequencing
13. clinical_purpose: NEW - Medical purpose or storyline this entity serves

Semantic Narrative Preparation:
- Identify potential clinical storylines (e.g., "hypertension_management", "acute_infection_episode")
- Note temporal relationships between clinical events
- Flag entities that span non-contiguous pages but relate to same clinical purpose
- Mark administrative vs clinical distinction for narrative separation

Document text:
{extracted_text}  # With OCR spatial data for click-to-zoom functionality
"""
```

#### Enhanced Output Structure
```json
{
  "document_id": "shell_file_12345",
  "total_entities": 187,
  "entity_breakdown": {
    "clinical_event": 45,
    "healthcare_context": 42,
    "document_structure": 100
  },
  "narrative_preparation": {
    "potential_narratives": ["hypertension_management", "acute_respiratory_episode", "medication_reconciliation"],
    "temporal_span": "2022-01-15 to 2024-03-20",
    "clinical_complexity": "multi_episode",
    "narrative_confidence": 0.89
  },
  "entities": [
    {
      "entity_id": "ent_001",
      "text": "Blood pressure: 140/90 mmHg",
      "entity_category": "clinical_event",
      "entity_subtype": "vital_sign",
      "unique_marker": "Vital Signs Section: Blood pressure: 140/90 mmHg",
      "location_context": "Under 'Vital Signs' header, page 2",
      "spatial_bbox": { "page": 2, "x_min": 0.12, "y_min": 0.34, "x_max": 0.58, "y_max": 0.38 },
      "confidence": 0.95,
      "requires_schemas": ["patient_clinical_events", "patient_observations", "patient_vitals"],
      "clinical_context_hints": ["hypertension_monitoring", "cardiovascular_assessment"],
      "temporal_context": "2024-03-15T10:30:00Z",
      "clinical_purpose": "hypertension_management_journey"
    }
  ]
}
```

## Pass 2: Clinical Events Population (Fully Functional System)

### Multi-Layered Schema-Based Enrichment
Pass 2 creates the **fully functional clinical data system** with complete shell file references:

#### Schema Loading Strategy with Shell File Integration
```typescript
interface Pass2ProcessingStrategy {
  clinical_event: {
    processing: 'Full enrichment + comprehensive database storage',
    schemas: ['patient_clinical_events', 'patient_observations', 'patient_interventions'],
    shell_file_reference: 'Required - maintains source file traceability',
    timeline_integration: 'High priority for healthcare timeline'
  },
  healthcare_context: {
    processing: 'Limited enrichment + contextual storage for profile matching',
    schemas: ['healthcare_encounters', 'patient_demographics'],
    shell_file_reference: 'Required - maintains encounter context',
    timeline_integration: 'Medium priority for care coordination'
  },
  document_structure: {
    processing: 'Skip Pass 2 - logging only in audit trail',
    schemas: [],
    shell_file_reference: 'Optional - audit trail only',
    timeline_integration: 'Low priority - completeness tracking'
  }
}
```

#### Enhanced Output Structure with Shell File References
```json
{
  "enriched_entities": [
    {
      "entity_id": "ent_001",
      "original_text": "Blood pressure: 140/90 mmHg",
      "shell_file_integration": {
        "shell_file_id": "shell_12345",
        "source_page": 2,
        "spatial_reference": { "page": 2, "x_min": 0.12, "y_min": 0.34, "x_max": 0.58, "y_max": 0.38 }
      },
      "enriched_data": {
        "patient_clinical_events": {
          "activity_type": "observation",
          "clinical_purpose": ["screening", "monitoring"],
          "event_name": "Blood Pressure Measurement",
          "shell_file_id": "shell_12345",  // Critical for Pass 3 narrative creation
          "source_document_reference": "page_2_vitals_section",
          "narrative_hint": "hypertension_management",
          "event_datetime": "2024-01-15T10:30:00Z",
          "confidence_score": 0.92
        },
        "patient_observations": {
          "observation_type": "vital_sign",
          "value_text": "140/90 mmHg",
          "value_numeric": 140,
          "value_secondary": 90,
          "unit": "mmHg",
          "interpretation": "stage_2_hypertension",
          "shell_file_id": "shell_12345"
        }
      }
    }
  ],
  "pass2_summary": {
    "system_functionality": "complete",
    "shell_file_references": "all_clinical_events_linked",
    "timeline_ready": true,
    "narrative_preparation": "semantic_hints_embedded"
  }
}
```

## Pass 3: Semantic Narrative Creation (Enhancement Layer)

### Revolutionary Semantic Analysis
Pass 3 processes **structured JSON data** from Pass 2 to create clinically coherent narratives:

#### Cost-Optimized Processing
```typescript
interface Pass3Architecture {
  input_optimization: {
    format: 'Structured JSON from Pass 2 (not raw text)',
    cost_benefit: 'Major cost savings vs raw text processing',
    processing_speed: 'Faster analysis of structured clinical events'
  },
  semantic_analysis: {
    purpose: 'Create clinical narratives based on medical meaning',
    method: 'Analyze clinical events for storyline coherence',
    output: 'Non-contiguous clinical narratives + shell file synthesis'
  },
  graceful_degradation: {
    system_resilience: 'Pass 2 provides fully functional system',
    enhancement_layer: 'Pass 3 provides narrative enhancement',
    fallback_behavior: 'System works perfectly without Pass 3'
  }
}
```

#### Pass 3 Input Structure
```typescript
// Cost-optimized structured data analysis
interface Pass3Input {
  shell_file_metadata: {
    shell_file_id: string;
    original_filename: string;
    total_pages: number;
    upload_timestamp: string;
  };
  extracted_clinical_events: ClinicalEvent[]; // From Pass 2 - structured JSON
  temporal_analysis: {
    date_range: string;
    clinical_episodes: string[];
    care_continuity: string;
  };
}
```

#### Semantic Narrative Creation Process
```python
prompt = """
Analyze these structured clinical events to create semantically coherent clinical narratives.

Input: Structured clinical events JSON (not raw text)
Task: Create clinical storylines based on medical meaning, not file location/source

For each clinical narrative identified:
1. narrative_id: Unique identifier
2. narrative_purpose: Clinical storyline (e.g., "hypertension_management", "acute_respiratory_episode")
3. clinical_classification: Type of narrative ("chronic_condition_journey", "acute_care_episode", "reference_documentation")
4. ai_narrative_summary: Clinically coherent summary of this storyline
5. source_page_ranges: Pages containing this narrative (can be non-contiguous!)
6. entity_ids: Clinical events belonging to this narrative
7. timeline_span: Clinical timeframe this narrative covers
8. semantic_coherence_score: Confidence in narrative coherence (0.0-1.0)

Shell File Synthesis:
Create intelligent shell file summary combining all clinical narratives:
- ai_synthesized_summary: Overview of all narratives in this document
- narrative_count: Number of distinct clinical narratives identified
- clinical_complexity: Assessment of document's clinical complexity

Clinical Events Data:
{structured_clinical_events_json}
"""
```

#### Pass 3 Output: Clinical Narratives + Shell File Synthesis
```json
{
  "shell_file_id": "shell_12345",
  "clinical_narratives": [
    {
      "narrative_id": "narrative_001",
      "narrative_purpose": "hypertension_management_journey",
      "clinical_classification": "chronic_condition_journey",
      "ai_narrative_summary": "18-month progression from initial hypertension diagnosis to stable blood pressure control with optimized medication regimen including Lisinopril titration and monitoring",
      "source_page_ranges": [1, 4, 8, 12, 16], // Non-contiguous pages!
      "entity_ids": ["ent_001", "ent_007", "ent_023", "ent_045"],
      "timeline_span": "2022-01-15T00:00:00Z to 2024-03-15T00:00:00Z",
      "semantic_coherence_score": 0.94
    },
    {
      "narrative_id": "narrative_002", 
      "narrative_purpose": "acute_respiratory_infection_episode",
      "clinical_classification": "acute_care_episode",
      "ai_narrative_summary": "Upper respiratory infection diagnosis, antibiotic treatment with Amoxicillin, and complete clinical resolution within 2 weeks",
      "source_page_ranges": [6, 7], // Concentrated in specific visits
      "entity_ids": ["ent_015", "ent_018", "ent_021"],
      "timeline_span": "2022-11-15T00:00:00Z to 2022-12-01T00:00:00Z",
      "semantic_coherence_score": 0.91
    }
  ],
  "shell_file_synthesis": {
    "ai_synthesized_summary": "This document contains two distinct clinical narratives: 1) Hypertension management journey showing 18-month progression from diagnosis to stable control, and 2) Acute respiratory infection episode with complete resolution. Both narratives demonstrate appropriate clinical care and positive outcomes.",
    "ai_document_purpose": "Chronic disease management with acute episodic care",
    "ai_key_findings": [
      "Successful hypertension management with Lisinopril optimization",
      "Appropriate acute care for respiratory infection",
      "Good medication adherence and clinical response"
    ],
    "narrative_count": 2,
    "clinical_complexity": "moderate_multi_narrative",
    "processing_confidence": 0.92
  },
  "dual_lens_references": {
    "shell_file_view_ready": true,
    "narrative_view_ready": true,
    "click_to_zoom_enabled": true
  }
}
```

## Hybrid Dual-Lens Architecture Benefits

### Clinical Safety Through Semantic Separation
```typescript
interface ClinicalSafetyBenefits {
  dangerous_mixing_prevented: {
    before: "Patient had cardiac surgery followed by orthopedic surgery with medication changes",
    after_narrative_separation: {
      narrative_1: "Cardiac surgery episode with appropriate post-operative care and cardiac medications",
      narrative_2: "Orthopedic surgery episode with different medication regimen and recovery timeline"
    },
    safety_impact: "Prevents clinical misinterpretation from mixed medical contexts"
  },
  
  timeline_coherence: {
    before: "Chronological list of all events regardless of clinical relationship", 
    after: "Clinical narratives showing meaningful medical storylines with proper context",
    clinical_benefit: "Healthcare providers can follow coherent care episodes"
  }
}
```

### User Experience Enhancement
```typescript
interface UserExperienceBenefits {
  shell_file_view: {
    purpose: "Traditional document-centric view for users who prefer document organization",
    features: ["Page-by-page viewing", "Click-to-zoom coordinates", "Complete document overview"]
  },
  
  narrative_view: {
    purpose: "Clinical storyline view for meaningful medical context",
    features: ["Coherent clinical narratives", "Cross-page content relationships", "Medical storyline timelines"]
  },
  
  user_choice: {
    flexibility: "Users can switch between document view and clinical narrative view",
    use_cases: ["Document view for sharing with providers", "Narrative view for understanding medical care"]
  }
}
```

## Implementation Architecture

### Three-Pass Processing Flow
```typescript
interface ProcessingOrchestration {
  pass1_entity_detection: {
    implementation: 'EntityClassifier class with semantic preparation',
    cost: '~$0.0002-0.0005 per document',
    time: '1-2 seconds',
    output: 'Complete entity inventory with semantic hints'
  },
  
  pass2_clinical_enrichment: {
    implementation: 'SchemaLoader class with shell file integration',
    cost: '~$0.003-0.006 per document',
    time: '3-5 seconds', 
    output: 'Fully functional clinical system with shell file references',
    system_status: 'Complete and operational'
  },
  
  pass3_semantic_narratives: {
    implementation: 'SemanticNarrativeCreator class with JSON analysis',
    cost: '~$0.001-0.003 per document (processes structured data)',
    time: '2-4 seconds',
    output: 'Clinical narratives + shell file synthesis',
    system_enhancement: 'Optional enhancement layer'
  }
}
```

### Database Integration with Semantic Architecture
```sql
-- Shell Files (Physical Layer)
CREATE TABLE shell_files (
    shell_file_id UUID PRIMARY KEY,
    original_filename TEXT NOT NULL,
    file_size_bytes BIGINT,
    storage_path TEXT,
    upload_timestamp TIMESTAMPTZ,
    
    -- Post-Pass 3 Synthesis Fields
    ai_synthesized_summary TEXT,          -- Intelligent overview of all narratives
    ai_document_purpose TEXT,             -- Overall document purpose
    ai_key_findings TEXT[],               -- Key clinical findings across narratives
    narrative_count INTEGER DEFAULT 0,    -- Number of clinical narratives
    synthesis_completed_at TIMESTAMPTZ
);

-- Clinical Narratives (Semantic Layer)
CREATE TABLE clinical_narratives (
    narrative_id UUID PRIMARY KEY,
    shell_file_id UUID REFERENCES shell_files(shell_file_id),
    narrative_purpose TEXT,               -- "hypertension_management", "acute_episode"
    clinical_classification TEXT,         -- "chronic_condition_journey", "acute_care_episode"
    ai_narrative_summary TEXT,            -- Clinically coherent summary
    source_page_ranges INT[],             -- Can span non-contiguous pages
    timeline_span TSTZRANGE,              -- Clinical timeframe
    semantic_coherence_score NUMERIC(3,2),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enhanced Clinical Events with Dual References
ALTER TABLE patient_clinical_events 
ADD COLUMN shell_file_id UUID REFERENCES shell_files(shell_file_id),
ADD COLUMN narrative_id UUID REFERENCES clinical_narratives(narrative_id);
```

## Cost Optimization and Performance

### Three-Pass Cost Analysis
```typescript
const COST_OPTIMIZATION_ANALYSIS = {
  traditional_single_pass: {
    cost: '$0.25 per document',
    issues: ['Token limit constraints', 'Context degradation', 'High processing cost']
  },
  
  exora_three_pass: {
    pass1_cost: '$0.0002-0.0005 per document',
    pass2_cost: '$0.003-0.006 per document', 
    pass3_cost: '$0.001-0.003 per document',
    total_cost: '$0.004-0.011 per document',
    cost_reduction: '85-95% vs traditional approach',
    
    optimization_benefits: [
      'Pass 3 processes structured JSON vs raw text (major savings)',
      'Schema loading only for detected entities',
      'Intelligent batching prevents token waste',
      'Semantic analysis on structured data'
    ]
  }
}
```

### Processing Time Distribution
```typescript
const PERFORMANCE_TARGETS = {
  pass1_entity_detection: '1-2 seconds',
  pass2_clinical_enrichment: '3-5 seconds',  
  pass3_semantic_narratives: '2-4 seconds',
  total_processing_time: '6-11 seconds end-to-end',
  
  system_resilience: {
    pass2_provides: 'Fully functional clinical system',
    pass3_provides: 'Enhanced narrative experience', 
    graceful_degradation: 'System works perfectly if Pass 3 fails'
  }
}
```

## Quality Assurance Framework

### Multi-Pass Validation Strategy
```typescript
interface QualityGates {
  pass1_validation: {
    completeness: '100% of document content identified as entities',
    spatial_accuracy: 'All entities mapped to correct OCR coordinates',
    semantic_preparation: 'Clinical context hints identified for narrative creation'
  },
  
  pass2_validation: {
    schema_accuracy: '>95% correct schema assignment',
    shell_file_integration: '100% clinical events linked to shell files',
    clinical_accuracy: '>90% medical concept accuracy',
    system_functionality: 'Complete clinical data system operational'
  },
  
  pass3_validation: {
    narrative_coherence: '>85% clinically logical storyline groupings',
    cross_contamination_prevention: '0% mixing of unrelated medical contexts',
    timeline_attribution: '>95% clinical events attributed to correct narratives',
    shell_file_synthesis: 'Intelligently combined narrative overviews'
  }
}
```

## Migration Strategy and Backwards Compatibility

### Graceful System Evolution
```typescript
interface MigrationStrategy {
  phase1_pass2_deployment: {
    status: 'Deploy Pass 1 + Pass 2 for fully functional system',
    benefit: 'Complete clinical data processing without narratives',
    fallback: 'Traditional shell file organization maintained'
  },
  
  phase2_pass3_enhancement: {
    status: 'Add Pass 3 as optional enhancement layer',
    benefit: 'Semantic narrative creation without breaking existing functionality',
    graceful_degradation: 'System continues to work if Pass 3 fails'
  },
  
  backwards_compatibility: {
    existing_documents: 'Continue to work with single narrative per shell file',
    legacy_clinical_events: 'Automatically work with shell file references',
    api_compatibility: 'Maintained with narrative_id defaulting to shell_file_id'
  }
}
```

## Success Metrics

### Technical Performance
- **Entity Detection Completeness**: 100% of document content identified (Pass 1)
- **Clinical Data Accuracy**: >95% correct schema assignment (Pass 2)
- **Narrative Coherence**: >85% clinically logical storyline groupings (Pass 3)
- **System Resilience**: 100% functionality maintained if Pass 3 fails
- **Cost Efficiency**: <$0.011 per document average (85-95% cost reduction)

### Clinical Safety Validation  
- **Profile Contamination**: 0% cross-profile data mixing
- **Clinical Context Integrity**: 0% dangerous mixing of unrelated medical contexts
- **Timeline Attribution Accuracy**: >95% clinical events attributed to correct narratives
- **Medical Professional Validation**: Clinical narratives validated for medical coherence

### User Experience Metrics
- **Dual-Lens System Usage**: Users can effectively switch between document and narrative views
- **Clinical Understanding**: Improved medical storyline comprehension vs mixed document summaries
- **Healthcare Provider Adoption**: Clinicians prefer narrative view for clinical decision making
- **Search and Discovery**: Meaningful clinical content discovery vs document structure search

## Implementation Roadmap

### Phase 1: Foundation (Pass 1 + Pass 2) - Weeks 1-2
- **Pass 1**: EntityClassifier with semantic preparation
- **Pass 2**: SchemaLoader with shell file integration
- **Database**: Shell files + enhanced clinical events tables
- **Outcome**: Fully functional clinical data system

### Phase 2: Semantic Enhancement (Pass 3) - Weeks 3-4
- **Pass 3**: SemanticNarrativeCreator with JSON analysis
- **Database**: Clinical narratives table + shell file synthesis
- **UI**: Dual-lens viewing system (document + narrative views)
- **Outcome**: Enhanced semantic narrative experience

### Phase 3: Production Optimization - Weeks 5-6
- **Monitoring**: Three-pass performance analytics
- **Quality**: Advanced validation and clinical safety checks
- **Scale**: Production-ready processing pipeline
- **Outcome**: Healthcare-grade semantic document processing

---

## Conclusion: Semantic Intelligence Revolution

This three-pass architecture represents a fundamental shift from **document-centric** to **meaning-centric** medical data processing. By creating Clinical Narratives based on semantic medical coherence rather than physical document boundaries, we solve critical clinical safety issues while dramatically improving user experience and clinical utility.

**The key insight**: Medical care happens in meaningful clinical storylines, not in arbitrary document formatting boundaries. Our three-pass architecture now reflects how healthcare actually works - as coherent narratives of medical care rather than administrative document collections.

**Next Steps**: 
1. Implement Pass 1 + Pass 2 for fully functional clinical system
2. Add Pass 3 semantic narratives as enhancement layer
3. Deploy dual-lens viewing system for optimal user choice
4. Validate clinical safety and narrative coherence with healthcare professionals

*This three-pass architecture provides the foundation for revolutionary semantic document processing that transforms how patients and healthcare providers interact with medical information.*