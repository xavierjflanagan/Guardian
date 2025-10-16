# Quick Start Guide - Next Session

**Last Updated:** 2025-10-15 EOD

---

## What's Ready RIGHT NOW ✅

You have everything needed to start implementing parsers for PBS and MBS:

### PBS Parser
- ✅ Data downloaded: `data/medical-codes/pbs/raw/2025-10-01-PBS-API-CSV-files/tables_as_csv/items.csv`
- ✅ Column structure documented in `PARSING-STRATEGY.md` (lines 254-277)
- ✅ Parsing logic designed (lines 279-319)
- 🎯 **Next step:** Create `parse-pbs.ts` and implement

### MBS Parser
- ✅ Data downloaded: `data/medical-codes/mbs/raw/MBS-XML-20251101.XML`
- ✅ XML structure verified
- ✅ Parsing logic designed in `PARSING-STRATEGY.md` (lines 335-365)
- 🎯 **Next step:** Create `parse-mbs.ts` and implement

---

## What's Waiting ⏳

### UMLS Account (1-2 business days)
Check your email for approval from `uts.nlm.nih.gov`

**When approved, download:**
1. RxNorm (RRF format, ~500 MB)
2. SNOMED-CT (RF2 format, ~1 GB)
3. LOINC (CSV format, ~100 MB)

**Save to:**
- `data/medical-codes/rxnorm/raw/`
- `data/medical-codes/snomed/raw/`
- `data/medical-codes/loinc/raw/`

---

## Recommended Next Session Plan

### Option A: Start Parser Implementation (Recommended)
```bash
# 1. Create PBS parser
cd shared/docs/architecture/.../code-data-preparation/
touch parse-pbs.ts

# 2. Implement parser based on PARSING-STRATEGY.md
# 3. Test with sample data
# 4. Run on full dataset

# 5. Create MBS parser
touch parse-mbs.ts
# Repeat steps 2-4
```

### Option B: Wait for UMLS Approval
If you prefer to implement all 6 parsers at once, wait for UMLS approval before starting.

**Pros of Option A:** Get started immediately, validate approach
**Pros of Option B:** Implement all parsers together, see full system working

---

## Parser Implementation Template

```typescript
// parse-pbs.ts (skeleton)
import * as fs from 'fs-extra';
import * as path from 'path';
import csvParser from 'csv-parser';

interface MedicalCodeStandard {
  code_system: string;
  code_value: string;
  display_name: string;
  entity_type: string;
  search_text: string;
  library_version: string;
  country_code: string | null;
  region_specific_data: Record<string, any>;
}

async function parsePBS(): Promise<MedicalCodeStandard[]> {
  const codes: MedicalCodeStandard[] = [];
  const inputPath = path.join(
    process.cwd(),
    'data/medical-codes/pbs/raw/2025-10-01-PBS-API-CSV-files/tables_as_csv/items.csv'
  );

  return new Promise((resolve, reject) => {
    fs.createReadStream(inputPath)
      .pipe(csvParser())
      .on('data', (row) => {
        // Implement parsing logic from PARSING-STRATEGY.md
        const code = transformPBSRow(row);
        if (code) codes.push(code);
      })
      .on('end', () => resolve(codes))
      .on('error', reject);
  });
}

function transformPBSRow(row: any): MedicalCodeStandard | null {
  // See PARSING-STRATEGY.md lines 282-318 for full logic
  const displayName = row.drug_name && row.li_form
    ? `${row.drug_name} ${row.li_form}`
    : row.schedule_form || row.li_form || row.drug_name;

  if (!row.pbs_code || !displayName) return null;

  return {
    code_system: 'pbs',
    code_value: row.pbs_code,
    display_name: displayName,
    entity_type: 'medication',
    search_text: `${displayName} ${row.brand_name || ''}`.trim(),
    library_version: 'v2025Q4',
    country_code: 'AUS',
    region_specific_data: {
      brand_name: row.brand_name,
      li_form: row.li_form,
      // ... see PARSING-STRATEGY.md for full list
    }
  };
}

// Main execution
async function main() {
  console.log('Parsing PBS data...');
  const codes = await parsePBS();

  const outputPath = path.join(
    process.cwd(),
    'data/medical-codes/pbs/processed/pbs_codes.json'
  );

  await fs.writeJson(outputPath, codes, { spaces: 2 });
  console.log(`✓ Parsed ${codes.length} PBS codes`);
}

main().catch(console.error);
```

---

## Testing Strategy

### Step 1: Test with Sample Data
```bash
# Process only first 10 records
head -11 data/medical-codes/pbs/raw/.../items.csv > sample.csv
# Run parser on sample.csv
# Inspect output
```

### Step 2: Validate Output Structure
```typescript
// Check sample output
const sample = require('./data/medical-codes/pbs/processed/pbs_codes.json');
console.log(sample[0]); // Should match MedicalCodeStandard interface
```

### Step 3: Run Full Dataset
```bash
npx tsx parse-pbs.ts
# Expected: ~3,000 PBS codes
```

### Step 4: Verify Record Counts
```bash
# Count records in output
cat data/medical-codes/pbs/processed/pbs_codes.json | jq 'length'
```

---

## Dependencies Needed

```bash
# From code-data-preparation/ directory
pnpm add csv-parser xml2js fs-extra
pnpm add -D @types/node @types/csv-parser @types/xml2js tsx
```

---

## Key Files to Reference

1. **Parsing specifications:** `PARSING-STRATEGY.md`
2. **PBS column names:** `PARSING-STRATEGY.md` lines 254-277
3. **PBS parsing logic:** `PARSING-STRATEGY.md` lines 279-319
4. **MBS parsing logic:** `PARSING-STRATEGY.md` lines 335-365
5. **Session summary:** `SESSION-SUMMARY-2025-10-15.md`

---

## Quick Health Check Commands

```bash
# Verify data files exist
ls -lh data/medical-codes/pbs/raw/2025-10-01-PBS-API-CSV-files/tables_as_csv/items.csv
ls -lh data/medical-codes/mbs/raw/MBS-XML-20251101.XML

# Check UMLS approval status
# Visit: https://uts.nlm.nih.gov/uts/
# Check email for approval notification

# Count PBS records (including header)
wc -l data/medical-codes/pbs/raw/2025-10-01-PBS-API-CSV-files/tables_as_csv/items.csv

# View MBS XML structure
head -50 data/medical-codes/mbs/raw/MBS-XML-20251101.XML
```

---

## Expected Outputs (After Parser Implementation)

```
data/medical-codes/
├── pbs/processed/pbs_codes.json         (~3,000 records, ~1-2 MB)
├── mbs/processed/mbs_codes.json         (~5,000 records, ~2-3 MB)
└── (After UMLS approval)
    ├── rxnorm/processed/rxnorm_codes.json   (~50,000 records)
    ├── snomed/processed/snomed_codes.json   (~100,000 records)
    └── loinc/processed/loinc_codes.json     (~50,000 records)
```

---

## Success Criteria for Next Session

- [ ] PBS parser implemented and tested
- [ ] MBS parser implemented and tested
- [ ] PBS output validated (~3,000 codes)
- [ ] MBS output validated (~5,000 codes)
- [ ] Check UMLS account approval status
- [ ] (Optional) Download universal codes if UMLS approved

---

**Next Session Start:** Resume with parser implementation
**Estimated Time:** 2-4 hours for PBS + MBS parsers
**Blocking Items:** None (can start immediately)
