# Pass 0.5 Strategy A - System Overview

**Date:** November 14, 2024 (Updated November 18, 2024)
**Version:** 3.0
**Status:** Design Complete - Ready for Implementation

## Executive Summary

Strategy A implements a unified progressive processing pipeline for ALL medical documents, regardless of page count. Every document follows the same path: chunking → pending encounters with identity/quality tracking → reconciliation with classification → final encounters.

**V2 Updates (Nov 15, 2024):**
- OCR integration design complete for precise intra-page boundaries
- Position reconciliation strategy defined for multi-chunk encounters
- Reconciler duplicate-prevention strategy finalized
- Prompt V11 specification updated with all position fields
- Script analysis V2 complete with 6-7 new scripts identified

**V3 Updates (Nov 18, 2024):**
- Profile classification integration (File 10): Patient identity extraction, medical identifiers, profile matching
- Data quality tiers (File 11): A/B/C tier classification based on completeness criteria
- Encounter sources (File 12): Multi-source support (shell_file, manual_entry, api_import, voice_recording)
- 4 new tables: pending_encounter_identifiers, encounter_identifiers, orphan_identities, classification_audit
- 21 new fields per encounter: 4 identity + 4 provider + 4 classification + 3 quality + 5 source metadata + reconciliation metadata
- Critical schema fix: shell_files.uploaded_by for auth user tracking (separate from patient_id)
- File 13 exclusions clarified: shell_file_metadata table NOT created (future scope)
- Complete verification matrix: 112 new columns across 7 tables mapped to worker code

## Core Principles

1. **Universal Progressive Path**: All files processed progressively (1-page to 1000-page)
2. **All Encounters Pending First**: Every encounter goes to pending table before finalization
3. **Cascade ID Linking**: Unique IDs track encounters across chunk boundaries
4. **Deterministic Reconciliation**: Cascade IDs group related pendings into final encounters
5. **Position Awareness**: Precise intra-page boundaries using OCR bounding box coordinates
6. **Two-Tier Boundary System**: Inter-page (natural breaks) vs Intra-page (Y-coordinates)
7. **Graceful Degradation**: Coordinate extraction failures degrade to inter-page boundaries
8. **Identity First**: Extract patient identity in every chunk for downstream profile matching (File 10)
9. **Quality Awareness**: Track data quality tier (A/B/C) for intelligent processing decisions (File 11)
10. **Source Transparency**: Always know where encounter data originated (File 12)
11. **Profile Separation**: Auth users (uploaded_by) distinct from profiles (patient_id) for multi-user accounts

## System Architecture

### Phase 1: Document Intake
- Shell file received with OCR pages
- Progressive session created (always, regardless of size)
- Document chunked into 50-page segments
- Single chunk for documents ≤50 pages

### Phase 2: Chunk Processing
- Each chunk processed sequentially
- AI identifies ALL encounters in chunk with position data
- **OCR Coordinate Extraction**: Convert AI text markers → Y-coordinates from OCR bboxes
- **Identity Extraction (File 10)**: Extract patient name, DOB, address, phone from encounter context
- **Medical Identifiers (File 10)**: Extract MRN, insurance numbers, other identity markers
- Post-processor assigns IDs and cascade markers
- ALL encounters saved as pending with 41 new fields:
  - 13 position fields (start/end boundaries with coordinates)
  - 4 identity fields (patient demographics)
  - 4 provider fields (name, facility, dates)
  - 4 classification fields (profile matching metadata)
  - 3 quality tier fields (A/B/C tier tracking)
  - 5 source metadata fields (encounter origin tracking)
  - 5 reconciliation fields (cascade linking metadata)
  - 3 cascade fields (cascade_id, is_cascading, continues_previous)
- **Identifier Storage**: Medical identifiers saved to pass05_pending_encounter_identifiers table
- Cascading encounter packaged for handoff
- **Batching Analysis**: AI identifies safe split points for Pass 1/2 batching

### Phase 3: Reconciliation
- **Session-level guard**: Ensures all chunks completed before reconciliation
- Groups pending encounters by cascade_id
- **Position Merging**: First chunk's start position + last chunk's end position
- **Weighted Confidence**: Calculate position confidence across all chunks
- **Quality Tier Calculation (File 11)**: Assign A/B/C tier based on completeness criteria
  - Tier A: All 4 date fields + provider + facility + identity
  - Tier B: Start date + location (provider OR facility)
  - Tier C: Missing critical fields
- **Profile Classification (File 10)**: Match extracted identity to existing profiles
  - Compare name, DOB, address against user_profiles
  - Calculate match confidence and status
  - Flag orphan identities (unmatched identities appearing 3+ times)
- **Identifier Migration (File 10)**: Copy identifiers from pending → encounter_identifiers table
- **Classification Audit (File 10)**: Log all classification decisions to profile_classification_audit
- **Source Validation (File 12)**: Verify encounter_source cross-field integrity
- **Batching Aggregation**: Combine safe split points from all chunks → shell_files
- Creates final encounters from groups with merged position/identity/quality data
- **Duplicate Prevention**: Cascade linking prevents duplicate encounter creation
- Updates page assignments to final IDs
- No reliance on AI state management

### Phase 4: Metrics & Summary
- Aggregates session statistics
- Optional summary generation for multi-chunk encounters
- Updates reporting tables

## Data Flow Diagram (V3)

```
[Shell File Upload + OCR Data]
        ↓
[Create Progressive Session]
        ↓
[Chunk Document (50 pages each)]
        ↓
┌──────────────────────────────────────────────────┐
│   Process Chunk 1                                │
│   - AI analyzes encounters                       │
│   - Outputs text markers                         │
│   - Extract OCR coordinates                      │ → [Pending Encounters + 41 fields]
│   - Extract patient identity (File 10)           │ → [Pending Identifiers table]
│   - Extract medical identifiers (MRN, etc)       │
│   - Batching analysis                            │ → [Chunk batching analysis]
│   - Assign cascade IDs                           │ → [Cascade Handoff]
└──────────────────────────────────────────────────┘         ↓
        ↓                                                     ↓
┌──────────────────────────────────────────────┐   ┌─────────────────────┐
│   Process Chunk 2                            │ ← │ cascade_id: xyz     │
│   - Receives handoff context                 │   │ context: {...}      │
│   - AI continues cascade                     │   │ continues_previous  │
│   - Extract coordinates + identity           │   └─────────────────────┘
│   - More identifiers to pending table        │
│   - More batching analysis                   │
└──────────────────────────────────────────────┘
        ↓
[All Chunks Complete]
        ↓
┌──────────────────────────────────────────────────────────┐
│     Reconciler (V3)                                      │
│ - Session guard check                                    │
│ - Group by cascade_id                                    │
│ - Merge start positions (first chunk)                    │
│ - Merge end positions (last chunk)                       │
│ - Weighted confidence calculation                        │
│ - Quality tier calculation (File 11: A/B/C)              │ → [Quality tier assigned]
│ - Profile classification (File 10: match to profiles)    │ → [Classification audit log]
│ - Orphan identity detection (File 10: 3+ occurrences)    │ → [Orphan identities table]
│ - Identifier migration (pending → final identifiers)     │ → [Encounter identifiers table]
│ - Source validation (File 12: integrity checks)          │
│ - Aggregate batching analysis                            │
│ - Create final encounters                                │
│ - Update page assignments                                │
└──────────────────────────────────────────────────────────┘
        ↓
[Healthcare Encounters + Identifiers + Quality Tiers + Classification Audit]
        ↓
[Update Metrics + shell_files.page_separation_analysis]
        ↓
[Complete]
```

## Key Innovations

### 1. Cascade ID System
- Generated once when encounter reaches chunk boundary
- Passed through handoff to next chunk
- Used as primary key for reconciliation
- Eliminates ambiguity in multi-chunk encounters

### 2. Universal Pipeline
- No branching logic based on document size
- 20-page document = 1-chunk progressive session
- 500-page document = 10-chunk progressive session
- Same code path, same prompt, same processing

### 3. Position Granularity (V2: OCR Integration Complete)
- **Two-tier boundary system:**
  - **Inter-page**: Natural page breaks (no coordinates needed)
  - **Intra-page**: Precise Y-coordinates from OCR bounding boxes
- **13 position fields per encounter:**
  - Start: page, boundary_type, marker, text_y_top, text_height, split_y
  - End: page, boundary_type, marker, text_y_top, text_height, split_y
  - position_confidence: weighted average across chunks
- **Coordinate extraction process:**
  1. AI outputs text markers (e.g., "just before header 'EMERGENCY ADMISSION'")
  2. Worker code extracts Y-coordinates from OCR bounding boxes
  3. Fuzzy matching fallback for OCR variations
  4. Graceful degradation to inter-page if extraction fails
- Handles multiple encounters per page
- Prevents false cascading from mid-page endings

### 4. Batching Analysis for Pass 1/2
- AI identifies safe document split points during Pass 0.5
- Stored per chunk, aggregated during reconciliation
- Deduplicated at chunk boundaries
- Written to `shell_files.page_separation_analysis` for Pass 1/2 use
- Enables intelligent batching for clinical extraction phases

### 5. Patient Identity Extraction (File 10)
- Extract patient demographics in every chunk (name, DOB, address, phone)
- Store medical identifiers separately (MRN, insurance numbers)
- Profile matching during reconciliation against existing user_profiles
- Orphan identity detection for smart profile creation suggestions
- Complete audit trail in profile_classification_audit table
- Separate identifier tables: pending_encounter_identifiers → encounter_identifiers

### 6. Data Quality Tiers (File 11)
- Three-tier classification system (A/B/C) based on completeness
- Tier A: All 4 date fields + provider + facility + identity (highest quality)
- Tier B: Start date + location (provider OR facility) (medium quality)
- Tier C: Missing critical fields (requires manual review)
- Calculated during reconciliation based on merged encounter data
- Stored in data_quality_tier, quality_criteria_met, quality_calculation_date fields
- Enables intelligent downstream processing decisions

### 7. Multi-Source Support (File 12)
- encounter_source field tracks origin: shell_file, manual_entry, api_import, voice_recording
- shell_file_subtype classifies document type: scanned_document, progress_note, voice_transcript, api_import
- api_source_name for API imports (e.g., "MyHealthRecord", "HealthEngine")
- Cross-field integrity constraints ensure source validation
- uploaded_by (auth.users) separate from patient_id (user_profiles) for multi-user accounts
- Enables future manual encounter creation and API integrations

## Success Metrics

- **Accuracy**: 142-page test → 1 final encounter (not 3)
- **Completeness**: All 142 pages assigned correctly
- **Efficiency**: Minimal handoff data between chunks
- **Reliability**: No dependency on AI memory/state
- **Scalability**: Handles 10-page to 1000-page documents
- **Identity Extraction (File 10)**:
  - Patient name extraction: >95% accuracy
  - DOB extraction with format handling: >90% accuracy
  - Medical identifier capture (MRN, insurance): >85% per encounter
- **Profile Matching (File 10)**:
  - Match confidence thresholds: High (>0.8), Medium (0.5-0.8), Low (<0.5)
  - Orphan detection: Flag identities appearing 3+ times across documents
  - Classification audit: 100% coverage (every encounter logged)
- **Quality Tier Distribution (File 11)**:
  - Target: 70%+ encounters in Tier A (complete data)
  - Acceptable: 20% in Tier B (usable data)
  - Review needed: <10% in Tier C (incomplete data)
  - Quality criteria tracking: Visibility into which fields are missing
- **Source Classification (File 12)**:
  - encounter_source accuracy: 100% (programmatic assignment)
  - uploaded_by tracking: 100% (auth user always known)
  - Cross-field validation: Zero integrity violations

## Implementation Timeline

**V3 Estimate: 5-6 weeks** (updated from V2's 4-5 weeks)

### Week 1-2: Core Pipeline + Position System
- Implement cascade ID management
- Build coordinate extraction from OCR bboxes
- Create position validation logic
- Update chunk-processor with 13 position fields
- **NEW (File 10)**: Implement identity extraction (name, DOB, address, phone)
- **NEW (File 10)**: Build identifier extraction (MRN, insurance numbers)
- **NEW (File 10)**: Create pending_encounter_identifiers table writes

### Week 3: Reconciliation + Quality/Classification
- Implement position merging (start/end/confidence)
- Build batching analysis aggregation
- Session-level guard checks
- Duplicate prevention via cascade linking
- **NEW (File 11)**: Implement quality tier calculation (A/B/C logic)
- **NEW (File 10)**: Build profile classification/matching against user_profiles
- **NEW (File 10)**: Implement orphan identity detection (3+ occurrences)
- **NEW (File 10)**: Create identifier migration (pending → final identifiers)

### Week 4: Source Tracking + Audit Trail
- **NEW (File 12)**: Implement encounter_source tracking
- **NEW (File 12)**: Add shell_file_subtype classification
- **NEW (File 12)**: Build cross-field source validation
- **NEW (File 10)**: Implement profile_classification_audit logging
- **NEW**: Add uploaded_by tracking to shell_files
- Integration testing for all new tables

### Week 5: Testing + Edge Cases
- Multi-chunk encounter testing
- Coordinate extraction edge cases
- Position validation testing
- **NEW**: Identity extraction accuracy testing
- **NEW**: Profile matching confidence validation
- **NEW**: Quality tier distribution validation
- **NEW**: DOB parsing (DD/MM/YYYY vs MM/DD/YYYY)
- Integration with existing progressive pipeline

### Week 6: Polish + Documentation
- Error handling refinement
- Performance optimization (now 13 tables instead of 7)
- Documentation updates
- Deployment preparation
- **NEW**: Verification matrix validation (112 columns)

**Key Complexity Increases:**
- chunk-processor.ts: HIGH → VERY HIGH (added identity/identifier extraction)
- pending-reconciler.ts: MEDIUM → VERY HIGH (added quality/classification/migration)
- identifier-extractor.ts: NEW (File 10)
- profile-classifier.ts: NEW (File 10, optional)
- quality-tier-calculator.ts: NEW (File 11)
- 11 total scripts (5 new + 6 modified) vs V1's 4 scripts
- 112 new columns vs V2's ~50 columns
- 6 new tables vs V2's 2 tables

## Design Evolution (V1 → V2 → V3)

### November 14, 2024: V1 Initial Design
- Core cascade ID system defined
- Basic position awareness (5-position system: top/quarter/middle/three-quarters/bottom)
- Initial script analysis (4 new scripts estimated)
- Reconciliation strategy outlined

### November 15, 2024: V2 Blocker Resolution
**Three critical blockers identified and resolved:**

#### Blocker 1: Reconciler Duplicate Prevention
- **Problem**: Original reconciliation could create duplicate encounters
- **Solution**: Cascade ID-based grouping ensures 1 final encounter per cascade
- **Impact**: CRITICAL - prevents data corruption
- **Document**: 06-RECONCILER-FIXES.md

#### Blocker 2: OCR Integration Missing
- **Problem**: V1 used 5-position qualitative system, no coordinate extraction
- **Solution**: Two-stage approach (AI text markers → code extracts Y-coordinates)
- **Impact**: CRITICAL - enables precise intra-page boundaries
- **Document**: 07-OCR-INTEGRATION-DESIGN.md
- **Changes**:
  - Replaced 5-position system with inter_page vs intra_page
  - Added 13 position fields to pending/final encounters
  - New coordinate-extractor.ts script required

#### Blocker 3: Position Data Merging
- **Problem**: Multi-chunk encounters need merged position data
- **Solution**: First chunk = start, last chunk = end, weighted confidence
- **Impact**: HIGH - accurate positions for cascading encounters
- **Document**: 08-RECONCILIATION-STRATEGY-V2.md
- **Changes**:
  - Added position merging functions to reconciler
  - Batching analysis aggregation to shell_files
  - Session-level guard checks for concurrency safety

### Key Design Decisions
1. **Multiple Match Policy**: Keep "first match" approach, rely on AI disambiguating context
2. **Page Number Format**: Document-absolute (1-N), not chunk-relative
3. **Error Handling**: Graceful degradation (intra_page → inter_page on extraction failure)
4. **Batching Deduplication**: Remove duplicate split points at chunk boundaries
5. **Concurrency Safety**: Session-level guard prevents premature reconciliation

### November 18, 2024: V3 Profile Classification Integration
**Four major feature additions completed:**

#### Integration 1: Profile Classification (File 10)
- **Problem**: No patient identity extraction or profile linking
- **Solution**: Extract demographics + medical identifiers during chunk processing, match during reconciliation
- **Impact**: CRITICAL - enables multi-profile households and orphan identity detection
- **Tables Added**:
  - pass05_pending_encounter_identifiers (during processing)
  - healthcare_encounter_identifiers (after reconciliation)
  - orphan_identities (smart profile suggestions)
  - profile_classification_audit (complete audit trail)
- **Fields Added**: 4 identity + 4 classification = 8 fields per encounter
- **New Scripts**: identifier-extractor.ts, profile-classifier.ts (optional)

#### Integration 2: Data Quality Tiers (File 11)
- **Problem**: No visibility into encounter data completeness
- **Solution**: A/B/C tier classification based on field completeness during reconciliation
- **Impact**: HIGH - enables intelligent downstream processing decisions
- **Tier Logic**:
  - A: All 4 dates + provider + facility + identity (complete)
  - B: Start date + location (provider OR facility) (usable)
  - C: Missing critical fields (requires review)
- **Fields Added**: 3 quality fields (tier, criteria_met, calculation_date)
- **New Scripts**: quality-tier-calculator.ts

#### Integration 3: Encounter Sources (File 12)
- **Problem**: No tracking of where encounter data originated
- **Solution**: encounter_source field + shell_file_subtype classification
- **Impact**: MEDIUM - enables future manual entry and API imports
- **Source Types**: shell_file, manual_entry, api_import, voice_recording
- **Shell Subtypes**: scanned_document, progress_note, voice_transcript, api_import
- **Fields Added**: 5 source metadata fields
- **Critical Schema Fix**: Added shell_files.uploaded_by (auth.users) separate from patient_id (user_profiles)

#### Integration 4: Reconciliation Metadata (Files 04-08)
- **Problem**: No audit trail of how pendings became final encounters
- **Solution**: Explicit reconciliation metadata fields populated during reconciliation
- **Impact**: MEDIUM - enables reconciliation debugging and audit trails
- **Fields Added**: 5 reconciliation fields (key, method, confidence, reconciled_to, reconciled_at)

**File 13 Exclusions Clarified:**
- shell_file_metadata table NOT created (File 13 FUTURE scope)
- Manual encounter UI NOT implemented (File 13 FUTURE scope)
- Voice recording processing NOT implemented (File 13 FUTURE scope)
- AI chat session integration NOT implemented (File 13 FUTURE scope)

**Verification Complete:**
- Created 04-VERIFICATION-MATRIX.md with complete column-to-code mapping
- Created REVIEW-RESPONSE-NOV-18.md documenting File 13 exclusion rationale
- Updated 02-SCRIPT-ANALYSIS-V3.md with all identity/quality/source logic
- Updated 03-TABLE-DESIGN-V3.md with all 112 new columns
- All critical gaps from assistant reviews resolved

## Related Documents

### Core Design Documents (V3 - CURRENT)
- [02-SCRIPT-ANALYSIS-V3.md](./02-SCRIPT-ANALYSIS-V3.md) - **V3 CURRENT**: Complete implementation specification with identity/quality/source
- [03-TABLE-DESIGN-V3.md](./03-TABLE-DESIGN-V3.md) - **V3 CURRENT**: Database migration plan with 112 new columns
- [04-VERIFICATION-MATRIX.md](./04-VERIFICATION-MATRIX.md) - **V3 NEW**: Cross-verification of all columns to worker code
- [04-PROMPT-V11-SPEC.md](./04-PROMPT-V11-SPEC.md) - V11 unified prompt specification
- [REVIEW-RESPONSE-NOV-18.md](./REVIEW-RESPONSE-NOV-18.md) - **V3 NEW**: File 13 exclusion rationale and assistant review responses

### Historical Design Documents (V1-V2)
- [02-SCRIPT-ANALYSIS-V2.md](./02-SCRIPT-ANALYSIS-V2.md) - V2 historical (pre Files 10-12 integration)
- [02-SCRIPT-ANALYSIS-V1.md](./02-SCRIPT-ANALYSIS-V1.md) - V1 historical reference
- [03-TABLE-DESIGN.md](./03-TABLE-DESIGN.md) - V1 historical (pre position system)

### Blocker Resolution Documents (Nov 15, 2024)
- [06-RECONCILER-FIXES.md](./06-RECONCILER-FIXES.md) - Reconciler duplicate prevention strategy
- [07-OCR-INTEGRATION-DESIGN.md](./07-OCR-INTEGRATION-DESIGN.md) - OCR coordinate extraction design
- [08-RECONCILIATION-STRATEGY-V2.md](./08-RECONCILIATION-STRATEGY-V2.md) - Position merging & batching aggregation

### Profile Classification Documents (Nov 18, 2024)
- [10-PROFILE-CLASSIFICATION-INTEGRATION.md](./10-PROFILE-CLASSIFICATION-INTEGRATION.md) - File 10: Patient identity extraction and profile matching
- [11-QUALITY-TIERS-V2.md](./11-QUALITY-TIERS-V2.md) - File 11: A/B/C tier classification system
- [12-ENCOUNTER-SOURCES-V2.md](./12-ENCOUNTER-SOURCES-V2.md) - File 12: Multi-source encounter tracking
- [13-MANUAL-ENCOUNTERS-FUTURE.md](./13-MANUAL-ENCOUNTERS-FUTURE.md) - File 13: FUTURE scope (NOT implemented in Strategy A)

### Supporting Documents
- [05-TESTING-STRATEGY.md](./05-TESTING-STRATEGY.md) - Testing approach for Strategy A
- [09-SCRIPT-UPDATES-REQUIRED.md](./09-SCRIPT-UPDATES-REQUIRED.md) - DELETED (merged into V2)