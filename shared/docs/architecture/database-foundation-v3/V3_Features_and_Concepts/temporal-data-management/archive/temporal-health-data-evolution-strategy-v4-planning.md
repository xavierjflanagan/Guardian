# Temporal Health Data Evolution Strategy V4: Complete Planning Architecture

**Status:** Planning Document  
**Date:** 10 September 2025  
**Purpose:** Comprehensive text-based planning for V4 implementation addressing all identified gaps and scenarios

---

## Executive Summary

V4 represents the complete, production-ready architecture for Exora's temporal health data management. This planning document addresses all real-world scenarios, implements sophisticated deduplication at both clinical event and narrative levels, and provides clear rules for master narrative creation and management.

**Key Evolution from V3 planning version:**
- Complete clinical event deduplication with deterministic supersession tracking
- Narrative storage and update mechanisms fully defined with temporal metadata
- Timeline & narrative integration architecture for dual healthcare journey views
- Deterministic conflict resolution using temporal precedence (no review queues needed)
- Timeline-based master narrative categories (longterm/shortterm journeys, routine care, general health)
- Clear search-before-create logic for all entities
- Comprehensive supersession types including TEMPORAL_ONLY failsafe

---

## Part 1: Clinical Event Deduplication & Supersession System

### 1.1 Core Concept

Every clinical event table (medications, conditions, allergies, procedures) maintains a single "current" row per medical code, with all 'effective'-historical rows marked as superseded. This ensures the frontend always has clean, deduplicated data while preserving complete history.

### 1.2 Deduplication Workflow

**When Pass 2 creates a new clinical event:**

1. **Code-Based Grouping:** Group all existing records (rows in the table) that share the same medical code
2. **Temporal Analysis:** Compare clinical 'effective' dates using pre-written functions (shell_file 'upload date' as fall back, maybe with a flag for user to review nad confirm the effective date)
3. **Supersession Decision:** Deterministic logic marks older records (as per effective date) as superseded
4. **Single Active Row:** Only one row per medical code remains active

**Key Principles:** 
- Supersession uses deterministic functions based on temporal data and medical codes - no AI decision making needed
- **Temporal precedence is ultimate:** When same entity (same medical code) has different clinical effective dates, newer date always wins
- **No review queues:** System handles all supersession automatically using temporal logic

### 1.3 Supersession States

Each clinical event row contains:
- **valid_from:** When this record became clinically effective
- **valid_to:** When superseded (NULL if current)
- **superseded_by_record_id:** Points to the record that replaced this one
- **supersession_reason:** Why this was superseded
- **is_current:** Boolean flag for quick filtering (derived from valid_to IS NULL)

### 1.4 Supersession Decision Types

The system uses four deterministic supersession types, organized by the function logic that determines them:

#### **Data Comparison Types** (Field-by-field analysis)

**EXACT_DUPLICATE:** All fields identical between records
- **Logic**: `old.all_fields === new.all_fields`
- **Action**: Mark older record as superseded
- **Reason**: "duplicate_consolidated"
- **Example**: Same medication list in discharge summary and GP letter

**PARAMETER_CHANGE:** Same entity with modified parameters  
- **Logic**: `old.medical_code === new.medical_code && old.parameters ≠ new.parameters`
- **Action**: Mark older record as superseded
- **Reason**: Specific change (e.g., "dosage_10mg_to_20mg", "frequency_daily_to_twice_daily")
- **Example**: Lisinopril dose increased from 10mg to 20mg

#### **Status/Temporal Types** (Status or date-driven)

**STATUS_CHANGE:** Same entity with different status
- **Logic**: `old.medical_code === new.medical_code && old.status ≠ new.status`
- **Action**: Mark older record as superseded
- **Reason**: Status change (e.g., "medication_discontinued", "condition_resolved")
- **Example**: Active medication changed to discontinued

**TEMPORAL_ONLY:** Same entity, newer date, unclear specific change
- **Logic**: `old.medical_code === new.medical_code && new.clinical_effective_date > old.clinical_effective_date`
- **Action**: Mark older record as superseded (temporal precedence failsafe)
- **Reason**: "temporal_supersession"
- **Example**: Two similar records where Pass 2 couldn't extract clear parameter differences

**Key Principle**: These types are mutually exclusive and applied in order - if EXACT_DUPLICATE fails, try PARAMETER_CHANGE, then STATUS_CHANGE, then TEMPORAL_ONLY as the failsafe.

### 1.5 Frontend Query Pattern

Frontend always queries for current records only:
```
Get all active medications: WHERE valid_to IS NULL
Get medication history: WHERE medical_code = 'RxNorm:29046'
```

This gives clean, deduplicated dashboard while preserving ability to show history.

---

## Part 2: Narrative Storage & Update Architecture

### 2.1 Unified Supersession Model for Everything

**Key Insight:** Both clinical events AND narratives use the same supersession pattern, creating consistency across the entire system.

The difference is WHY they supersede:
- **Clinical events:** Superseded because they're DUPLICATES or UPDATES
- **Narratives:** Superseded because they're EVOLVED VERSIONS incorporating new information

### 2.2 Narrative Supersession Approach

**Every narrative update creates a NEW row, preserving complete history:**

Each narrative row contains:
- **id:** Unique identifier for this version
- **patient_id:** Links to patient
- **shell_file_id:** The upload that triggered this narrative version
- **medical_code/narrative_key:** What this narrative is about
- **narrative_content:** Complete summary at this point in time
- **valid_from:** When this version became active
- **valid_to:** When superseded by newer version (NULL if current)
- **superseded_by_narrative_id:** Points to the newer version
- **supersedes_narrative_id:** Points to the previous version
- **clinical_date_range_start:** Earliest clinical event date in this narrative
- **clinical_date_range_end:** Latest clinical event date in this narrative
- **embedding:** Vector for this version's content

### 2.3 Sub-Narrative Evolution Through Supersession

**How sub-narratives evolve:**

**Upload 1 creates initial narrative:**
- Row 1: Lisinopril narrative v1
- Content: "Started Lisinopril 10mg in January 2024"
- valid_to: NULL (current)
- shell_file_id: upload-1

**Upload 2 triggers update:**
- Row 2: Lisinopril narrative v2 (NEW ROW)
- Content: "Lisinopril started January 2024 at 10mg, increased to 20mg March 2024"
- valid_from: upload-2 date
- valid_to: NULL (now current)
- supersedes_narrative_id: Row 1's ID
- shell_file_id: upload-2

**Row 1 gets updated:**
- valid_to: upload-2 date (no longer current)
- superseded_by_narrative_id: Row 2's ID

**Benefits:**
- Complete audit trail showing narrative evolution
- Each version tied to specific upload
- Can query "what did narrative say on date X"
- Frontend gets current with `WHERE valid_to IS NULL`

### 2.4 Master Narrative Evolution Through Supersession

**Same pattern for master narratives:**

**Upload 1 creates master:**
- Row 1: "Hypertension Control Journey" v1 (LONGTERM category)
- Links to 3 sub-narratives
- Summary incorporates those 3 sub-narratives
- shell_file_id: upload-1

**Upload 2 adds new related sub-narratives:**
- Row 2: "Hypertension Control Journey" v2 (NEW ROW, LONGTERM category)
- Links to 5 sub-narratives (original 3 + 2 new)
- Summary regenerated with all 5 sub-narratives
- supersedes_narrative_id: Row 1's ID
- shell_file_id: upload-2

### 2.5 Critical Design Principle

**Narratives are CUMULATIVE through supersession:**

Unlike clinical events where we choose the "correct" version (newest medication dose), narratives ACCUMULATE information:

- Each new narrative version pulls from ALL previous information PLUS new information
- The narrative updates and grows richer with each upload
- Previous versions provide point-in-time snapshots, allowing users to view the narrative as it existed on any specific date (whether by the clinical effective date or the file upload date - both date types tracked in seperate columns for every row)
- Current version shows everything we know now

**Example Evolution:**
- v1: "Patient on Lisinopril for hypertension"
- v2: "Patient on Lisinopril for hypertension, started Jan 2024"
- v3: "Patient on Lisinopril for hypertension, started Jan 2024 at 10mg, increased to 20mg March 2024"

Each version supersedes the previous, but incorporates all prior knowledge.

### 2.6 Querying Narratives

**For current narratives (frontend default):**
```
SELECT * FROM sub_narratives 
WHERE patient_id = ? 
AND valid_to IS NULL
```

**For narrative at specific date:**
```
SELECT * FROM sub_narratives
WHERE patient_id = ?
AND medical_code = ?
AND valid_from <= '2024-02-15'
AND (valid_to IS NULL OR valid_to > '2024-02-15')
```

**For complete narrative history:**
```
SELECT * FROM sub_narratives
WHERE patient_id = ?
AND medical_code = ?
ORDER BY valid_from DESC
```

### 2.7 Why This Supersession Approach is Superior

**Consistency:** Everything uses the same pattern
- Clinical events: supersession for deduplication
- Narratives: supersession for evolution
- Same queries, same indexes, same mental model

**Auditability:** Complete provenance
- Every narrative version tied to triggering upload
- Can reconstruct narrative state at any point
- Shows evolution of medical understanding

**Performance:** Simple and fast
- Current data: `WHERE valid_to IS NULL`
- No complex JSON operations
- Standard relational patterns

**Clarity:** Easy to understand
- New upload → New narrative row → Old row superseded
- No in-place updates to track
- Clear progression through versions

---

## Part 3: Timeline & Narrative Integration Architecture

### 3.1 Two Complementary Views of Healthcare Journey

**Timeline Events (healthcare_timeline_events):**
- **Purpose**: Chronological ledger for "what happened when"
- **Focus**: Dates, providers, encounters, factual sequences
- **Usage**: Patient portal timeline, quick provider review
- **Data**: Individual events with icons, categories, searchable content
- **Processing**: Pass 2 (structured data extraction)

**Semantic Narratives (clinical_narratives):**
- **Purpose**: Clinical storylines for "why and how", organized hierarchically
- **Focus**: Medical meaning, therapeutic reasoning, cause-effect relationships
- **Usage**: Clinical decision support, comprehensive context understanding
- **Data Structure**:
  - Master narratives: High-level clinical stories organized by timeline (e.g. "Diabetes Management Journey" - LONGTERM, "Knee Surgery Recovery" - SHORTTERM)
  - Sub-narratives: Component storylines that roll up to masters (e.g. "Blood Sugar Control", "Medication Adjustments")
  - One master can have many sub-narratives for complete clinical context, and a sub-narrative can contribute and belong in more than one master narrative.
- **Processing**: Pass 3 (semantic analysis, storyline construction, narrative hierarchy building)

### 3.2 Bi-directional Integration Pattern

**Key Design Principle:** Both systems share the same clinical events foundation, enabling seamless cross-navigation without data duplication.

**Data Flow:**
```
clinical_narratives
  └── Links to: patient_clinical_events (via narrative_id)
    └── Links to: healthcare_timeline_events (via clinical_event_ids array)
```

### 3.3 Timeline Page Enhanced with Narrative Integration

**Default Timeline View:**
- Shows all chronological events for patient
- Each event displays which narrative(s) it belongs to (via badges or listing them out when you click, or some other smart UX method)
- Clean temporal sequence with provider/facility context

**Narrative Filtering:**
- **Filter dropdown**: Option to "filter by narrative", "Show only events from: Hypertension Control Journey" (LONGTERM category)
- **Filtered view**: Timeline shows only events linked to selected narrative
- **Context preservation**: Maintains chronological order even when filtered
- **Visual indicators**: Narrative-specific color coding and icons

**Query Pattern:** Filter timeline events by narrative relationship through shared clinical events.

### 3.4 Narrative Page Enhanced with Timeline Integration

**Narrative Story View:**
- Displays rich clinical storyline with medical reasoning
- Shows narrative date range context: "This story spans March 2023 - August 2024"
- Includes clinical insights and therapeutic decision explanations

**Timeline Integration:**
- **"View Timeline" tab**: Shows chronological events for this specific narrative
- **Date range display**: Visual timeline focused on narrative's clinical date range
- **Event linking**: Click any event mention → jump to timeline view at that date
- **Cross-navigation**: Easy switching between story context and chronological facts

**Query Pattern:** Extract timeline events for narrative through clinical event relationships.

### 3.5 User Experience Workflows

**Timeline → Narrative Flow:**
1. User browsing chronological timeline
2. Sees "Hypertension Control Journey" badge on multiple events
3. Clicks narrative filter or badge
4. Timeline filters to show only hypertension-related events
5. Clicks "View Full Story" → switches to narrative view
6. Gets rich clinical context explaining the timeline events

**Narrative → Timeline Flow:**
1. User reading "Hypertension Control Journey" narrative
2. Narrative mentions "medication increased in March 2024"
3. Clicks "View Timeline" tab
4. Sees chronological view focused on hypertension events
5. Can expand to full timeline to see surrounding context
6. Returns to narrative for clinical reasoning

### 3.6 Temporal Metadata for Narratives

**Clinical Date Range Tracking:**
- **clinical_date_range_start**: Earliest clinical event date within narrative
- **clinical_date_range_end**: Latest clinical event date within narrative
- **Derived from**: Linked clinical events' actual clinical effective dates
- **Updated when**: Narrative evolves through supersession

**Why Date Ranges, Not Points:**
- Narratives ARE timelines spanning periods and naturally have beginning and end dates
- Users think in terms of "when did this health journey occur" or "when did i recover from that illness"
- Enables temporal filtering and context display

**Display Examples:**
- "Hypertension Control Journey: March 2023 - Present" (LONGTERM)
- "Charlie's Pregnancy Journey: January 2024 - September 2024" (SHORTTERM)
- "Surgery Recovery: June 2024 - August 2024"

(side note for future, it would be really cool if users could relable master narratives as they please, such as renaming pregnncy journey narrative to be specific to their child name; "Charlie's pregnancy")

### 3.7 Benefits of Integrated Architecture

**For Users:**
- **Dual perspectives**: Facts prioritized when needed (timeline), context and inter-relationships when needed (narrative)
- **Seamless navigation**: Easy switching between chronological and contextual views
- **Comprehensive understanding**: Both "what happened" and "why it matters"
- **Filtered focus**: Can isolate specific health journeys from overall timeline

**For Clinicians:**
- **Quick overview**: Timeline for rapid chronological assessment
- **Deep context**: Narratives for clinical decision-making
- **Efficient workflow**: Jump between views based on clinical need
- **Complete picture**: Both factual sequence and medical reasoning

**For System:**
- **No data duplication between systems**: Single source of truth in the 'clinical events'
- **Consistent relationships**: Same linking patterns throughout
- **Performance optimized**: Leverages existing indexes and relationships
- **Future-proof**: Can add new views without architectural changes

---

## Part 4: Master Narrative Categories & Assignment Rules

### 4.1 Master Narrative Categories (Timeline-Based Model)

The system organizes master narratives using a user-intuitive timeline model that matches how people naturally think about their health journeys:

**LONGTERM_JOURNEYS:** Ongoing health management over months/years
- **Examples**: "Diabetes Management Journey", "Hypertension Control", "Mental Health Support", "Chronic Pain Management"
- **Assignment**: Sub-narratives spanning >3 months or marked as chronic conditions
- **Characteristics**: No clear end date, evolving treatment plans, ongoing monitoring
- **User Perspective**: "My ongoing health challenges"

**SHORTTERM_JOURNEYS:** Bounded health events with clear beginning and end
- **Examples**: "Pregnancy Journey - Charlie", "Knee Surgery Recovery", "COVID-19 Illness", "Broken Arm Treatment" 
- **Assignment**: Sub-narratives with defined start/end dates, typically <12 months
- **Characteristics**: Clear resolution or completion, focused treatment period
- **User Perspective**: "That time when I..."

**ROUTINE_CARE:** Regular health maintenance and prevention
- **Examples**: "Annual Health Check-ups", "Dental Care Routine", "Vaccination Schedule", "Health Screening Program"
- **Assignment**: Preventive care, routine monitoring, scheduled appointments
- **Characteristics**: Recurring patterns, wellness-focused, no specific health issue
- **User Perspective**: "Keeping myself healthy"

**GENERAL_HEALTH:** Miscellaneous or uncategorized health activities
- **Examples**: "Travel Health Prep", "Sports Physical", "Work Health Requirements", "Insurance Medical"
- **Assignment**: Health activities that don't fit other categories or are ambiguous
- **Characteristics**: Administrative, one-off events, unclear timeline
- **User Perspective**: "Other health stuff"

**Key Benefits:**
- **Intuitive boundaries**: Clear distinction between ongoing vs bounded vs routine
- **User relabeling supported**: "Pregnancy Journey" → "Charlie's Pregnancy Journey"
- **Future-proof**: Accommodates any health scenario without category confusion

### 4.2 Master Narrative Assignment Logic (AI-Driven)

**Pass 3 AI Workflow:**

1. **Provide Complete Context to AI:**
   - A list of patient's existing master narratives and sub-narratives (titles, categories, summaries, date ranges) via embedding matched threshold criteria (all prexisting subnarratives previously embedded and pulled to the surface if relevant)
   - All new clinical events from current file upload requiring narrative assignment

2. **AI Assignment Prompt Framework:**
   ```
   "Given the patient's existing relevant narratives and new clinical events, make intelligent decisions:

   OPTION 1 - Link to Existing Master +/- sub-narrative:
   - Does this new content naturally belong with an existing master narrative +/- sub-narrative?
   - Consider medical relationships, temporal overlap, and clinical coherence
   
   OPTION 2 - Create New Master and/or sub-narrative:
   - If creating new master, categorize using timeline intuition:
     * LONGTERM_JOURNEYS: Chronic conditions, ongoing management (months/years)
     * SHORTTERM_JOURNEYS: Bounded episodes with clear start/end (weeks/months)  
     * ROUTINE_CARE: Regular preventive care, maintenance visits
     * GENERAL_HEALTH: Administrative, one-off, or unclear timeline events
   
   Use clinical reasoning and timeline patterns, not rigid rules."
   ```

3. **AI Decision Advantages:**
   - **Pattern recognition:** Identifies subtle medical relationships across narratives
   - **Temporal reasoning:** Understands healthcare journey timelines naturally
   - **Context awareness:** Sees full patient picture for coherent assignments
   - **Flexibility:** Handles edge cases through reasoning rather than error-prone if/then logic

4. **Output Validation:**
   - AI provides reasoning for assignment decision
   - Links created between sub-narratives and chosen/created master narratives
   - Timeline category assignment logged for consistency

### 4.3 Many-to-Many Relationship Handling

**Design Principle:** Sub-narratives naturally may belong to multiple masters

**Examples:**
- Blood pressure readings → "Hypertension Control" (LONGTERM_JOURNEYS) + "Heart Surgery Recovery" (SHORTTERM_JOURNEYS)
- Weight tracking → "Diabetes Management Journey" (LONGTERM_JOURNEYS) + "Annual Health Check-ups" (ROUTINE_CARE)
- Cholesterol labs → Multiple longterm condition management masters

**Implementation:**
- Junction table linking sub-narratives to master narratives
- Each link includes relevance score and reason
- UI shows sub-narrative in context of each master

---

## Part 5: Pass 3 Complete Workflow

### 5.1 Input Processing

**Pass 3 receives:**
1. All enriched clinical events from Pass 2
2. All relevant master narratives and sub-narratives for patient (for context and potential updates)
3. Patient core context
   - Demographic data 
   - A Grand narrative: A comprehensive yet succint summary of all master narratives (the "grand narrative") providing a high-level overview wth token length minimized.

### 5.2 Search Before Create Logic

**For Sub-Narratives:**
1. **Exact match search:** Medical code equality (potentially a few code systems used in parralel)
2. **Semantic search:** Embedding similarity > 0.85
3. **Fuzzy match:** Name variations, abbreviations
4. **Decision:** Update if found, create if not

**For Master Narratives:**
1. **Timeline category detection:** Determine ONGOING-LONGTERM/SHORTTERM/ROUTINE_CARE/GENERAL_HEALTH
2. **Existing search:** Find and pull masters in same timeline category
3. **Semantic search:** Pull up all master narratives above a defined embedding threshold, like with sub-narratives
4. **Temporal check:** Look for time-overlapping masters
5. **Decision:** Link to existing or create new

### 5.3 Processing Steps

**Step 1: Sub-Narrative Processing**
- For each clinical event
- Search for existing sub-narrative
- Update timeline and summary if exists
- Create new if not exists
- Generate/update embedding

**Step 2: Master Narrative Determination**
- Analyze all sub-narratives collectively
- Determine required master narrative timeline categories
- Search for existing masters (auto-pull all masters attached to pulled existing sub-narratives)
- Create new masters where needed

**Step 3: Linking**
- Connect sub-narratives to appropriate masters
- Handle many-to-many relationships
- Calculate relevance scores

**Step 4: Summary Generation**
- Regenerate all affected narrative summaries
- Update embeddings for future matching
- Store version history

### 5.4 AI Context Management

**Challenge:** How to provide sufficient context without overwhelming token limits

**Solution:**
- **Hierarchical loading:** Load master narratives first (summaries only)
- **Relevant subset:** Only load sub-narratives related to current events (via codes and embeddings)
- **Summarization:** Use compressed representations for context
- **Pagination:** Process in batches if needed

---

## Part 6: Date Conflict Resolution Framework

### 6.1 Date Hierarchy

Every clinical event needs both:
1. **clinical effective date:** Extracted from uploaded file content
2. **file upload date:** When file was uploaded (fallback)

### 6.2 Date Extraction Priority

1. **Explicit date in text:** "Started Lisinopril on January 15, 2024"
2. **Document date:** Date on the ulpoaded medical file
3. **Document metadata:** Creation date from file
4. **Upload date:** Final fallback

### 6.3 Conflict Resolution

**When dates conflict between files:**

**Approach:**
- Use most recent file's date as truth
- Apply temporal precedence automatically
- Store all conflicting dates for audit

**Storage:**
- 'primary clinical date': The accepted date
- 'date confidence': 'high', 'medium', 'low', 'conflicted'
- conflicting_dates: Array of all mentioned dates
- supersession_reason: Reason for temporal precedence decision

### 6.4 User Edit Integration

**When user edits via dashboard:**
- Create pseudo clinical event
- Mark as user_generated source
- Apply same deterministic deduplication logic
- Process automatically using temporal precedence (no review needed)
- Update narratives accordingly

---

## Part 7: Real-World Scenario Solutions

### Scenario 1: Duplicate Medication Lists
**Situation:** Discharge summary and GP letter both list same medications

**Solution:**
1. Pass 2 assigns same RxNorm codes
2. Post-processing groups by code
3. Function identifies as EXACT_DUPLICATE (identical data comparison)
4. Older record marked superseded
5. Provenance tracks both mentions
6. Sub-narrative shows "Confirmed in 2 documents"

### Scenario 2: Dosage Change
**Situation:** Consultant letter shows Lisinopril increased from 10mg to 20mg

**Solution:**
1. Same RxNorm code identified
2. Function detects change and applies reason classification (same medication, different dose parameters)
3. Old 10mg record marked superseded
4. Reason: "dosage_increased_10mg_to_20mg"
5. Sub-narrative timeline shows progression
6. Timeline-appropriate master narrative reflects current state

### Scenario 3: Terminology Variations
**Situation:** "Lupus" in one document, "SLE" in another

**Solution:**
1. Both map to ICD-10 code M32.9
2. Grouped as same condition
3. Sub-narrative uses canonical name
4. Preserves both original terms
5. Shows terminology variations in provenance

### Scenario 4: Allergy Hierarchies
**Situation:** "Seafood allergy" vs "Shellfish allergy"

**Solution:**
1. Use SNOMED CT hierarchy
2. Recognize shellfish as subset of seafood
3. Keep more specific term (shellfish) using temporal precedence
4. Apply TEMPORAL_ONLY if specific relationship unclear
5. Sub-narrative notes relationship

### Scenario 5: Surgical History (Procedures within Interventions)
**Situation:** Multiple documents list same surgeries

**Solution:**
1. Procedures handled within `patient_interventions` table (follows O3 classification)
2. Use SNOMED procedure codes and Australian MBS codes for identification
3. Apply same deduplication logic as medications using procedure codes
4. Intervention types: 'minor_procedure', 'surgery', 'therapy'
5. Keep single record per procedure with provenance tracking
6. Leverage existing intervention fields: technique, equipment_used, immediate_outcome

### Scenario 6: User Dashboard Edits
**Situation:** User marks medication as discontinued

**Solution:**
1. Create user_generated clinical event
2. Process through same deterministic pipeline
3. Mark previous record as superseded automatically
4. Apply temporal precedence (user edit gets current timestamp)
5. Update narratives with user input

### Scenario 7: Timeline-Narrative Integration
**Situation:** User wants to see hypertension events chronologically

**Solution:**
1. From narrative page, click "View Timeline" tab
2. System filters timeline events linked to hypertension narrative
3. Shows chronological sequence of BP readings, med changes, visits
4. User can expand to full timeline or return to narrative story
5. Seamless navigation between factual timeline and clinical meaning

### Scenario 8: Frontend Display
**Situation:** Show only current medications

**Solution:**
1. Query WHERE valid_to IS NULL
2. Each medication appears once
3. Click shows sub-narrative
4. Sub-narrative shows full history
5. Timeline-categorized master narrative provides context

### Scenario 9: Temporal Conflict Resolution (Outdated Files)
**Situation:** Second upload contains older clinical information than first upload

**Example:**
- Upload 1 (Jan 01 2025): Recent discharge summary - "Lisinopril discontinued Dec 2024"
- Upload 2 (Jan 02 2025): Old GP letter from Nov 2024 - "Patient on Lisinopril 10mg daily"

**Solution:**
1. **Code-Based Grouping:** Both records have same RxNorm code → grouped for analysis
2. **Temporal Function Logic:** Compare clinical_effective_date (not upload_date)
   - Nov 2024 record (stating medication active) is older than Dec 2024 record (discontinued)
   - Function determines: Dec record should supersede Nov record
3. **Deterministic Supersession:** Mark newer upload (but November record) as superseded
   - `supersession_reason`: "clinically_outdated_information" 
   - `valid_to`: Dec 2024 (when medication was actually discontinued)
4. **Result:** Timeline correctly shows medication active through Nov, discontinued Dec
5. **No AI needed:** Pure temporal logic using extracted clinical dates

**Key Principle:** Supersession based on clinical timeline, not upload sequence

### Scenario 10: Narrative Intelligence  
**Situation:** Determine which timeline-categorized master narrative for new events

**Solution:**
1. Pass 3 loads all relevant master and sub-narratives, as per medical codes and embedding thresholds
2. Uses medical codes for sub-narrative matching
3. Uses timeline category + embedding for master matching
4. Creates new masters when needed
5. Handles many-to-many relationships

---

## Part 8: Implementation Phases

### Phase 1: Foundation (Week 1-2)
**Goal:** Core infrastructure for deduplication

**Tasks:**
- Add temporal tracking fields to all clinical tables (medications, conditions, allergies)
- Extend intervention table deduplication to include procedures using SNOMED/MBS codes
- Implement medical code assignment in Pass 2 for all entity types
- Create post-processing normalization functions
- Add date extraction and conflict resolution

**Deliverables:**
- Clinical events properly deduplicated (medications, conditions, allergies, procedures)
- Single active row per medical code across all clinical entities
- Historical records preserved with complete supersession chains

### Phase 2: Narrative System (Week 3-4)
**Goal:** Living narrative documents

**Tasks:**
- Create narrative storage tables
- Implement sub-narrative creation/updating
- Build timeline-based master narrative categorization
- Add narrative versioning system

**Deliverables:**
- Sub-narratives tracking clinical journeys
- Master narratives organized by timeline categories (longterm/shortterm journeys)
- Version history preserved

### Phase 3: Intelligence Layer (Week 5-6)
**Goal:** Smart narrative assignment and updates

**Tasks:**
- Implement Pass 3 complete workflow
- Add embedding-based narrative matching
- Create master narrative assignment rules
- Build deterministic conflict resolution system

**Deliverables:**
- Intelligent narrative creation
- Accurate master assignments
- Automatic temporal conflict resolution

### Phase 4: User Experience (Week 7-8)
**Goal:** Complete dashboard integration

**Tasks:**
- Implement frontend queries for current data
- Add narrative click-through interfaces
- Create user edit workflows
- Build timeline-narrative integration features

**Deliverables:**
- Clean deduplicated dashboard
- Rich narrative context
- User edit capability
- Seamless timeline-narrative navigation

---

## Part 9: Technical Requirements Summary

### Database Enhancements Needed

**Clinical Event Tables:**
- Add medical code columns (rxnorm_code, icd10_code, snomed_code, mbs_code, etc.)
- Add temporal tracking (valid_from, valid_to, superseded_by_record_id)
- Add date fields (clinical_effective_date, document_upload_date)
- Add conflict tracking (date_confidence, supersession_reason)
- Support all supersession types: EXACT_DUPLICATE, PARAMETER_CHANGE, STATUS_CHANGE, TEMPORAL_ONLY
- Create indexes for code-based queries
- **Procedures:** Extend interventions table with procedure-specific coding (no separate table needed)

**Narrative Tables:**
- Sub-narratives table with versioning and temporal metadata
- Master narratives table with categories and date ranges
- Junction table for many-to-many relationships
- Embedding storage for semantic search
- Version history tracking
- Clinical date range fields for timeline integration

### AI Processing Enhancements

**Pass 2 Improvements:**
- Medical code assignment for all entities
- Clinical date extraction from content
- Conflict detection for dates
- Structured output for normalization

**Pass 3 New Capabilities:**
- Narrative search and matching
- Master narrative categorization
- Timeline construction
- Summary generation with context
- Embedding generation for narratives

### Post-Processing System

**Normalization Engine:**
- Code-based grouping functions
- Temporal comparison functions (clinical_effective_date priority)
- Deterministic supersession logic based on dates and medical codes
- Provenance tracking
- Audit trail creation

---

## Part 10: Risk Mitigation

### Data Integrity Risks

**Risk:** Incorrect supersession could hide important information
**Mitigation:**
- Deterministic temporal precedence rules
- Never delete, only mark superseded
- Complete audit trail
- TEMPORAL_ONLY for uncertain cases (no data lost)

### Temporal Accuracy Risks

**Risk:** Wrong dates could misrepresent medical timeline
**Mitigation:**
- Multiple date extraction strategies in Pass 2
- Deterministic temporal precedence system
- Complete audit trail of all date sources
- Clear date source indication in provenance

### Narrative Quality Risks

**Risk:** Poor narrative summaries could mislead users
**Mitigation:**
- Version history preservation
- Regular regeneration with new context
- Supersession-based narrative evolution
- User feedback integration through edit workflows

### Performance Risks

**Risk:** Complex queries could slow dashboard
**Mitigation:**
- Proper indexing on medical codes
- Partial indexes for current records
- Materialized views for complex aggregations
- Caching for narrative content

---

## Part 11: Success Criteria

### Deduplication Success
- 95%+ of duplicate clinical events correctly identified
- <1% false positive rate on duplicates
- All historical data preserved
- Clean single record per medical code

### Narrative Quality
- Coherent summaries for all sub-narratives
- Accurate timeline-based master narrative categorization
- Complete timeline tracking
- Meaningful version history

### User Experience
- Dashboard loads in <2 seconds
- Click-through to narratives <500ms
- Clear indication of data sources
- Intuitive conflict resolution

### Clinical Safety
- All supersessions auditable
- Deterministic temporal precedence applied
- User edits tracked and processed automatically
- Complete provenance maintained

---

## Conclusion

V4 represents a complete, production-ready solution that:

1. **Deduplicates effectively** using medical codes and deterministic temporal functions
2. **Preserves everything** through supersession, not deletion
3. **Tracks temporally** with clinical dates and conflict resolution
4. **Narratives evolve** through versioning, not replacement
5. **Masters organize** health journeys beyond just conditions
6. **Users interact** with clean data and rich context

The architecture balances:
- **Simplicity** (single active row) with **Completeness** (full history)
- **Automation** (deterministic deduplication) with **Safety** (complete audit trails)
- **Performance** (indexed queries) with **Flexibility** (narrative evolution)

This planning document provides the blueprint for implementing a sophisticated temporal health data system that handles real-world medical complexity while maintaining data integrity and user trust.