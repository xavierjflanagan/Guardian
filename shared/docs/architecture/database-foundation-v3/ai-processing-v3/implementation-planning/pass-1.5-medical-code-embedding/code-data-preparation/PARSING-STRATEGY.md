# Pass 1.5 Medical Code Parsing Strategy

**Purpose:** Transform 6 different medical code formats into standardized JSON for embedding generation

**Status:** Active - Phase 2 in progress

**Created:** 2025-10-15

---

## Overview

This document defines the parsing strategy to convert raw medical code libraries into a unified format ready for embedding generation.

### Input Sources (6 Libraries)
1. **RxNorm** - RRF pipe-delimited format (~500 MB)
2. **SNOMED-CT** - RF2 tab-delimited format (~1 GB)
3. **LOINC** - CSV format (~100 MB)
4. **PBS** - XML format (~10 MB)
5. **MBS** - CSV/Excel format (~5 MB)
6. **ICD-10-AM** - CSV/Excel format (~50 MB, if acquired)

### Output Format (Standardized JSON)
All parsers will produce the same JSON structure for downstream processing:

```json
{
  "code_system": "rxnorm",
  "code_value": "205923",
  "display_name": "Atorvastatin 20 MG Oral Tablet",
  "entity_type": "medication",
  "search_text": "Atorvastatin 20 MG Oral Tablet",
  "library_version": "v2025Q1",
  "region_specific_data": {},
  "country_code": null
}
```

---

## Standardized Output Schema

Every parsed code must include these fields:

### Core Fields (Required)
```typescript
interface MedicalCodeStandard {
  // Code identification
  code_system: 'rxnorm' | 'snomed' | 'loinc' | 'pbs' | 'mbs' | 'icd10_am';
  code_value: string;           // The actual code (e.g., "205923")
  display_name: string;          // Human-readable name

  // Classification
  entity_type: 'medication' | 'condition' | 'procedure' | 'observation' | 'allergy';

  // Search optimization
  search_text: string;           // Text to embed (concatenated fields)

  // Versioning
  library_version: string;       // e.g., "v2025Q1"

  // Regional data (universal codes set to null)
  country_code: string | null;   // ISO 3166-1 alpha-3 (e.g., 'AUS')
  region_specific_data: object;  // JSON metadata
}
```

### Optional Fields (Parser-Specific)
- `synonyms`: Array of alternative names
- `metadata`: Additional attributes (strength, form, category)
- `relationships`: Parent/child codes, mappings

---

## 1. RxNorm Parser (Universal - Medications)

### Input Format: RRF (Pipe-Delimited)

**Key Files:**
- `RXNCONSO.RRF` - Main concepts file
- `RXNSAT.RRF` - Attributes (strength, form)

**File Structure (RXNCONSO.RRF):**
```
RXCUI|LAT|TS|LUI|STT|SUI|ISPREF|RXAUI|SAUI|SCUI|SDUI|SAB|TTY|CODE|STR|SRL|SUPPRESS|CVF|
205923|ENG|P|L11285|PF|S12345|Y|A123456||M0000000||RXNORM|SCD|205923|Atorvastatin 20 MG Oral Tablet|0|N||
```

**Parsing Logic:**

```typescript
// Parse RXNCONSO.RRF
function parseRxNorm(line: string): MedicalCodeStandard | null {
  const fields = line.split('|');

  // Extract key fields
  const rxcui = fields[0];           // Concept unique ID
  const tty = fields[12];            // Term type
  const code = fields[13];           // RxNorm code
  const displayName = fields[14];    // Drug name

  // Filter: Only include SCD (Semantic Clinical Drug) and SBD (Semantic Branded Drug)
  if (!['SCD', 'SBD'].includes(tty)) {
    return null;
  }

  return {
    code_system: 'rxnorm',
    code_value: rxcui,
    display_name: displayName,
    entity_type: 'medication',
    search_text: displayName,
    library_version: 'v2025Q1',
    country_code: null,
    region_specific_data: {
      term_type: tty,
      code: code
    }
  };
}
```

**Expected Output Count:** ~50,000 medications (filtered)

**Entity Type:** Always `medication`

---

## 2. SNOMED-CT Parser (Universal - Clinical Terms)

### Input Format: RF2 (Tab-Delimited)

**Key Files:**
- `sct2_Concept_Snapshot_INT_YYYYMMDD.txt` - All concepts
- `sct2_Description_Snapshot_INT_YYYYMMDD.txt` - Human-readable names

**File Structure (sct2_Description_Snapshot_INT.txt):**
```
id	effectiveTime	active	moduleId	conceptId	languageCode	typeId	term	caseSignificanceId
123456	20250131	1	900000000000207008	22298006	en	900000000000003001	Myocardial infarction	900000000000020002
```

**Parsing Logic:**

```typescript
// Parse sct2_Description_Snapshot_INT.txt
function parseSNOMED(line: string): MedicalCodeStandard | null {
  const fields = line.split('\t');

  // Extract key fields
  const conceptId = fields[4];       // SNOMED concept ID
  const term = fields[7];            // Human-readable term
  const active = fields[2];          // Active flag

  // Filter: Only active concepts
  if (active !== '1') {
    return null;
  }

  // Entity type classification (requires hierarchy lookup - simplified here)
  const entityType = classifySNOMEDEntity(conceptId);

  return {
    code_system: 'snomed',
    code_value: conceptId,
    display_name: term,
    entity_type: entityType,
    search_text: term,
    library_version: 'v2025Q1',
    country_code: null,
    region_specific_data: {}
  };
}

// Entity type classification based on SNOMED hierarchy
function classifySNOMEDEntity(conceptId: string): EntityType {
  // SNOMED hierarchy lookup (simplified - real implementation needs hierarchy file)
  const hierarchyMap: Record<string, EntityType> = {
    '404684003': 'condition',    // Clinical finding
    '373873005': 'medication',   // Pharmaceutical product
    '71388002': 'procedure',     // Procedure
    '363787002': 'observation',  // Observable entity
    '418038007': 'allergy'       // Propensity to adverse reaction
  };

  // In real implementation: Traverse SNOMED hierarchy to find parent
  // For now: Default to 'condition' (most common)
  return 'condition';
}
```

**Expected Output Count:** ~100,000 clinical terms

**Entity Types:** Mixed (medication, condition, procedure, observation, allergy)

---

## 3. LOINC Parser (Universal - Lab/Observations)

### Input Format: CSV

**Key File:**
- `Loinc.csv` - Main LOINC codes and descriptions

**File Structure (Loinc.csv):**
```csv
LOINC_NUM,COMPONENT,PROPERTY,TIME_ASPCT,SYSTEM,SCALE_TYP,METHOD_TYP,CLASS,LONG_COMMON_NAME
85354-9,Blood pressure panel with all children optional,Pres,Pt,Arterial system,Qn,,PANEL.CARD,Blood pressure panel
```

**Parsing Logic:**

```typescript
// Parse Loinc.csv
function parseLOINC(row: CSVRow): MedicalCodeStandard {
  return {
    code_system: 'loinc',
    code_value: row.LOINC_NUM,
    display_name: row.LONG_COMMON_NAME || row.COMPONENT,
    entity_type: 'observation',
    search_text: `${row.LONG_COMMON_NAME} ${row.COMPONENT}`,
    library_version: 'v2025Q1',
    country_code: null,
    region_specific_data: {
      component: row.COMPONENT,
      property: row.PROPERTY,
      system: row.SYSTEM,
      class: row.CLASS
    }
  };
}
```

**Expected Output Count:** ~50,000 lab/observation codes

**Entity Type:** Always `observation`

---

## 4. PBS Parser (Regional - Australia Medications)

### Input Format: CSV (PBS API)

**NOTE:** As of October 2024, PBS has moved from XML to a new CSV-based API. The PBS API CSV files contain all PBS Schedule data in comma-separated format.

**Key Files (from PBS API CSV ZIP):**
- `items.csv` - Primary data file with PBS item details
- `amt-items.csv` - PBS codes mapped to Australian Medicines Terminology (AMT)
- `organisations.csv` - Manufacturers and suppliers
- `restrictions.csv` - Restriction text (HTML format)
- `prescribers.csv` - Prescriber requirements
- `atc-codes.csv` - ATC classification hierarchy

**Primary File Structure (items.csv) - ACTUAL COLUMN NAMES (2025-10-15):**
```csv
li_item_id,drug_name,li_drug_name,li_form,schedule_form,brand_name,program_code,pbs_code,
benefit_type_code,caution_indicator,note_indicator,manner_of_administration,
moa_preferred_term,maximum_prescribable_pack,maximum_quantity_units,number_of_repeats,
organisation_id,manufacturer_code,pack_size,pricing_quantity,pack_not_to_be_broken_ind,
claimed_price,determined_price,determined_qty,safety_net_resupply_rule_days,...
```

**Sample Record (from actual data):**
```csv
"10001J_14023_31078_31081_31083","Rifaximin","Rifaximin","Tablet 550 mg","rifaximin 550 mg tablet, 56",
"Xifaxan","GE","10001J","A","N","Y","ORAL","Oral","1","56","5","122","NE","56","56","N",
"394.14","394.14","N","20","Y",...
```

**Key Fields:**
- `pbs_code`: PBS code (e.g., "10001J")
- `drug_name`: Drug name (e.g., "Rifaximin")
- `brand_name`: Brand name (e.g., "Xifaxan")
- `li_form`: Form description (e.g., "Tablet 550 mg")
- `schedule_form`: Detailed form (e.g., "rifaximin 550 mg tablet, 56")
- `manner_of_administration`: Administration route (e.g., "ORAL")
- `manufacturer_code`: Manufacturer identifier

**Parsing Logic (Updated for Actual Column Names):**

```typescript
// Parse PBS items.csv (2025 API format)
function parsePBS(row: CSVRow): MedicalCodeStandard {
  // Use li_form for display name (includes drug name + strength + form)
  // e.g., "Tablet 550 mg" or full "Rifaximin Tablet 550 mg"
  const displayName = row.drug_name && row.li_form
    ? `${row.drug_name} ${row.li_form}`
    : row.schedule_form || row.li_form || row.drug_name;

  // Construct search text including brand name for better matching
  const searchText = [
    displayName,
    row.brand_name
  ].filter(Boolean).join(' ');

  return {
    code_system: 'pbs',
    code_value: row.pbs_code,
    display_name: displayName,
    entity_type: 'medication',
    search_text: searchText,
    library_version: 'v2025Q4',
    country_code: 'AUS',
    region_specific_data: {
      brand_name: row.brand_name,
      li_form: row.li_form,
      schedule_form: row.schedule_form,
      manner_of_administration: row.manner_of_administration,
      moa_preferred_term: row.moa_preferred_term,
      program_code: row.program_code,
      manufacturer_code: row.manufacturer_code,
      pack_size: row.pack_size,
      number_of_repeats: row.number_of_repeats,
      caution_indicator: row.caution_indicator === 'Y',
      note_indicator: row.note_indicator === 'Y'
    }
  };
}
```

**Multi-File Strategy (Optional Enhancement):**
```typescript
// Enrich with AMT mappings
async function enrichWithAMT(
  pbsItems: MedicalCodeStandard[],
  amtMappings: Map<string, AMTData>
): Promise<MedicalCodeStandard[]> {
  return pbsItems.map(item => {
    const amtData = amtMappings.get(item.code_value);
    if (amtData) {
      item.region_specific_data.amt_code = amtData.amt_code;
      item.region_specific_data.amt_preferred_term = amtData.preferred_term;
    }
    return item;
  });
}

// Enrich with restriction text
async function enrichWithRestrictions(
  pbsItems: MedicalCodeStandard[],
  restrictions: Map<string, string>
): Promise<MedicalCodeStandard[]> {
  return pbsItems.map(item => {
    const restrictionText = restrictions.get(item.code_value);
    if (restrictionText) {
      item.region_specific_data.restriction_text = restrictionText;
    }
    return item;
  });
}
```

**Expected Output Count:** ~3,000 subsidized medications

**Entity Type:** Always `medication`

**Country Code:** `AUS`

---

## 5. MBS Parser (Regional - Australia Procedures)

### Input Format: CSV/Excel

**Key File:**
- `MBS_Items_YYYYMMDD.xlsx` or `MBS.csv`

**CSV Structure:**
```csv
Item,Description,Category,Fee,ScheduleFee
1,Professional attendance at consulting rooms...,GENERAL PRACTITIONER ATTENDANCES,$38.75,$38.75
23,Professional attendance at consulting rooms...,GENERAL PRACTITIONER ATTENDANCES,$76.95,$76.95
```

**Parsing Logic:**

```typescript
// Parse MBS CSV
function parseMBS(row: CSVRow): MedicalCodeStandard {
  return {
    code_system: 'mbs',
    code_value: row.Item,
    display_name: row.Description,
    entity_type: 'procedure',
    search_text: `${row.Description} ${row.Category}`,
    library_version: 'v2025Q1',
    country_code: 'AUS',
    region_specific_data: {
      category: row.Category,
      fee: parseFloat(row.Fee.replace('$', '')),
      schedule_fee: parseFloat(row.ScheduleFee.replace('$', ''))
    }
  };
}
```

**Expected Output Count:** ~5,000 Medicare service codes

**Entity Type:** Always `procedure`

**Country Code:** `AUS`

---

## 6. ICD-10-AM Parser (Regional - Australia Diagnoses)

### Input Format: CSV/Excel

**Key File:**
- `ICD-10-AM-Tabular-List.xlsx`

**CSV Structure:**
```csv
Code,Description,Category,Chapter
A00,Cholera,Infectious diseases,I
A00.0,Cholera due to Vibrio cholerae 01 biovar cholerae,Infectious diseases,I
```

**Parsing Logic:**

```typescript
// Parse ICD-10-AM CSV
function parseICD10AM(row: CSVRow): MedicalCodeStandard {
  return {
    code_system: 'icd10_am',
    code_value: row.Code,
    display_name: row.Description,
    entity_type: 'condition',
    search_text: row.Description,
    library_version: 'v2025Q1',
    country_code: 'AUS',
    region_specific_data: {
      category: row.Category,
      chapter: row.Chapter
    }
  };
}
```

**Expected Output Count:** ~20,000 diagnosis codes

**Entity Type:** Always `condition`

**Country Code:** `AUS`

---

## 7. Entity Type Classification Rules

### Medication Detection
- **RxNorm:** Always `medication`
- **PBS:** Always `medication`
- **SNOMED:** If concept is descendant of `373873005` (Pharmaceutical product)

### Condition Detection
- **ICD-10-AM:** Always `condition`
- **SNOMED:** If concept is descendant of `404684003` (Clinical finding)

### Procedure Detection
- **MBS:** Always `procedure`
- **SNOMED:** If concept is descendant of `71388002` (Procedure)

### Observation Detection
- **LOINC:** Always `observation`
- **SNOMED:** If concept is descendant of `363787002` (Observable entity)

### Allergy Detection
- **SNOMED:** If concept is descendant of `418038007` (Propensity to adverse reaction)

---

## 8. Search Text Generation Strategy

The `search_text` field is what gets embedded for vector similarity search. Optimize for semantic richness:

### Universal Codes (RxNorm, SNOMED, LOINC)
```typescript
// RxNorm: Use display name (already includes strength + form)
search_text = "Atorvastatin 20 MG Oral Tablet"

// SNOMED: Use primary term
search_text = "Myocardial infarction"

// LOINC: Concatenate long name + component
search_text = "Blood pressure panel with all children optional Blood pressure panel"
```

### Regional Codes (PBS, MBS, ICD-10-AM)
```typescript
// PBS: Concatenate drug name + brand name
search_text = "Atorvastatin 20mg tablets Lipitor"

// MBS: Concatenate description + category
search_text = "Professional attendance at consulting rooms GENERAL PRACTITIONER ATTENDANCES"

// ICD-10-AM: Use description
search_text = "Cholera due to Vibrio cholerae 01 biovar cholerae"
```

---

## 9. Output File Structure

Each parser should produce a JSON file per code system:

```
data/medical-codes/
├── rxnorm/
│   └── processed/
│       └── rxnorm_codes.json         # ~50,000 records
├── snomed/
│   └── processed/
│       └── snomed_codes.json         # ~100,000 records
├── loinc/
│   └── processed/
│       └── loinc_codes.json          # ~50,000 records
├── pbs/
│   └── processed/
│       └── pbs_codes.json            # ~3,000 records
├── mbs/
│   └── processed/
│       └── mbs_codes.json            # ~5,000 records
└── icd10am/
    └── processed/
        └── icd10am_codes.json        # ~20,000 records
```

**JSON Format (Array of Objects):**
```json
[
  {
    "code_system": "rxnorm",
    "code_value": "205923",
    "display_name": "Atorvastatin 20 MG Oral Tablet",
    "entity_type": "medication",
    "search_text": "Atorvastatin 20 MG Oral Tablet",
    "library_version": "v2025Q1",
    "country_code": null,
    "region_specific_data": {}
  },
  ...
]
```

---

## 10. Parser Implementation Plan

### Language: TypeScript (Node.js)

**Why TypeScript:**
- Type safety for medical data
- Existing OpenAI API integration
- Easy integration with Supabase
- Rich ecosystem for CSV/XML/JSON parsing

### Required Libraries:
```bash
pnpm add csv-parser xml2js fs-extra
pnpm add -D @types/node @types/csv-parser @types/xml2js
```

### Parser Architecture:
```typescript
// Abstract base parser
abstract class MedicalCodeParser {
  abstract parse(inputPath: string): Promise<MedicalCodeStandard[]>;
  abstract codeSystem: string;

  async writeOutput(codes: MedicalCodeStandard[], outputPath: string): Promise<void> {
    await fs.writeJson(outputPath, codes, { spaces: 2 });
  }
}

// Concrete implementations
class RxNormParser extends MedicalCodeParser { /* ... */ }
class SNOMEDParser extends MedicalCodeParser { /* ... */ }
class LOINCParser extends MedicalCodeParser { /* ... */ }
class PBSParser extends MedicalCodeParser { /* ... */ }
class MBSParser extends MedicalCodeParser { /* ... */ }
class ICD10AMParser extends MedicalCodeParser { /* ... */ }

// Main orchestrator
async function parseAllCodes() {
  const parsers = [
    new RxNormParser(),
    new SNOMEDParser(),
    new LOINCParser(),
    new PBSParser(),
    new MBSParser(),
    new ICD10AMParser()
  ];

  for (const parser of parsers) {
    const codes = await parser.parse(`data/medical-codes/${parser.codeSystem}/raw/`);
    await parser.writeOutput(codes, `data/medical-codes/${parser.codeSystem}/processed/${parser.codeSystem}_codes.json`);
    console.log(`✓ Parsed ${codes.length} ${parser.codeSystem} codes`);
  }
}
```

---

## 11. Data Validation Rules

Before writing output files, validate each code:

### Required Field Validation
```typescript
function validateCode(code: MedicalCodeStandard): boolean {
  // 1. All required fields present
  if (!code.code_system || !code.code_value || !code.display_name) {
    return false;
  }

  // 2. Entity type valid
  const validEntityTypes = ['medication', 'condition', 'procedure', 'observation', 'allergy'];
  if (!validEntityTypes.includes(code.entity_type)) {
    return false;
  }

  // 3. Search text not empty
  if (!code.search_text || code.search_text.trim() === '') {
    return false;
  }

  // 4. Library version format
  if (!/^v\d{4}Q[1-4]$/.test(code.library_version)) {
    return false;
  }

  // 5. Country code format (if regional)
  if (code.country_code && !/^[A-Z]{3}$/.test(code.country_code)) {
    return false;
  }

  return true;
}
```

### Duplicate Detection
```typescript
function removeDuplicates(codes: MedicalCodeStandard[]): MedicalCodeStandard[] {
  const seen = new Set<string>();
  return codes.filter(code => {
    const key = `${code.code_system}:${code.code_value}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}
```

---

## 12. Error Handling

### Parser Error Strategy
```typescript
class ParseError extends Error {
  constructor(
    public codeSystem: string,
    public line: number,
    public rawData: string,
    message: string
  ) {
    super(`${codeSystem} parser error at line ${line}: ${message}`);
  }
}

// Usage
try {
  const code = parseRxNorm(line);
} catch (error) {
  if (error instanceof ParseError) {
    console.error(`Skipping invalid record: ${error.message}`);
    continue;
  }
  throw error;
}
```

### Parsing Statistics
```typescript
interface ParsingStats {
  totalRecords: number;
  validRecords: number;
  skippedRecords: number;
  errors: Array<{ line: number; error: string }>;
}

function reportStats(stats: ParsingStats, codeSystem: string): void {
  console.log(`
${codeSystem} Parsing Summary:
- Total records: ${stats.totalRecords}
- Valid records: ${stats.validRecords}
- Skipped records: ${stats.skippedRecords}
- Success rate: ${((stats.validRecords / stats.totalRecords) * 100).toFixed(2)}%
  `);
}
```

---

## 13. Next Steps

Once parsing is complete:

1. **Verify output files:**
   - Check record counts match expectations
   - Inspect sample records for correctness
   - Validate JSON schema

2. **Run embedding generation:**
   - See `EMBEDDING-GENERATION-PLAN.md`
   - Use OpenAI text-embedding-3-small
   - Generate 1536-dimensional vectors

3. **Populate database:**
   - See `DATABASE-POPULATION.md`
   - Load into `universal_medical_codes` and `regional_medical_codes` tables
   - Create vector indexes

---

**Last Updated:** 2025-10-15
**Status:** Ready for parser implementation
**Estimated Parsing Time:** 2-4 hours for all 6 libraries
