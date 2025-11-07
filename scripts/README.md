# Scripts Directory

**Purpose:** Operational scripts for Pass 1.5 medical code processing, test data generation, and infrastructure management

**Last Updated:** 2025-11-07

---

## Directory Structure

```
scripts/
├── medical-codes/        # Medical code data processing
│   ├── snomed/          # SNOMED CT processing
│   ├── loinc/           # LOINC processing
│   └── mbs-pbs/         # Australian medical codes (future)
├── test-data/           # Test data generation
├── infrastructure/      # Deployment and system testing
├── vector-indexes/      # Vector index management (future)
└── archive/             # Historical scripts
    ├── one-off-fixes/   # Completed data fixes
    └── vector-index-attempts/  # Superseded by CORE subset approach
```

---

## Medical Code Processing

### SNOMED CT (`medical-codes/snomed/`)

**Purpose:** Process SNOMED CT clinical terminology codes

**Scripts:**
1. **parse-snomed.ts** - Parse SNOMED CT RF2 files into standardized JSON
   - Input: `data/medical-codes/snomed/raw/` (SNOMED RF2 format)
   - Output: `data/medical-codes/snomed/processed/snomed_codes.json`
   - Status: Operational (706,823 codes parsed)

2. **populate-snomed-no-embeddings.ts** - Load SNOMED codes into database WITHOUT embeddings
   - Input: `data/medical-codes/snomed/processed/snomed_codes.json`
   - Output: Inserts into `universal_medical_codes` table
   - Status: Operational

3. **generate-snomed-embeddings.ts** - Generate OpenAI embeddings for SNOMED codes
   - Input: `universal_medical_codes` table (SNOMED codes)
   - Output: Updates `embedding` column in database
   - Status: Operational (designed for CORE subset, not full dataset)
   - Note: Use with CORE subset only (~10-15k codes)

4. **SNOMED-POPULATION-STEPS.md** - Documentation for SNOMED processing workflow

**Usage:**
```bash
# Full workflow for CORE subset
npx tsx scripts/medical-codes/snomed/parse-snomed.ts
npx tsx scripts/medical-codes/snomed/populate-snomed-no-embeddings.ts
npx tsx scripts/medical-codes/snomed/generate-snomed-embeddings.ts --core-only
```

---

### LOINC (`medical-codes/loinc/`)

**Purpose:** Process LOINC laboratory and clinical observation codes

**Scripts:**
1. **parse-loinc.ts** - Parse LOINC CSV files into standardized JSON
   - Input: `data/medical-codes/loinc/raw/Loinc.csv`
   - Output: `data/medical-codes/loinc/processed/loinc_codes.json`
   - Status: Operational (102,891 codes parsed)

2. **populate-loinc-no-embeddings.ts** - Load LOINC codes into database WITHOUT embeddings
   - Input: `data/medical-codes/loinc/processed/loinc_codes.json`
   - Output: Inserts into `universal_medical_codes` table
   - Status: Operational

3. **generate-loinc-embeddings.ts** - Generate OpenAI embeddings for LOINC codes
   - Input: `universal_medical_codes` table (LOINC codes)
   - Output: Updates `embedding` column in database
   - Status: Operational

4. **LOINC-EMBEDDING-INSTRUCTIONS.md** - Documentation for LOINC processing workflow

**Usage:**
```bash
# Full workflow
npx tsx scripts/medical-codes/loinc/parse-loinc.ts
npx tsx scripts/medical-codes/loinc/populate-loinc-no-embeddings.ts
npx tsx scripts/medical-codes/loinc/generate-loinc-embeddings.ts
```

---

### MBS/PBS (`medical-codes/mbs-pbs/`)

**Status:** Empty (future Australian medical/pharmaceutical codes)

**Note:** MBS codes were previously loaded but deleted as billing codes were not clinically useful. PBS parsing exists but scripts not yet moved here.

---

## Test Data Generation (`test-data/`)

**Purpose:** Generate synthetic medical documents for testing Pass 1 entity detection

**Scripts:**
1. **generate-medical-pdfs.js** - Main test PDF generator
   - Creates realistic medical documents (lab reports, referrals, prescriptions)
   - Output: Multiple PDF files for testing

2. **generate-pdfs-official.sh** - Wrapper script for PDF generation
   - Runs generate-medical-pdfs.js with proper configuration

3. **html-to-pdf.js** - HTML to PDF conversion utility
   - Used by other test data generators

4. **deidentify-xml-properly.sh** - De-identify real medical documents
   - Strips PII from XML medical records for testing
   - WARNING: Use with extreme caution on real data

**Usage:**
```bash
# Generate test PDFs
bash scripts/test-data/generate-pdfs-official.sh

# Or run directly
node scripts/test-data/generate-medical-pdfs.js
```

---

## Infrastructure (`infrastructure/`)

**Purpose:** Deployment and system testing scripts

**Scripts:**
1. **deploy-setup.sh** - Initial deployment configuration
   - Sets up environment variables
   - Configures Render.com worker
   - Status: Operational

2. **test_shell_processor.sh** - Test shell file processor Edge Function
   - Uploads test document to Supabase
   - Verifies Pass 1 entity detection pipeline
   - Status: Operational

**Usage:**
```bash
# Deploy setup
bash scripts/infrastructure/deploy-setup.sh

# Test shell processor
bash scripts/infrastructure/test_shell_processor.sh
```

---

## Archive

### One-Off Fixes (`archive/one-off-fixes/`)

**Purpose:** Historical data correction scripts (already executed)

**Scripts:**
1. **delete-incorrect-snomed.ts** - Removed incorrectly parsed SNOMED codes
   - Executed: October 2025
   - Reason: Early parsing errors in initial implementation

2. **delete-mbs-codes.ts** - Removed all MBS billing codes from database
   - Executed: October 2025
   - Reason: Billing codes not clinically useful for entity detection
   - Deleted: 6,001 codes

**Status:** Completed, archived for historical reference

---

### Vector Index Attempts (`archive/vector-index-attempts/`)

**Purpose:** Experimental vector indexing approaches (superseded)

**Scripts:**
1. **create-snomed-entity-indexes.sh** - Entity-type-specific HNSW indexes
2. **create-index-direct-v2.sh** - Direct SQL index creation (v2)
3. **create-index-direct.sh** - Direct SQL index creation (v1)
4. **create-snomed-index.sql** - SQL-based index creation
5. **create-snomed-vector-index.ts** - TypeScript-based index creation
6. **check-index-progress.sh** - Monitor index build progress

**Status:** Superseded by CORE subset two-tier architecture (see ARCHITECTURAL-REVIEW-2025.md)

**Why Archived:**
- Full-dataset indexing (706k codes) required 8+ hours
- pgvector performance degraded with large datasets
- CORE subset approach (10-15k codes) builds indexes in <1 second
- Historical reference for understanding architecture evolution

---

## Common Operations

### Parse and Load New Medical Code System
```bash
# 1. Parse raw data
npx tsx scripts/medical-codes/<system>/parse-<system>.ts

# 2. Load into database (no embeddings)
npx tsx scripts/medical-codes/<system>/populate-<system>-no-embeddings.ts

# 3. Generate embeddings (if needed)
npx tsx scripts/medical-codes/<system>/generate-<system>-embeddings.ts
```

### Generate Test Data for Pass 1
```bash
bash scripts/test-data/generate-pdfs-official.sh
```

### Test Document Processing Pipeline
```bash
bash scripts/infrastructure/test_shell_processor.sh
```

---

## Environment Variables Required

### Medical Code Processing
```bash
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
OPENAI_API_KEY=sk-your-openai-api-key  # For embedding generation
```

### Test Data Generation
```bash
# No special environment variables required
```

---

## Related Documentation

- **CORE Subset Strategy:** `shared/docs/architecture/database-foundation-v3/ai-processing-v3/implementation-planning/pass-1.5-medical-code-embedding/code-data-preparation/ARCHITECTURAL-REVIEW-2025.md`
- **Data Acquisition:** `shared/docs/architecture/database-foundation-v3/ai-processing-v3/implementation-planning/pass-1.5-medical-code-embedding/code-data-preparation/DATA-ACQUISITION-GUIDE.md`
- **Parsing Strategy:** `shared/docs/architecture/database-foundation-v3/ai-processing-v3/implementation-planning/pass-1.5-medical-code-embedding/code-data-preparation/PARSING-STRATEGY.md`

---

## Notes

### CORE Subset Approach
As of November 2025, the strategy has pivoted to a **two-tier CORE subset architecture**:
- **CORE codes (~10-15k):** Most clinically relevant codes with vector embeddings
- **Fallback codes (~700k):** Remaining codes with exact-match lookup only

Scripts are designed to support this approach. Use `--core-only` flags where available.

### Script Execution Location
All scripts should be run from the repository root:
```bash
cd /Users/xflanagan/Documents/GitHub/Guardian-Windsurf
npx tsx scripts/medical-codes/snomed/parse-snomed.ts
```

### Adding New Scripts
When adding new scripts:
1. Place in appropriate subfolder based on purpose
2. Add documentation to this README
3. Include inline comments explaining purpose and usage
4. Test with dry-run mode if modifying database

---

**Maintained By:** Pass 1.5 Implementation Team
**Questions:** See related documentation or architecture guides
