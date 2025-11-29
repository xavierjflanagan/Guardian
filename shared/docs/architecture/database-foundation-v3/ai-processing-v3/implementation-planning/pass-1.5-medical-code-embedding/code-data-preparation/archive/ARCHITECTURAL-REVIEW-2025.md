# Medical Code Storage & Indexing - Architectural Review 2025

**Created:** 2025-11-06
**Trigger:** Disk space constraints on Supabase (15GB/18GB used, need 32GB for full SNOMED indexing)
**Decision Point:** Before committing to +$1.75/month permanent cost increase, evaluate entire approach

---

## Executive Summary

**Current State:**
- 706,544 SNOMED-CT codes (Australian edition, 100% coverage)
- 102,891 LOINC codes
- 15 GB total disk usage (441 MB data + 14.5 GB indexes)
- 3/5 entity-specific HNSW indexes completed
- 134 documents processed, 1,091 entities detected

**Recommendation:** Switch to SNOMED CT CORE subset (5,182 codes, 99% reduction) instead of full dataset.

---

## Question 1: Can We Reduce the SNOMED Dataset?

### DISCOVERY: SNOMED CT CORE Subset Exists

**Official CORE Problem List Subset:**
- **Size:** 5,182 codes (vs 706,544 full Australian edition)
- **Reduction:** 99.3% smaller
- **Source:** National Library of Medicine (NLM)
- **Based on:** Real-world usage data from 7 major healthcare institutions
  - Beth Israel Deaconess Medical Center
  - Intermountain Healthcare
  - Kaiser Permanente
  - Mayo Clinic
  - Nebraska University Medical Center
  - Regenstrief Institute
  - Hong Kong Hospital Authority

**Latest Version:** Derived from September 2024 US Edition + UMLS Metathesaurus 2024AB

**CORE Code Examples (from NLM documentation):**

| Code | Display Name | Type | Why It's CORE |
|------|-------------|------|---------------|
| `12441001` | Epistaxis (disorder) | Condition | Common condition (nosebleed), used by multiple institutions |
| `95570007` | Kidney stone | Condition | Very common diagnosis, high clinical relevance |
| `307279007` | Prosthetic replacement of heart valve (procedure) | Procedure | Common surgical procedure |

**Non-CORE Code Examples (likely excluded):**

| Type | CORE Example | Non-CORE Example |
|------|-------------|------------------|
| Diabetes | `73211009` Diabetes mellitus | `609568004` Diabetes mellitus due to genetic defect in insulin receptor substrate-1 phosphorylation |
| Heart Failure | `84114007` Heart failure | `703272007` Heart failure due to left ventricular systolic dysfunction |
| Hypertension | `38341003` Hypertension | `429457004` Systolic hypertension |

**Selection Criteria (from NLM):**
- Only includes codes from 4 hierarchies: Clinical finding, Procedure, Situation with explicit context, Events
- Favors disorder concepts over finding concepts when similar concepts exist
- Based on actual usage data from 7-8 major healthcare institutions
- Excludes hyper-specific research codes, rare genetic variants, veterinary codes
- **OCCURRENCE field**: Shows how many institutions (1-8) use each code in their problem lists
- **USAGE field**: Average usage percentage across participating institutions

**How CORE Codes Are Distinguished:**

CORE codes are distributed as a **separate file** (not a column in main SNOMED):

**File Details:**
- **Filename:** `SNOMEDCT_CORE_SUBSET_202506.zip` (YYYYMM versioning)
- **Download:** https://www.nlm.nih.gov/research/umls/Snomed/core_subset.html
- **Format:** ZIP file containing data file with 10 columns

**File Structure:**
```
SNOMED_CID                  - Concept identifier (the actual code)
SNOMED_FSN                  - Fully-specified name
SNOMED_CONCEPT_STATUS       - Concept status (active/inactive)
UMLS_CUI                    - UMLS identifier
OCCURRENCE                  - Number of institutions (1-8) using this code
USAGE                       - Average usage percentage
FIRST_IN_SUBSET            - Date added to CORE
IS_RETIRED_FROM_SUBSET     - Retirement flag
LAST_IN_SUBSET             - Last version containing this code
REPLACED_BY_SNOMED_CID     - Replacement code if retired
```

**Key Insight:** The `OCCURRENCE` column shows institutional validation - codes used by 7-8 institutions are the most universally relevant.

### Impact Analysis

**Current Full Dataset:**
- SNOMED codes: 706,544
- Disk usage: ~15 GB total
- Index build time: 30-75 minutes
- Disk space required: 32 GB (double current)

**With CORE Subset:**
- SNOMED codes: 5,182 (99.3% reduction)
- Estimated disk usage: ~500 MB - 1 GB total (including LOINC + PBS)
- Index build time: 1-5 minutes
- Disk space required: 18 GB current tier (sufficient)
- Cost impact: $0 (no upgrade needed)

### Coverage Analysis

**Your Current Usage:**
- Documents processed: 134
- Entities detected: 1,091
- Unique codes referenced: Unknown (need to query)

**CORE Subset Coverage:**
- Designed for "summary level clinical documentation"
- Covers most common diagnoses, conditions, procedures
- Based on actual clinical usage patterns
- Optimized for problem lists (exactly your use case)

**Risk:** Some rare/specialized codes may not be in CORE subset. Mitigation: Implement fallback to full dataset API if needed.

---

## Question 2: Is Supabase the Best Platform?

### Architecture Option A: Current Approach (Supabase pgvector)

**Pros:**
- Single platform for everything (auth, database, storage, vector search)
- No additional API integrations needed
- pgvector performance competitive with dedicated solutions (4x faster QPS than Pinecone in benchmarks)
- Familiar PostgreSQL tooling
- Row-level security built-in
- HIPAA compliance available on paid tiers

**Cons:**
- Disk space limits on lower tiers
- pgvector lacks advanced indexing optimizations of dedicated vector DBs
- Index builds can timeout on large datasets
- Mixed workload (transactional + vector search) can cause resource contention

**Cost:**
- Current: $25/month (Pro plan)
- With 32 GB disk: $26.75/month
- With CORE subset only: $25/month (no change)

### Architecture Option B: Dedicated Vector Database (Pinecone/Qdrant)

**Pinecone:**
- **Pros:** Enterprise reliability, fast queries, managed service, healthcare use cases
- **Cons:** Separate service, additional API integration, data duplication
- **Cost:** $70/month (Starter plan, 100K vectors) to $500/month+ (Enterprise)

**Qdrant:**
- **Pros:** Best tail latencies, open-source, self-hostable, advanced indexing
- **Cons:** Need to manage infrastructure, separate service
- **Cost:** $25-100/month (managed cloud) or self-hosted costs

**Analysis:** For 5,182 codes (CORE subset), dedicated vector DB is overkill. Supabase pgvector is sufficient.

### Architecture Option C: Hybrid Approach

**Medical Codes:** Supabase (static infrastructure data)
**User Documents:** Supabase (transactional data with RLS)
**Vector Search:** Dedicated vector DB

**Pros:**
- Optimized for each workload
- Scales independently

**Cons:**
- Much higher complexity
- Data synchronization challenges
- Additional integration points
- Higher total cost ($25 Supabase + $70+ Pinecone = $95+/month)

**Recommendation:** Not justified for current scale. Revisit at 100K+ users.

---

## Question 3: Database Platform Alternatives

### Option 1: Stay on Supabase (Recommended)

**Rationale:**
- pgvector benchmarks show 4x better QPS than Pinecone on equivalent hardware
- Single platform reduces complexity
- Already integrated with auth, storage, RLS
- CORE subset fits easily within current tier

**Action:** Switch to CORE subset, no platform change needed.

### Option 2: Self-Hosted PostgreSQL + pgvector

**Pros:**
- Complete control over resources
- No disk/compute limits
- Potentially lower long-term costs at scale

**Cons:**
- Infrastructure management overhead
- Need to build auth, storage, backups
- Compliance burden (HIPAA, backups, encryption)
- Time investment: 40-80 hours setup + ongoing maintenance

**Cost:** $50-150/month (AWS RDS or equivalent) + engineering time

**Recommendation:** Not worth it for current scale. Supabase managed service saves hundreds of hours.

### Option 3: Medical Terminology API Services

**Examples:**
- UMLS API (free, NLM)
- Clinical Architecture terminology services
- SNOMED International API

**Pros:**
- No storage overhead
- Always up-to-date
- Professionally maintained

**Cons:**
- API latency (100-500ms vs 10-50ms local)
- Rate limits
- Dependency on external service
- No offline capability
- May require additional fees at scale

**Recommendation:** Good for occasional lookups, not for real-time document processing with thousands of queries.

---

## Recommended Approach: CORE Subset + Supabase

### Phase 1: Validate CORE Subset Coverage (2-4 hours)

1. **Download CORE subset:**
   - Source: https://www.nlm.nih.gov/research/umls/Snomed/core_subset.html
   - Latest: September 2024 US Edition

2. **Analyze current usage:**
   ```sql
   -- Check which codes we've actually detected
   SELECT
       rmc.code_value,
       rmc.display_name,
       rmc.entity_type,
       COUNT(DISTINCT epa.shell_file_id) as documents_found_in
   FROM entity_processing_audit epa
   JOIN regional_medical_codes rmc ON epa.code_value = rmc.code_value
   WHERE rmc.code_system = 'snomed_ct'
   GROUP BY rmc.code_value, rmc.display_name, rmc.entity_type
   ORDER BY documents_found_in DESC;
   ```

3. **Cross-reference with CORE:**
   - How many of your detected codes are in CORE subset?
   - Target: 95%+ coverage of real usage

4. **Decision:** If coverage is good, proceed. If not, identify gaps.

### Phase 2: Implement CORE Subset (4-8 hours)

1. **Create new table:**
   ```sql
   CREATE TABLE regional_medical_codes_core AS
   SELECT * FROM regional_medical_codes
   WHERE code_system = 'snomed_ct'
     AND code_value IN (SELECT code FROM core_subset_mapping)

   UNION ALL

   SELECT * FROM regional_medical_codes
   WHERE code_system IN ('loinc', 'pbs', 'mbs');
   ```

2. **Generate embeddings for CORE subset only:**
   - 5,182 SNOMED codes
   - Embedding cost: ~$0.01 (vs $0.80 for full dataset)
   - Time: 5-15 minutes

3. **Create single HNSW index:**
   ```sql
   CREATE INDEX idx_core_codes_hnsw
   ON regional_medical_codes_core
   USING hnsw (embedding vector_cosine_ops)
   WITH (m = 16);  -- Can use full quality, dataset is small
   ```
   - Build time: 1-3 minutes (vs 30-75 minutes for full dataset)
   - Index size: ~50-100 MB (vs 6+ GB for full dataset)

4. **Implement fallback mechanism:**
   - If entity detected not in CORE, log it
   - Option to expand CORE with commonly detected codes
   - Or fallback to UMLS API for rare codes

### Phase 3: Testing & Validation (1-2 hours)

1. **Performance testing:**
   - Query time should be 5-20ms (faster than 10-50ms target)
   - Test with all 5 entity types

2. **Coverage analysis:**
   - Process 100-200 sample documents
   - Measure CORE coverage percentage
   - Log any missing codes

3. **Rollback plan:**
   - Keep full dataset in archive
   - Can restore if coverage insufficient

### Phase 4: Cleanup (1 hour)

1. **Archive full dataset:**
   ```sql
   -- Export to backup
   COPY regional_medical_codes TO '/backup/snomed_full_dataset.csv' CSV HEADER;

   -- Drop full SNOMED codes
   DELETE FROM regional_medical_codes
   WHERE code_system = 'snomed_ct'
     AND code_value NOT IN (SELECT code FROM core_subset_mapping);
   ```

2. **Drop old indexes:**
   ```sql
   DROP INDEX IF EXISTS idx_snomed_medication_hnsw;
   DROP INDEX IF EXISTS idx_snomed_procedure_hnsw;
   DROP INDEX IF EXISTS idx_snomed_physical_finding_hnsw;
   -- Keep entity-specific approach if needed, or use single index
   ```

3. **Reclaim disk space:**
   ```sql
   VACUUM FULL regional_medical_codes;
   ```

4. **Downgrade compute:**
   - From Large ($0.15/hour) back to Micro/Small
   - No disk upgrade needed

---

## Cost-Benefit Analysis

### Current Approach (Full SNOMED + 32 GB Disk)

**One-time Costs:**
- Engineering time: 2-4 hours (completing indexes)
- Compute upgrade: $2-5 (temporary, already spent)

**Recurring Costs:**
- Disk upgrade: +$1.75/month ($21/year)
- Total: $26.75/month

**Benefits:**
- 100% SNOMED coverage
- Fast queries (10-50ms) for all entity types

**Drawbacks:**
- Storing 700k codes for 1k actual usage (99.8% waste)
- Permanent cost increase
- Complex 5-index architecture
- Long build times for updates

### Recommended Approach (CORE Subset)

**One-time Costs:**
- Research & validation: 2-4 hours
- Implementation: 4-8 hours
- Testing: 1-2 hours
- **Total:** 7-14 hours engineering time

**Recurring Costs:**
- Storage: $25/month (no change)
- Embeddings: $0.01 every 6 months (negligible)

**Benefits:**
- 99.3% storage reduction (15 GB → ~500 MB)
- Faster queries (5-20ms vs 10-50ms)
- Faster index builds (2 minutes vs 60 minutes)
- No disk upgrade needed
- Simpler architecture (single index vs 5 indexes)
- Based on real clinical usage patterns
- Easy to extend if gaps found

**Drawbacks:**
- Need to validate coverage
- May miss some rare/specialized codes
- Requires implementation work

**ROI:**
- Saves: $21/year recurring
- Saves: 14.5 GB disk space (77% reduction)
- Investment: 7-14 hours one-time
- Break-even: Immediate (no cost increase)

---

## Alternative Optimizations (If CORE Not Viable)

If CORE subset coverage proves insufficient, consider these optimizations:

### Option 1: Smart Filtering by Entity Type

**Observation:** Your current usage shows entity distribution:
- observation: 323,478 codes (45.8% of dataset)
- condition: 130,948 codes (18.5%)
- physical_finding: 113,711 codes (16.1%)
- procedure: 93,561 codes (13.2%)
- medication: 44,846 codes (6.3%)

**Analysis:** Could filter observation entity (323k codes) more aggressively:
- Keep all: medication, procedure, physical_finding, condition (~379k codes)
- Filter observations to common subset (~50k codes)
- **Reduction:** 273k codes = 39% disk savings

**Risk:** Observation codes might be highly used in lab results.

### Option 2: Usage-Based Dynamic Loading

**Architecture:**
1. Start with CORE subset (5,182 codes) in database
2. Track codes detected but not in database
3. Auto-populate missing codes on first encounter
4. Database grows organically based on actual usage

**Benefits:**
- Starts small, grows only as needed
- No upfront decision on what to include
- Self-optimizing over time

**Implementation:**
- Fallback API query when code not found
- Background job to add code + embedding
- Eventually reaches steady state

### Option 3: Reduce Embedding Dimensions

**Current:** text-embedding-3-small (1536 dimensions, ~6 KB per code)

**Alternative:** text-embedding-3-small with reduced dimensions:
- 512 dimensions: 66% size reduction, minimal accuracy loss
- 768 dimensions: 50% size reduction, negligible accuracy loss

**Impact:**
- Index size: 50-66% smaller
- Query speed: Faster (fewer dimensions to compare)
- Accuracy: 1-3% degradation (acceptable for medical code matching)

**Action:**
```typescript
const embedding = await openai.embeddings.create({
  model: 'text-embedding-3-small',
  input: text,
  dimensions: 768  // Reduce from 1536
});
```

---

## PROPOSED ARCHITECTURE: Two-Tier SNOMED System (CORE + Full Fallback)

### Overview

A hybrid approach that combines CORE subset's efficiency with full dataset's comprehensive coverage:

**Architecture:**
1. **Primary Index**: SNOMED CT CORE subset (5,182 codes) - fast, indexed
2. **Secondary Lookup**: Full SNOMED dataset (706,544 codes) - slower, minimal/no indexing
3. **Routing**: Lab tests → LOINC, Medications → PBS, Clinical → SNOMED (CORE + rare)

### Pass 1.5 Medical Code Shortlisting (Enhanced)

**Two-Stage Search Process:**

**Stage 1: CORE Subset Search (Primary)**
- Input: Entity text from Pass 1 (e.g., "Type 2 Diabetes Mellitus")
- Search: CORE subset via fast HNSW vector index + lexical matching
- Output: Top 5-10 CORE codes with confidence scores
- Performance: 5-20ms per entity (fast!)

**Stage 2: Full Dataset Search (Rare Disease Fallback)**
- Input: Same entity text
- Search: Full 706k dataset via lexical + semantic filtering
- Filter: Only include if confidence score suggests rare/specialized diagnosis
- Output: Top 3-5 potential rare codes (if any)
- Performance: 100-500ms per entity (acceptable for fallback)

**Combined Shortlist Output:**
```json
{
  "entity_id": "abc123",
  "entity_text": "Hereditary angioedema type III",
  "shortlist": {
    "core_codes": [
      {
        "code": "41345002",
        "display": "Hereditary angioedema (disorder)",
        "source": "CORE",
        "confidence": 0.92
      },
      {
        "code": "39579001",
        "display": "Angioedema (disorder)",
        "source": "CORE",
        "confidence": 0.87
      }
    ],
    "rare_codes": [
      {
        "code": "783250008",
        "display": "Hereditary angioedema type III (disorder)",
        "source": "FULL",
        "confidence": 0.95,
        "note": "Highly specific subtype"
      }
    ]
  }
}
```

### Pass 2 Clinical Extraction (AI Decision Logic)

**AI Model Instructions:**
```
You are provided with a shortlist of medical codes from two sources:

1. CORE codes: Standard, widely-used clinical terminology
2. RARE codes: Specialized codes for uncommon conditions

MANDATORY: You must assign at least ONE code from the CORE list.

OPTIONAL: You may assign ONE additional code from the RARE list if:
- The rare code captures clinically significant detail not in CORE
- The specificity is relevant for patient care
- The rare diagnosis is supported by clinical evidence in the document

Output format:
{
  "primary_code": "41345002",  // MUST be from CORE
  "primary_source": "CORE",
  "secondary_code": "783250008",  // Optional, from RARE
  "secondary_source": "FULL",
  "justification": "Type III subtype is clinically significant..."
}
```

**AI Model Benefits:**
- GPT-4 has excellent medical knowledge to judge clinical relevance
- Can distinguish true rare disease from common condition variants
- Prevents over-specific coding when general term is more appropriate
- Ensures every entity maps to standard terminology (interoperability)

### Database Schema

**Option A: Two Tables (Recommended)**

```sql
-- Primary table: CORE subset with fast indexes
CREATE TABLE regional_medical_codes_core (
    id UUID PRIMARY KEY,
    code_value TEXT NOT NULL,
    code_system TEXT NOT NULL,  -- 'snomed_ct_core'
    display_name TEXT NOT NULL,
    entity_type TEXT,
    embedding VECTOR(1536),
    occurrence INTEGER,  -- 1-8 institutions using this code
    usage NUMERIC,       -- Average usage percentage
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Fast HNSW index on CORE subset
CREATE INDEX idx_core_snomed_hnsw
ON regional_medical_codes_core
USING hnsw (embedding vector_cosine_ops)
WITH (m = 16);  -- Full quality, dataset is small

-- Secondary table: Full dataset with minimal indexing
CREATE TABLE regional_medical_codes_full (
    id UUID PRIMARY KEY,
    code_value TEXT NOT NULL,
    code_system TEXT NOT NULL,  -- 'snomed_ct'
    display_name TEXT NOT NULL,
    entity_type TEXT,
    embedding VECTOR(1536),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Basic indexes for lexical search only
CREATE INDEX idx_full_snomed_display ON regional_medical_codes_full(display_name);
CREATE INDEX idx_full_snomed_code ON regional_medical_codes_full(code_value);
-- NO vector index on full table (too expensive)

-- Also keep LOINC and PBS in separate tables
-- (Already have these with existing indexes)
```

**Option B: Single Table with Tiering (Alternative)**

```sql
CREATE TABLE regional_medical_codes (
    id UUID PRIMARY KEY,
    code_value TEXT NOT NULL,
    code_system TEXT NOT NULL,
    display_name TEXT NOT NULL,
    entity_type TEXT,
    embedding VECTOR(1536),
    is_core_subset BOOLEAN DEFAULT FALSE,
    core_occurrence INTEGER,  -- NULL if not in CORE
    core_usage NUMERIC,       -- NULL if not in CORE
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Partial HNSW index on CORE codes only
CREATE INDEX idx_snomed_core_hnsw
ON regional_medical_codes
USING hnsw (embedding vector_cosine_ops)
WHERE code_system = 'snomed_ct' AND is_core_subset = TRUE;

-- Basic indexes for full dataset
CREATE INDEX idx_snomed_display ON regional_medical_codes(display_name);
CREATE INDEX idx_snomed_entity_type ON regional_medical_codes(entity_type);
```

### Storage & Performance Impact

**With Two-Tier Architecture:**

| Component | Size | Index Size | Query Time | Cost |
|-----------|------|------------|------------|------|
| SNOMED CORE (5k codes) | ~15 MB | ~50 MB | 5-20ms | $0 |
| SNOMED Full (706k codes) | ~426 MB | None | 200-500ms | $0 |
| LOINC (103k codes) | ~62 MB | ~400 MB | 10-50ms | $0 |
| PBS (14k codes) | ~8 MB | ~50 MB | 10-50ms | $0 |
| **Total** | **~511 MB** | **~500 MB** | **Mixed** | **$25/month** |

**Comparison to Current Approach:**

| Metric | Current (Full SNOMED) | Two-Tier Approach | Savings |
|--------|----------------------|-------------------|---------|
| Data size | 441 MB | 511 MB | -70 MB (acceptable) |
| Index size | 14.5 GB | 500 MB | **96% reduction** |
| Total disk | 15 GB | 1 GB | **93% reduction** |
| CORE query time | 2,800ms | 5-20ms | **99% faster** |
| Rare query time | 2,800ms | 200-500ms | **80% faster** |
| Disk tier needed | 32 GB | 18 GB | **No upgrade** |
| Monthly cost | $26.75 | $25.00 | **$21/year savings** |

### Implementation Workflow

**Pass 1.5 Shortlisting Function:**
```typescript
async function generateMedicalCodeShortlist(
  entityText: string,
  entityType: string,
  entityCategory: string
): Promise<CodeShortlist> {

  // Route by entity category
  if (entityCategory === 'lab_result') {
    return await searchLOINC(entityText);
  }

  if (entityCategory === 'medication') {
    return await searchPBS(entityText);
  }

  // Clinical entities: Two-tier SNOMED search

  // Stage 1: Search CORE subset (fast, primary)
  const coreCodes = await searchSNOMEDCore({
    text: entityText,
    entityType: entityType,
    limit: 10,
    minConfidence: 0.70
  });

  // Stage 2: Search full dataset (slower, fallback for rare codes)
  const rareCodes = await searchSNOMEDFull({
    text: entityText,
    entityType: entityType,
    limit: 5,
    minConfidence: 0.85,  // Higher threshold for rare codes
    excludeCoreOverlap: true
  });

  return {
    entity_text: entityText,
    core_codes: coreCodes,
    rare_codes: rareCodes,
    routing: 'snomed_two_tier'
  };
}
```

**Pass 2 AI Code Selection:**
```typescript
async function selectFinalCodes(
  shortlist: CodeShortlist,
  clinicalContext: string
): Promise<FinalCodes> {

  const prompt = `
    Entity: "${shortlist.entity_text}"
    Clinical context: ${clinicalContext}

    CORE codes (standard terminology):
    ${formatCodes(shortlist.core_codes)}

    RARE codes (specialized terminology):
    ${formatCodes(shortlist.rare_codes)}

    Requirements:
    1. MUST select at least one CORE code (primary)
    2. MAY select one RARE code (secondary) if clinically justified
    3. Explain your reasoning

    Return JSON: {primary_code, secondary_code?, justification}
  `;

  const aiResponse = await openai.chat.completions.create({
    model: 'gpt-4',
    messages: [{role: 'user', content: prompt}],
    response_format: {type: 'json_object'}
  });

  const selection = JSON.parse(aiResponse.choices[0].message.content);

  // Validate: must have primary code from CORE
  if (!shortlist.core_codes.find(c => c.code === selection.primary_code)) {
    throw new Error('Primary code must be from CORE subset');
  }

  return {
    primary_code: selection.primary_code,
    primary_source: 'CORE',
    secondary_code: selection.secondary_code,
    secondary_source: selection.secondary_code ? 'FULL' : null,
    ai_justification: selection.justification
  };
}
```

### Benefits of Two-Tier Architecture

**1. Storage Efficiency**
- Only index 5k CORE codes (50 MB index vs 6+ GB for full dataset)
- Full dataset remains searchable via lexical/filtering
- 96% reduction in index storage

**2. Performance Optimization**
- CORE searches: 5-20ms (primary use case)
- Rare searches: 200-500ms (acceptable for edge cases)
- No disk upgrade needed

**3. Clinical Quality**
- Ensures standard terminology (CORE) for interoperability
- Captures rare diseases when clinically relevant
- AI prevents over-specific coding

**4. Future-Proof**
- Can add more codes to CORE as usage patterns emerge
- Can track which rare codes get selected (data-driven CORE expansion)
- Scales gracefully with user growth

**5. Best of Both Worlds**
- Standard terminology for common conditions (CORE)
- Comprehensive coverage for rare diseases (Full)
- Low cost, high performance

### Migration Path

**Phase 1: Download & Parse CORE Subset (2-4 hours)**
1. Download `SNOMEDCT_CORE_SUBSET_202506.zip` from NLM
2. Parse file to extract:
   - SNOMED_CID (code identifier)
   - SNOMED_FSN (fully-specified name)
   - OCCURRENCE (1-8 institutions)
   - USAGE (average usage %)
3. Cross-reference with Australian SNOMED edition

**Phase 2: Create Two-Tier Schema (2-4 hours)**
1. Create `regional_medical_codes_core` table
2. Populate with 5,182 CORE codes + existing embeddings
3. Keep `regional_medical_codes` as full dataset (rename if needed)
4. Build HNSW index on CORE table only

**Phase 3: Implement Pass 1.5 Two-Tier Search (4-8 hours)**
1. Update shortlisting function for two-stage search
2. Implement CORE search (fast path)
3. Implement rare code search (fallback)
4. Test with sample entities

**Phase 4: Update Pass 2 AI Logic (2-4 hours)**
1. Add CORE/RARE distinction to AI prompt
2. Implement validation (must have CORE code)
3. Add justification logging for rare code selections

**Phase 5: Monitor & Optimize (Ongoing)**
1. Track which rare codes AI selects
2. Identify rare codes selected frequently → promote to CORE
3. Monitor CORE coverage (should be 95%+ of all selections)

---

## Final Recommendation (Updated)

### Immediate Action: Implement Two-Tier SNOMED Architecture

**Why This Approach Wins:**
1. **Storage efficient** - 96% index reduction, no disk upgrade needed
2. **Performance optimized** - Fast for common cases, acceptable for rare
3. **Clinically sound** - Standard terminology + rare disease coverage
4. **Future-proof** - Can expand CORE based on actual usage data
5. **Cost effective** - $0 increase, fits in current 18 GB tier
6. **Best of both worlds** - Validated CORE subset + comprehensive full dataset

**Timeline:**
- Week 1: Download CORE subset, create two-tier schema (4-8 hours)
- Week 2: Implement Pass 1.5 two-tier search (4-8 hours)
- Week 3: Update Pass 2 AI logic (2-4 hours)
- Week 4: Test + monitor (2-4 hours)

**Decision Criteria:**
- If you want standard terminology + rare disease coverage → **Two-tier approach** (recommended)
- If you only care about common conditions → CORE-only approach
- If you need 100% SNOMED coverage for all entities → Full dataset + 32 GB disk

### Success Metrics

**Pass 1.5 Performance:**
- CORE search: <50ms per entity (target: 10-20ms)
- Rare search: <1000ms per entity (target: 200-500ms)
- CORE coverage: >90% of all entities get at least one CORE match

**Pass 2 Code Selection:**
- Primary code source: 100% CORE (enforced)
- Secondary code usage: <10% of entities (rare by definition)
- AI justification quality: Human-reviewable, clinically sound

**System Health:**
- Disk usage: <5 GB total (including indexes)
- No disk upgrade needed
- Query performance: Consistent under load

### Future Scaling Path

**0-1K users:**
- CORE subset sufficient
- Supabase Pro ($25/month)
- Single HNSW index

**1K-10K users:**
- CORE + usage-based expansion
- Supabase Pro with disk scaling
- Consider entity-specific indexes if queries slow

**10K-100K users:**
- Evaluate dedicated vector DB (Qdrant/Pinecone)
- Separate medical code storage from user data
- Multi-region deployment

**100K+ users:**
- Hybrid architecture essential
- Dedicated infrastructure
- CDN for medical code lookups

---

## Next Steps

1. **Validate CORE subset coverage** (do this first before any other decision)
2. **Download CORE subset** from NLM
3. **Run coverage analysis** on your 134 processed documents
4. **Make go/no-go decision** based on coverage percentage
5. **If GO:** Implement CORE subset migration
6. **If NO-GO:** Evaluate alternative optimizations or proceed with 32 GB disk

---

## References

- **SNOMED CT CORE Subset:** https://www.nlm.nih.gov/research/umls/Snomed/core_subset.html
- **NLM Technical Bulletin (Nov-Dec 2024):** Latest CORE subset release notes
- **pgvector vs Pinecone:** Performance benchmarks showing 4x QPS advantage
- **Vector Database Comparison Guide 2025:** Comprehensive analysis of options

---

**Last Updated:** 2025-11-06
**Decision Owner:** Xavier Flanagan
**Next Review:** After CORE subset coverage validation
