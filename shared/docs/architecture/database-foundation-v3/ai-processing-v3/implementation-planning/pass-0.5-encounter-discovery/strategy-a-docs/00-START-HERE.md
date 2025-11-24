# Strategy A Documentation - Start Here

**Last Updated:** 2025-11-24
**Status:** Production-ready, actively maintained

---

## Quick Navigation

**New to Pass 0.5?** → Read [01-SYSTEM-OVERVIEW.md](./01-SYSTEM-OVERVIEW.md)

**Need to fix a bug?** → Check [OPEN-ISSUES-AND-FUTURE-WORK.md](./OPEN-ISSUES-AND-FUTURE-WORK.md)

**Looking for something specific?** → Use the guide below

---

## What is Strategy A?

Strategy A is the **production implementation** of Pass 0.5 Encounter Discovery using a cascading reconciliation approach for handling multi-chunk document processing.

**Key Features:**
- Progressive chunking (50 pages per chunk) for infinite size documents (production-tested with documents up to 219 pages).
- Encounter detection 
- Cascade reconciliation for encounters spanning chunk boundaries
- Pending-to-final encounter workflow
- Complete audit trail and metrics tracking
- Built with forward eye for;
    - Profile classification system (supporting multi-profile framework)
    - Manual user/provider input via the app dashboard 
    - 4-tier data quality grading system, including attribution tracking and labeling for every clinical entity data point.
    - Can intelligently handle cases like non-health-related content or blank pages

## Documentation Structure

### Core System Architecture (Read in Order)

1. **[01-SYSTEM-OVERVIEW.md](./01-SYSTEM-OVERVIEW.md)**
   - What is Strategy A and how does it work?
   - High-level architecture diagram
   - Integration with Pass 1/2

2. **[02-SCRIPT-ANALYSIS-V3.md](./02-SCRIPT-ANALYSIS-V3.md)**
   - TypeScript file structure
   - Code organization and patterns
   - Database access layer

3. **[03-TABLE-DESIGN-V3.md](./03-TABLE-DESIGN-V3.md)**
   - Complete database schema
   - Table relationships
   - Migration history

### AI Prompt & Processing

4. **[04-PROMPT-V11-SPEC.md](./04-PROMPT-V11-SPEC.md)**
   - AI prompt specification
   - Expected JSON output format
   - Confidence scoring

5. **[05-CASCADE-IMPLEMENTATION.md](./05-CASCADE-IMPLEMENTATION.md)**
   - How cascade reconciliation works
   - Handoff package format
   - Multi-chunk encounter linking

6. **[06-BATCHING-TASK-DESIGN-V2.md](./06-BATCHING-TASK-DESIGN-V2.md)**
   - Page separation analysis
   - Safe split point detection
   - Pass 1/2 batching strategy

7. **[07-OCR-INTEGRATION-DESIGN-v2.md](./07-OCR-INTEGRATION-DESIGN-v2.md)**
   - OCR provider integration
   - Text extraction workflow
   - Coordinate mapping

### Reconciliation & Data Quality

8. **[08-RECONCILIATION-STRATEGY-V2.md](./08-RECONCILIATION-STRATEGY-V2.md)**
   - Pending-to-final encounter reconciliation
   - Multi-value merging logic
   - Cascade chain completion

10. **[10-PROFILE-CLASSIFICATION-INTEGRATION.md](./10-PROFILE-CLASSIFICATION-INTEGRATION.md)**
    - Patient identity classification
    - Orphan identity detection
    - Profile matching workflow

11. **[11-DATA-QUALITY-SYSTEM.md](./11-DATA-QUALITY-SYSTEM.md)**
    - Confidence scoring
    - Quality criteria validation
    - Manual review triggers

12. **[12-ENCOUNTER-SOURCES-V2.md](./12-ENCOUNTER-SOURCES-V2.md)**
    - Real-world vs pseudo encounters
    - Source attribution
    - Provenance tracking

### Date Handling & Edge Cases

16. **[16-DATE-FORMAT-ARCHITECTURE-v2.md](./16-DATE-FORMAT-ARCHITECTURE-v2.md)**
    - Date normalization (DD/MM/YYYY, text formats)
    - Ambiguity detection
    - Metadata tracking

16b. **[16b-DOB-SANITY-CHECK-MANUAL-REVIEW-PROPOSAL.md](./16b-DOB-SANITY-CHECK-MANUAL-REVIEW-PROPOSAL.md)**
    - DOB year validation (1900-present)
    - Manual review queue integration
    - Data quality escalation

17. **[17-ENCOUNTER-DATE-SYSTEM.md](./17-ENCOUNTER-DATE-SYSTEM.md)**
    - Date waterfall hierarchy
    - ai_extracted → file_metadata → upload_date
    - Pseudo encounter date handling

14. **[14-EDGE-CASE-NON-ENCOUNTER-PAGES-v3.md](./14-EDGE-CASE-NON-ENCOUNTER-PAGES-v3.md)**
    - Cover pages, indices, blank pages
    - Edge case detection
    - Non-clinical content handling

### Future Features

13. **[13-MANUAL-ENCOUNTERS-FUTURE.md](./13-MANUAL-ENCOUNTERS-FUTURE.md)**
    - Manual encounter creation
    - User-initiated data entry
    - Future enhancements

15. **[15-DOCUMENT-AUDIT-VIEWER-HEATMAP-UI.md](./15-DOCUMENT-AUDIT-VIEWER-HEATMAP-UI.md)**
    - Proposed audit viewer UI
    - Confidence heatmap visualization
    - Click-through to source

### Quality Assurance

- **[VERIFICATION-MATRIX.md](./VERIFICATION-MATRIX.md)**
  - Test coverage matrix
  - Validation checklist
  - Production readiness criteria

- **[STRATEGY-A-DATA-QUALITY-AUDIT.md](./STRATEGY-A-DATA-QUALITY-AUDIT.md)**
  - Data quality audit findings
  - Improvement recommendations
  - Compliance verification

---

## Common Tasks

### I need to understand how cascading works
→ Read [05-CASCADE-IMPLEMENTATION.md](./05-CASCADE-IMPLEMENTATION.md)

### I need to debug a date parsing issue
→ Read [16-DATE-FORMAT-ARCHITECTURE-v2.md](./16-DATE-FORMAT-ARCHITECTURE-v2.md)
→ Check [OPEN-ISSUES-AND-FUTURE-WORK.md](./OPEN-ISSUES-AND-FUTURE-WORK.md) ISSUE-003

### I'm seeing NULL DOB values
→ Check [16b-DOB-SANITY-CHECK-MANUAL-REVIEW-PROPOSAL.md](./16b-DOB-SANITY-CHECK-MANUAL-REVIEW-PROPOSAL.md)
→ Review manual_review_queue table for pending reviews

### I need to understand medical identifiers (MRN, patient ID)
→ Check [OPEN-ISSUES-AND-FUTURE-WORK.md](./OPEN-ISSUES-AND-FUTURE-WORK.md) ISSUE-002
→ **WARNING:** Medical identifiers pipeline is currently incomplete

### I'm planning Pass 2 development
→ Review [OPEN-ISSUES-AND-FUTURE-WORK.md](./OPEN-ISSUES-AND-FUTURE-WORK.md) for blocking issues
→ Read [06-BATCHING-TASK-DESIGN-V2.md](./06-BATCHING-TASK-DESIGN-V2.md) for batching strategy

---

## Active Work Tracking

**Current Status:** Production-ready, operational

**Open Issues:** [OPEN-ISSUES-AND-FUTURE-WORK.md](./OPEN-ISSUES-AND-FUTURE-WORK.md)
- 2 HIGH priority issues (before Pass 2)
- 2 MEDIUM priority reviews
- 3 FUTURE enhancements

**Completed Work:** See `archive-strategy-a/` folder
- Rabbit Hunt (26 issues, 22 fixed)
- Technical Debt (8 items, 7 resolved)

---

## Migration History

**Database Migrations:** See `shared/docs/architecture/database-foundation-v3/migration_history/`

**Key Migrations:**
- Migration 58-59: Audit trail timestamps, metrics
- Migration 60-66: Various fixes (marker fields, DOB checks, constraints)

**Source of Truth Schema:** `shared/docs/architecture/database-foundation-v3/current_schema/`
- `04_ai_processing.sql` - Pass 0.5 tables
- `08_job_coordination.sql` - Job queue, RPCs, metrics

---

## Historical Context

This is **Strategy A** - the third major iteration of Pass 0.5:

1. **Initial Approach** (Week 1-2): Basic encounter discovery, small files only
2. **Progressive Refinement** (Week 3): Added chunking for large documents
3. **Strategy A** (Week 4-5): Cascade reconciliation, pending-to-final workflow

See `../archive-pre-strategy-a/` for earlier iteration documentation.

---

**Last Updated:** 2025-11-24
**Maintainer:** Exora Health Development Team
