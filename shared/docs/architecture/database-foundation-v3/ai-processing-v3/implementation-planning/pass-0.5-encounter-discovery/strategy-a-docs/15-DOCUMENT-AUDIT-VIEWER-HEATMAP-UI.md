# Document Audit Viewer & Heatmap UI - Feature Specification

**Status:** Future Feature (Phase 4+)
**Date:** November 22, 2025
**Priority:** High Value - Post B3 Schema Implementation
**Dependencies:** B3 Schema (Migration 63), page_classification data
**Related:** 14-EDGE-CASE-NON-ENCOUNTER-PAGES-v2.md

---

## EXECUTIVE SUMMARY

This feature specification defines the **Document Audit Viewer** - a comprehensive UI that shows users how Exora processed their uploaded medical documents. It combines visual heatmaps, processing metadata, and click-to-source functionality to build trust, provide transparency, and create a "wow factor" user experience.

**Core Value Propositions:**
1. **Trust & Transparency:** Proves Exora "read every page" of the user's document
2. **Audit Capability:** Users can verify processing accuracy and completeness
3. **Engineering Tool:** Supports refinement and debugging during development
4. **Click-to-Source:** Implements provenance tracking for clinical entities
5. **Wow Factor:** Differentiates Exora from competitors with visual processing transparency

---

## FEATURE OVERVIEW

### What Users See

**After document processing completes, users can:**
1. Click "View Processing Audit" button on document card
2. See their uploaded PDF with rich processing metadata overlay
3. View visual heatmap showing page classifications and encounter boundaries
4. Click any clinical entity on dashboard → jump to source page with highlighting
5. Verify all pages were processed (completeness check)
6. Understand why certain pages didn't yield clinical data (blank, administrative, etc.)

---

## USER STORIES

### Story 1: Verify Processing Completeness
**As a** user who uploaded a 142-page hospital discharge summary
**I want to** see that all 142 pages were processed
**So that** I can trust that no medical data was missed

**Acceptance Criteria:**
- UI shows: "142 pages processed: 141 clinical, 1 administrative"
- Visual heatmap displays all 142 pages with color coding
- User can see why page 142 was classified as administrative (Epic footer)

---

### Story 2: Understand "No Encounters Found" Message
**As a** user who uploaded a 10-page document but got "No encounters found"
**I want to** see why the system didn't find encounters
**So that** I know if it's a processing error or just blank pages

**Acceptance Criteria:**
- UI shows: "10 pages processed, 0 encounters found"
- Heatmap shows: 1 clinical page (GP summary), 9 blank pages
- User understands the document was processed correctly but contained mostly blanks

---

### Story 3: Click-to-Source from Dashboard Entity
**As a** user viewing my medical timeline
**I want to** click any lab result or diagnosis to see the original source document
**So that** I can verify the AI extracted the data correctly

**Acceptance Criteria:**
- User clicks "Hemoglobin: 12.5" on dashboard
- Document Audit Viewer opens to the specific page containing that result
- Relevant text is highlighted on the page
- Processing metadata shows confidence scores and extraction details

---

### Story 4: Engineer Debugging Processing Issues
**As an** Exora engineer investigating why a document was processed incorrectly
**I want to** see the full processing metadata for each page
**So that** I can identify prompt issues or model failures

**Acceptance Criteria:**
- Engineer can enable "Debug Mode" view
- Metadata panel shows AI classification reasoning for each page
- Confidence scores, OCR quality, processing times visible
- Can see which chunks each page belonged to

---

## VISUAL DESIGN CONCEPT

### Heatmap Bar (Top of Viewer)

```
┌─────────────────────────────────────────────────────────────────┐
│  Page Heatmap (142 pages)                                       │
│  ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓░              │
│  └─────────────── Encounter 1 (141 pages) ────┘ Admin           │
│                                                                  │
│  Legend:  ▓ Clinical   ░ Administrative   □ Blank   ▨ Separator │
└─────────────────────────────────────────────────────────────────┘
```

**Heatmap Features:**
- **Color Coding:**
  - Dark blue (`▓`): Clinical content pages
  - Light gray (`░`): Administrative pages (signatures, metadata)
  - White (`□`): Blank pages
  - Diagonal stripes (`▨`): Separator pages
- **Hover Interaction:** Hovering over a segment shows page number and classification
- **Click Interaction:** Clicking a segment scrolls to that page in viewer below
- **Encounter Boundaries:** Visual brackets show which pages belong to which encounter

---

### Document Viewer (Main Panel)

```
┌────────────────────────────────────────────────────────────────┐
│  [<] Page 141 of 142 [>]                    [🔍 Zoom] [⚙️ Settings] │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│   ┌─────────────────────────────┐   ┌──────────────────────┐ │
│   │                             │   │ Page Metadata        │ │
│   │   [PDF PAGE RENDER]         │   │                      │ │
│   │                             │   │ Classification:      │ │
│   │   Clinical note content     │   │ ✓ Clinical           │ │
│   │   with highlighting for     │   │                      │ │
│   │   extracted entities        │   │ Encounter:           │ │
│   │                             │   │ Hospital Admission   │ │
│   │                             │   │ (Nov 29 - Dec 7)     │ │
│   │                             │   │                      │ │
│   │                             │   │ Processing:          │ │
│   │                             │   │ ✓ OCR Complete       │ │
│   │                             │   │ ✓ Pass 0.5 Complete  │ │
│   │                             │   │ ⏳ Pass 2 Pending     │ │
│   │                             │   │                      │ │
│   │                             │   │ Confidence: 94%      │ │
│   │                             │   │                      │ │
│   └─────────────────────────────┘   └──────────────────────┘ │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

**Viewer Features:**
- **PDF Rendering:** Display actual PDF page content
- **Entity Highlighting:** Clinical entities extracted by Pass 2 highlighted with colored boxes
- **Metadata Panel:** Shows processing details for current page
- **Navigation:** Previous/Next page buttons, jump to page input
- **Zoom Controls:** Fit to width, fit to height, custom zoom levels

---

### Processing Statistics Summary

```
┌────────────────────────────────────────────────────────────────┐
│  Processing Summary                                            │
├────────────────────────────────────────────────────────────────┤
│  Document: 006_Emma_Thompson_Hospital_Encounter_Summary.pdf    │
│  Total Pages: 142                                              │
│                                                                │
│  Encounters Detected: 1                                        │
│  └─ Hospital Admission (Real-World Visit)                      │
│      Pages 1-142 (Nov 29 - Dec 7, 2022)                        │
│      └─ Clinical Content: Pages 1-141                          │
│      └─ Administrative: Page 142 (Epic signature footer)       │
│                                                                │
│  Page Classification Breakdown:                                │
│  ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ 141 Clinical (99.3%)   │
│  ░ 1 Administrative (0.7%)                                     │
│  □ 0 Blank (0%)                                                │
│                                                                │
│  Processing Status: ✓ Complete                                 │
│  └─ Pass 0.5 (Encounter Discovery): ✓ Complete                 │
│  └─ Pass 2 (Clinical Extraction): ⏳ In Progress               │
│  └─ Pass 3 (Narrative Generation): ⏳ Pending                  │
└────────────────────────────────────────────────────────────────┘
```

---

## DATA REQUIREMENTS

### Required from Pass 0.5 (B3 Schema)

**From `pass05_page_assignments` table:**
```sql
SELECT
  page_num,
  encounter_id,
  justification,
  page_classification,          -- NEW: clinical, administrative, blank, etc.
  is_clinically_relevant,       -- NEW: boolean for filtering
  related_encounter_id,         -- NEW: optional link to related encounter
  metadata                      -- NEW: JSONB with additional details
FROM pass05_page_assignments
WHERE shell_file_id = $1
ORDER BY page_num;
```

**From `healthcare_encounters` table:**
```sql
SELECT
  id,
  encounter_type,
  encounter_start_date,
  encounter_end_date,
  is_real_world_visit,
  provider_name,
  facility_name,
  page_ranges                   -- Which pages belong to this encounter
FROM healthcare_encounters
WHERE shell_file_id = $1;
```

### Required from Pass 2 (Clinical Extraction)

**Entity Highlighting Data:**
```typescript
interface ExtractedEntity {
  entity_type: 'diagnosis' | 'procedure' | 'medication' | 'lab_result' | 'vital_sign';
  entity_value: string;
  page_num: number;
  bounding_box?: {
    page: number;
    x: number;
    y: number;
    width: number;
    height: number;
  };
  confidence: number;
}
```

---

## TECHNICAL ARCHITECTURE

### Component Structure

```
DocumentAuditViewer/
├── components/
│   ├── HeatmapBar.tsx          # Visual heatmap at top
│   ├── PDFViewer.tsx           # PDF rendering with react-pdf
│   ├── MetadataPanel.tsx       # Right-side panel with page details
│   ├── ProcessingStats.tsx    # Summary statistics
│   ├── EntityHighlights.tsx   # Overlay for entity highlighting
│   └── NavigationControls.tsx # Zoom, page navigation
├── hooks/
│   ├── usePageClassifications.ts  # Fetch B3 data
│   ├── useEncounterBoundaries.ts  # Fetch encounter ranges
│   ├── useExtractedEntities.ts    # Fetch Pass 2 entities
│   └── useDocumentNavigation.ts   # Page navigation state
└── utils/
    ├── colorScheme.ts          # Heatmap color definitions
    ├── boundingBoxRenderer.ts  # Entity highlighting logic
    └── pdfLoader.ts            # PDF document loading
```

### Key Technologies

**PDF Rendering:**
- `react-pdf` for PDF display
- `pdfjs-dist` for PDF.js backend
- Canvas-based rendering for performance

**Highlighting:**
- SVG overlay layer for entity bounding boxes
- Color-coded by entity type (diagnosis=red, medication=blue, etc.)
- Tooltip on hover showing entity details

**Data Fetching:**
- React Query for caching page classification data
- Real-time updates for processing status (Pass 2/3 progress)
- Optimistic UI updates

---

## INTEGRATION POINTS

### 1. Document Card → Audit Viewer

**From document list page:**
```typescript
<DocumentCard
  document={doc}
  onViewAudit={() => router.push(`/documents/${doc.id}/audit`)}
/>
```

**Route:**
```
/documents/[shell_file_id]/audit
```

---

### 2. Dashboard Entity → Audit Viewer (Click-to-Source)

**From medical timeline:**
```typescript
<ClinicalEntity
  entity={entity}
  onViewSource={() => {
    router.push(`/documents/${entity.shell_file_id}/audit?page=${entity.page_num}&highlight=${entity.id}`);
  }}
/>
```

**URL Parameters:**
- `page`: Jump to specific page number
- `highlight`: Highlight specific entity by ID
- `encounter`: Filter to specific encounter (optional)

---

### 3. Processing Status Integration

**Real-time updates:**
```typescript
// Subscribe to processing status via Supabase Realtime
const { data: processingStatus } = useSubscription(
  'shell_files',
  `id=eq.${shellFileId}`,
  {
    select: 'pass_0_5_completed, pass_1_completed, pass_2_completed, pass_3_completed'
  }
);

// Show progress in metadata panel
<ProcessingStatusBadge status={processingStatus} />
```

---

## USER EXPERIENCE FLOWS

### Flow 1: User Uploads Document and Views Audit

1. User uploads `discharge_summary.pdf` (142 pages)
2. Processing begins (Pass 0.5 runs in background)
3. User sees: "Processing... 0 of 142 pages analyzed"
4. After Pass 0.5 completes: "✓ Processing complete. View Audit"
5. User clicks "View Audit"
6. Document Audit Viewer opens showing:
   - Heatmap: 141 clinical pages (blue) + 1 admin page (gray)
   - Page 1 displayed by default
   - Metadata panel shows: "Encounter 1: Hospital Admission"
7. User scrolls through document, sees all pages were processed
8. User gains confidence in Exora's accuracy

---

### Flow 2: User Investigates "No Encounters Found"

1. User uploads `blank_scan.pdf` (10 pages)
2. Processing completes: "No encounters found"
3. User confused: "Did it process my document?"
4. User clicks "View Audit"
5. Viewer shows:
   - Heatmap: 10 white squares (all blank)
   - Metadata for page 1: "Classification: Blank - No healthcare content detected"
   - Processing stats: "10 pages processed, 0 encounters, 10 blank pages"
6. User understands: Document was processed correctly, just contained no medical content
7. User satisfied with transparency

---

### Flow 3: User Clicks Diagnosis on Dashboard to See Source

1. User viewing medical timeline
2. User sees: "Type 2 Diabetes Mellitus" diagnosed on Nov 30, 2022
3. User clicks diagnosis to view source
4. Document Audit Viewer opens to page 23 (where diagnosis appears)
5. Text "Type 2 Diabetes Mellitus" highlighted in red box
6. Metadata shows: "Extracted by Pass 2 - Confidence: 96%"
7. User verifies diagnosis is correctly extracted
8. User returns to timeline with increased trust in data accuracy

---

## PHASE IMPLEMENTATION PLAN

### Phase 4A: Basic Heatmap & Viewer (MVP)
**Dependencies:** B3 schema deployed (Migration 63)

**Features:**
- Visual heatmap bar showing page classifications
- PDF viewer with page navigation
- Basic metadata panel (classification, encounter, processing status)
- Processing statistics summary

**Estimate:** 2-3 weeks development

---

### Phase 4B: Entity Highlighting
**Dependencies:** Pass 2 clinical extraction deployed

**Features:**
- Bounding box overlay for extracted entities
- Color-coded by entity type
- Tooltip on hover showing entity details
- Click entity to jump to that occurrence in document

**Estimate:** 1-2 weeks development

---

### Phase 4C: Click-to-Source Integration
**Dependencies:** Phase 4A + 4B complete

**Features:**
- Dashboard entity cards link to Audit Viewer
- URL parameter support (page, highlight, encounter)
- Deep linking from any clinical entity

**Estimate:** 1 week development

---

### Phase 4D: Advanced Features (Polish)

**Features:**
- Search within document
- Download annotated PDF with highlights
- Debug mode for engineers (full metadata)
- Comparison view (before/after processing)
- Print-friendly version

**Estimate:** 2-3 weeks development

---

## SUCCESS METRICS

### User Engagement
- **Metric:** % of users who view audit for at least one document
- **Target:** 40% of active users (indicates trust-building)

### Click-to-Source Usage
- **Metric:** % of entity clicks that use click-to-source feature
- **Target:** 25% of entity interactions

### Support Ticket Reduction
- **Metric:** Reduction in "missing data" support tickets
- **Target:** 30% reduction after feature launch

### Processing Trust Score
- **Metric:** User survey question: "I trust Exora's processing accuracy" (1-5 scale)
- **Target:** Average score ≥ 4.2 (up from baseline 3.8)

---

## COST ANALYSIS

### Development Cost
- **Phase 4A (MVP):** ~80-120 hours (2-3 weeks)
- **Phase 4B (Highlighting):** ~40-80 hours (1-2 weeks)
- **Phase 4C (Click-to-Source):** ~40 hours (1 week)
- **Phase 4D (Polish):** ~80-120 hours (2-3 weeks)
- **Total:** ~240-360 hours (6-9 weeks)

### Ongoing Cost
- **Storage:** Minimal (uses existing B3 schema data)
- **Compute:** PDF rendering on client-side (no server cost)
- **Bandwidth:** PDF already stored in Supabase Storage (no additional transfer)

---

## RISKS & MITIGATIONS

### Risk 1: PDF Rendering Performance
**Issue:** Large PDFs (300+ pages) may render slowly in browser

**Mitigation:**
- Lazy load pages (only render visible + adjacent pages)
- Use PDF.js worker threads for parsing
- Implement virtual scrolling for heatmap
- Show loading skeleton while rendering

---

### Risk 2: Bounding Box Accuracy
**Issue:** AI-generated bounding boxes may not perfectly align with text

**Mitigation:**
- Allow users to report misalignment (feedback button)
- Use OCR coordinates as fallback if AI boxes unavailable
- Display entity value in tooltip (user can verify even if highlight is off)

---

### Risk 3: B3 Schema Not Yet Deployed
**Issue:** Feature depends on page classification data from Migration 63

**Mitigation:**
- Phase 4A development can start before B3 deployment (use mock data)
- Launch feature in "beta" mode initially (opt-in for early adopters)
- Backfill classification for existing documents post-deployment

---

## OPEN QUESTIONS

1. **Should audit viewer be public or private?**
   - Private: Only document owner can view
   - Public: Share link to show processing to doctors/family
   - Recommendation: Private by default, shareable link optional

2. **What level of detail in metadata panel?**
   - Minimal: Just classification and encounter
   - Moderate: Add processing times, confidence scores
   - Maximum: Debug mode with full AI reasoning
   - Recommendation: Minimal by default, debug mode for engineers

3. **Should we show OCR text overlay?**
   - Pro: Users can search within document
   - Con: OCR errors may confuse users
   - Recommendation: Show OCR in debug mode only

4. **How to handle multi-patient documents?**
   - Show warning banner: "This document contains data for multiple patients"
   - Color-code heatmap by patient identity
   - Filter view to single patient
   - Recommendation: Implement patient filter in Phase 4B

---

## FUTURE ENHANCEMENTS (Phase 5+)

1. **AI Reasoning Transparency:**
   - Show AI's classification reasoning for each page
   - Example: "Page 142 classified as administrative because it contains only Epic footer signature block with no clinical content"

2. **Correction Interface:**
   - Allow users to correct misclassifications
   - Example: "This page was marked blank but has faint handwritten notes"
   - Feedback loop improves AI training

3. **Document Comparison:**
   - Compare two versions of same document
   - Highlight differences in processing results
   - Useful for before/after model updates

4. **Processing Replay:**
   - Animated playback showing how document was processed
   - Visualize chunking, cascade detection, reconciliation
   - Educational tool for users and engineers

---

## RELATED DOCUMENTS

- **B3 Schema Design:** `14-EDGE-CASE-NON-ENCOUNTER-PAGES-v2.md`
- **Pass 0.5 Architecture:** `V3_ARCHITECTURE_MASTER_GUIDE.md`
- **Click-to-Source Spec:** (To be created - future design specs)

---

## DECISION LOG

**November 22, 2025:**
- Feature specification created based on external AI assistant's Document Heatmap idea
- Enhanced original concept with audit processing view and click-to-source integration
- Identified Phase 4 as implementation timeline (post B3 schema deployment)
- Estimated 6-9 weeks development across 4 sub-phases
- Prioritized trust-building and transparency as core value propositions

**Next Review:** After B3 schema (Migration 63) is designed and approved

---

**End of Feature Specification**
