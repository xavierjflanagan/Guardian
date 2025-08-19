Guardian AI Processing Documentation Reorganization Plan

  Executive Summary - 19th August 2025

  The current documentation structure reflects an MVP approach that doesn't align with the enterprise healthcare requirements discovered in the
  database foundation review. We need a complete restructuring that:

  1. Prioritizes critical gaps (multi-profile support, O3's clinical events, healthcare standards)
  2. Reflects the true implementation phases (not the current 4-phase MVP approach)
  3. Separates architectural concepts from implementation details
  4. Provides clear pathways for developers

  Proposed New Folder Structure

  shared/docs/architecture/ai-processing-v2/
  ├── README.md                           # Executive overview & navigation guide
  ├── ARCHITECTURE_OVERVIEW.md            # High-level system architecture
  ├── IMPLEMENTATION_ROADMAP.md           # Comprehensive 5-phase plan
  ├── CURRENT_STATUS.md                   # Gap analysis & what's missing
  │
  ├── 01-core-requirements/               # Foundation concepts (links to database-foundation)
  │   ├── README.md                       # Overview of requirements
  │   ├── multi-profile-support.md       # Maps to database-foundation/core/multi-profile.md
  │   ├── o3-clinical-events.md          # Maps to patient_clinical_events table
  │   ├── healthcare-standards.md        # SNOMED-CT/LOINC/CPT integration
  │   ├── spatial-precision.md           # PostGIS & clinical_fact_sources table
  │   └── timeline-integration.md        # Maps to healthcare_timeline_events table
  │
  ├── 02-clinical-classification/         # How AI populates patient_clinical_events
  │   ├── README.md
  │   ├── activity-types.md              # Maps to activity_type field
  │   ├── clinical-purposes.md           # Maps to clinical_purposes[] field
  │   ├── event-extraction.md            # Populates event_name, method, body_site
  │   └── smart-feature-detection.md     # Maps to smart_health_features table
  │
  ├── 03-extraction-pipeline/             # Document processing flow
  │   ├── README.md
  │   ├── profile-classification/        # Maps to user_profiles table
  │   │   ├── identity-verification.md   # Maps to auth_level field
  │   │   ├── profile-matching.md        # Maps to profile_type field
  │   │   └── contamination-prevention.md # Data integrity for profiles
  │   ├── ai-extraction/                 # AI processing
  │   │   ├── gpt4o-mini-processing.md
  │   │   ├── prompt-engineering.md
  │   │   └── clinical-fact-extraction.md # Creates data for clinical tables
  │   ├── spatial-fusion/                # OCR + AI fusion (Phase 2+)
  │   │   ├── ocr-integration.md
  │   │   ├── text-alignment.md
  │   │   └── postgis-conversion.md      # Populates bounding_box GEOMETRY field
  │   └── normalization/                 # Database population - IMPLEMENTED
  │       ├── database-integration-guide.md # Maps AI output to EVERY table
  │       ├── table-population-matrix.md  # Which AI component fills which table
  │       └── example-data-flows.md      # End-to-end examples
  │
  ├── 04-healthcare-compliance/          # Regulatory & tracking
  │   ├── README.md
  │   ├── session-tracking.md           # ai_processing_sessions
  │   ├── cost-attribution.md           # API cost tracking
  │   ├── quality-metrics.md            # Extraction quality scores
  │   └── audit-trails.md               # Healthcare compliance logging
  │
  ├── 05-implementation-phases/          # Actual implementation plan
  │   ├── README.md
  │   ├── phase-1-foundation.md         # Multi-profile & O3 framework (5-7 days)
  │   ├── phase-2-ai-processing.md      # AI-first extraction (4-6 days)
  │   ├── phase-2plus-spatial.md        # OCR fusion enhancement (4-6 days)
  │   ├── phase-3-compliance.md         # Session tracking (3-4 days)
  │   ├── phase-4-normalization.md      # Database population (4-5 days)
  │   └── phase-5-validation.md         # Testing & validation (3-4 days)
  │
  ├── 06-technical-specifications/       # Developer reference
  │   ├── README.md
  │   ├── database-schemas.md           # All required tables
  │   ├── api-interfaces.md             # Service contracts
  │   ├── data-formats.md               # JSON structures
  │   ├── configuration.md              # Environment & feature flags
  │   └── database-bridge/              # IMPLEMENTED - Database integration specs
  │       ├── README.md                 # How AI and database connect
  │       ├── patient_clinical_events.md # Detailed specs for populating this table
  │       ├── user_profiles.md          # Detailed specs for profile classification
  │       ├── healthcare_timeline_events.md # Detailed specs for timeline generation
  │       ├── clinical_fact_sources.md  # Detailed specs for provenance
  │       ├── ai-clinical-events.md     # Implementation guide for O3 classifier
  │       ├── ai-profile-classification.md # Implementation guide for profile classifier
  │       └── [additional bridge files]  # Complete database integration specs
  │
  ├── 07-provider-integration/           # Future doctor portal prep
  │   ├── README.md
  │   ├── provider-registry.md          # AHPRA integration
  │   ├── appointment-extraction.md     # Future appointments from documents
  │   └── provider-access.md            # Access control preparation
  │
  └── _archive/                          # Deprecated MVP documentation
      ├── old-readme.md
      ├── intake-screening/              # Move existing files here
      ├── processing-pipeline/           # Move existing files here
      └── implementation/                # Move existing 4-phase plan here

  Content Migration Strategy

  Files to Deprecate/Archive:

  1. Current README.md - Replace with enterprise version
  2. AI_PROCESSING_ARCHITECTURE_ANALYSIS.md - Integrate content into new structure
  3. Current implementation/phase-1-4 files - Replace with actual 5-phase plan
  4. intake-screening/ folder - Concepts integrated into 03-extraction-pipeline/profile-classification/
  5. processing-pipeline/ - Distributed across new structure

  Files to Preserve & Relocate:

  1. spatial-semantic-fusion-analysis.md → 03-extraction-pipeline/spatial-fusion/
  2. standardized-json-format.md → 06-technical-specifications/data-formats.md
  3. ocr-extraction.md → 03-extraction-pipeline/spatial-fusion/ocr-integration.md >>>>done
  4. POST_MORTEM_AI_PROCESSING_PIPELINE.md → Keep as reference in _archive/

  New Critical Files to Create:

  Highest Priority (Block database integration):
  1. 01-core-requirements/multi-profile-support.md
  2. 01-core-requirements/o3-clinical-events.md
  3. 02-clinical-classification/activity-types.md
  4. 02-clinical-classification/clinical-purposes.md

  High Priority (Healthcare standards):
  1. 01-core-requirements/healthcare-standards.md
  2. 01-core-requirements/timeline-integration.md
  3. 02-clinical-classification/smart-feature-detection.md

  Implementation Ready:
  1. 05-implementation-phases/phase-1-foundation.md
  2. 05-implementation-phases/phase-2-ai-processing.md

  New README.md Structure

  # Guardian AI Processing Architecture

  **Enterprise Healthcare Document Processing Platform**

  ## Current Status

  ⚠️ **Critical Gap**: Current implementation is MVP-level. Enterprise requirements discovered:
  - Missing multi-profile support (self/child/adult_dependent/pet)
  - Missing O3's clinical events framework
  - Missing healthcare standards integration (SNOMED-CT/LOINC/CPT)
  - Missing spatial precision for document provenance

  See [CURRENT_STATUS.md](./CURRENT_STATUS.md) for gap analysis.

  ## Quick Navigation

  ### For Understanding Requirements
  - [Core Requirements](./01-core-requirements/) - What the system must do
  - [Clinical Classification](./02-clinical-classification/) - How we classify medical data

  ### For Implementation
  - [Implementation Roadmap](./IMPLEMENTATION_ROADMAP.md) - 5-phase plan
  - [Extraction Pipeline](./03-extraction-pipeline/) - Document processing flow
  - [Technical Specifications](./06-technical-specifications/) - Developer reference

  ### For Compliance
  - [Healthcare Compliance](./04-healthcare-compliance/) - Regulatory requirements

  ## Priority Implementation

  ### Phase 1: Foundation (5-7 days) - BLOCKING
  1. Multi-profile document classification
  2. O3's two-axis clinical event framework
  3. Healthcare standards integration

  ### Phase 2: AI Processing (4-6 days)
  1. AI-first clinical fact extraction
  2. Timeline metadata generation
  3. Smart feature activation

  [Continue with phases...]

  Benefits of This Reorganization

  1. Clear Priority Path: Developers immediately see what's blocking database integration
  2. Conceptual Clarity: Separates "what" (requirements) from "how" (implementation)
  3. Enterprise Focus: Reflects actual healthcare platform needs, not MVP
  4. Future Ready: Includes provider portal preparation
  5. Clean Navigation: Logical progression from concepts to implementation

  Implementation Approach

  1. Step 1: Create new folder structure
  2. Step 2: Write critical blocking documentation first
  3. Step 3: Migrate valuable content from existing files
  4. Step 4: Archive deprecated MVP documentation
  5. Step 5: Update all cross-references and links

  This reorganization transforms the documentation from describing a basic MVP to accurately reflecting Guardian's enterprise healthcare platform
  requirements, with clear pathways for implementation.

  ## Critical Database Foundation Integration Points

  The AI processing pipeline MUST populate these database tables correctly:

  ### From database-foundation/core/schema.md:
  - **user_profiles** - Multi-profile support (self/child/adult_dependent/pet)
  - **smart_health_features** - Auto-activating UI features based on detected health data
  - **patient_clinical_events** - O3's two-axis classification (activity_type × clinical_purposes)
  - **patient_observations** - Detailed observation data from AI extraction
  - **patient_interventions** - Intervention details from AI extraction

  ### From database-foundation/features/healthcare-journey.md:
  - **healthcare_timeline_events** - Timeline metadata for every clinical fact
  - **healthcare_encounters** - Visit context extracted from documents
  - **profile_appointments** - Future appointments extracted from documents

  ### From database-foundation/implementation/sql/:
  - **clinical_fact_sources** - Provenance with PostGIS bounding boxes
  - **ai_processing_sessions** - Complete processing session tracking
  - **medical_data_relationships** - Relationships between clinical entities

  ### Key Integration Requirements:
  1. **Every AI extraction must map to patient_clinical_events** using O3's classification
  2. **Every clinical fact needs timeline metadata** for healthcare_timeline_events
  3. **Every extraction needs provenance tracking** in clinical_fact_sources
  4. **Profile classification must prevent contamination** across user_profiles
  5. **Smart features must auto-activate** based on detected content