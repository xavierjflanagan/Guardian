# Pass 1.5 Medical Code Parsing Strategy

**Purpose:** Transform 6 medical code libraries into library-agnostic standardized JSON for embedding generation

**Status:** Active - Implementation ready  
**Created:** 2025-10-15  
**Updated:** 2025-10-16 (clean rewrite)

---

## Executive Summary

This document defines the unified parsing strategy for converting raw medical code libraries into standardized JSON format. Key innovations include **library-agnostic field mapping** and **comprehensive brand name preservation** based on extensive research into universal medical code practices.

**Key Research Findings (2025-10-16):**
- **RxNorm** includes both generic (SCD) and branded (SBD) medications (~33,000 total codes)
- **SNOMED CT** excludes brands from international release (brands only in national extensions)
- **PBS** must preserve all brand variants using unique identifiers for optimal patient matching
- **Universal worker functions** require standardized field names across all regional libraries

---

## 1. Library-Agnostic Standardized Schema

### Core Interface
```typescript
interface MedicalCodeStandard {
  // STANDARDIZED FIELDS (universal across all libraries)
  code_system: 'rxnorm' | 'snomed' | 'loinc' | 'pbs' | 'mbs' | 'icd10_am';
  code_value: string;           // Most granular unique identifier
  grouping_code?: string;       // Optional grouping identifier
  display_name: string;         // Human-readable name
  
  // Classification
  entity_type: 'medication' | 'condition' | 'procedure' | 'observation' | 'allergy';
  
  // Search optimization
  search_text: string;          // Text for vector embedding
  
  // Versioning
  library_version: string;      // e.g., "v2025Q4"
  
  // Regional data
  country_code: string | null;  // ISO 3166-1 alpha-3 (e.g., 'AUS')
  region_specific_data: object; // Original field names + library metadata
}
```

### Field Mapping Strategy

| Concept | Standard Field | PBS | RxNorm | NHS dm+d | NDC |
|---------|---------------|-----|--------|----------|-----|
| **Most Specific ID** | `code_value` | `li_item_id` | `RXCUI` | `AMPPID` | `NDC_code` |
| **Grouping ID** | `grouping_code` | `pbs_code` | null | `VMPID` | `Generic_name` |
| **Original Fields** | `region_specific_data` | All preserved | All preserved | All preserved | All preserved |

### Universal Worker Benefits
```typescript
// Library-agnostic code matching - works for ANY medical code library
function findSimilarCodes(patientText: string, library: MedicalCodeStandard[]) {
  const matches = vectorSearch(patientText, library.map(c => c.search_text));
  
  // Optional grouping for deduplication (when grouping_code exists)
  const grouped = groupBy(matches, 'grouping_code');
  
  return matches;
}
```

---

## 2. Input Sources & Expected Outputs

| Library | Type | Format | Input Size | Expected Output | Entity Types |
|---------|------|--------|------------|-----------------|--------------|
| **RxNorm** | Universal | RRF (pipe) | ~500 MB | ~33,000 medications | medication |
| **SNOMED-CT** | Universal | RF2 (tab) | ~1 GB | ~100,000 clinical terms | mixed |
| **LOINC** | Universal | CSV | ~100 MB | ~50,000 observations | observation |
| **PBS** | Regional (AUS) | CSV | ~10 MB | ~3,000 medications | medication |
| **MBS** | Regional (AUS) | CSV/Excel | ~5 MB | ~5,000 procedures | procedure |
| **ICD-10-AM** | Regional (AUS) | CSV/Excel | ~50 MB | ~20,000 conditions | condition |

**Total Expected Output:** ~211,000 standardized medical codes

---

## 3. Brand Name Preservation Strategy

### Medical Importance
**Why preserve brand variants:**
1. **Bioequivalence**: ±20% variation allowed between generic/branded (critical for warfarin, levothyroxine)
2. **Excipient allergies**: Different fillers/dyes between brands
3. **Biosimilar distinctions**: Biologics not perfectly identical (Humira vs Amjevita)
4. **Patient compliance**: Elderly patients may only recognize brand names
5. **Clinical documentation**: Healthcare providers need exact medication tracking

### Implementation by Library Type

**Universal Libraries (RxNorm):**
- Each brand gets unique code (SCD vs SBD term types)
- Standard deduplication by `code_value`
- No `grouping_code` needed

**Regional Libraries (PBS, NHS dm+d):**
- Use most granular identifier as `code_value` (preserves all brands)
- Use grouping identifier as `grouping_code` (optional deduplication)
- NO deduplication - preserve all variants

**Non-medication Libraries (MBS, LOINC, ICD-10-AM):**
- Brand preservation not applicable
- Standard deduplication by `code_value`

---

## 4. Parser Specifications

### 4.1 RxNorm Parser (Universal - Medications)

**Input Files:**
- Primary: `RXNCONSO.RRF` (concepts)
- Secondary: `RXNSAT.RRF` (attributes)

**Parsing Logic:**
```typescript
function parseRxNorm(line: string): MedicalCodeStandard | null {
  const fields = line.split('|');
  
  const rxcui = fields[0];           // Unique concept ID
  const tty = fields[12];            // Term type (SCD/SBD)
  const displayName = fields[14];    // Drug name
  
  // Filter: Only SCD (generic) and SBD (branded) medications
  if (!['SCD', 'SBD'].includes(tty)) return null;
  
  return {
    code_system: 'rxnorm',
    code_value: rxcui,              // Each brand gets unique RXCUI
    // grouping_code: null,         // RxNorm doesn't group brands
    display_name: displayName,
    entity_type: 'medication',
    search_text: displayName,
    library_version: 'v2025Q1',
    country_code: null,
    region_specific_data: {
      original_rxcui: rxcui,
      term_type: tty,               // SCD or SBD
      source_code: fields[13]
    }
  };
}
```

### 4.2 PBS Parser (Regional - Australia Medications)

**Input Files:**
- Primary: `items.csv` (all PBS items with brands)
- Optional: `amt-items.csv`, `restrictions.csv`, etc.

**Key Innovation:** Use `li_item_id` for brand preservation
```typescript
function parsePBS(row: CSVRow): MedicalCodeStandard | null {
  if (!row.li_item_id || !row.pbs_code) return null;
  
  const displayName = row.drug_name && row.li_form
    ? `${row.drug_name} ${row.li_form}`
    : row.schedule_form || row.li_form || row.drug_name;
    
  const searchText = [displayName, row.brand_name].filter(Boolean).join(' ');
  
  return {
    code_system: 'pbs',
    code_value: row.li_item_id,     // UNIQUE per brand (preserves all variants)
    grouping_code: row.pbs_code,    // Groups brands of same medication
    display_name: displayName,
    entity_type: 'medication',
    search_text: searchText,
    library_version: 'v2025Q4',
    country_code: 'AUS',
    region_specific_data: {
      original_li_item_id: row.li_item_id,
      original_pbs_code: row.pbs_code,
      brand_name: row.brand_name,
      li_form: row.li_form,
      manufacturer_code: row.manufacturer_code,
      // ... other PBS fields
    }
  };
}
```

### 4.3 SNOMED-CT Parser (Universal - Clinical Terms)

**Input Files:**
- Primary: `sct2_Description_Snapshot_INT_YYYYMMDD.txt`
- Secondary: `sct2_Concept_Snapshot_INT_YYYYMMDD.txt`

**Note:** No brand handling (brands only in national extensions)
```typescript
function parseSNOMED(line: string): MedicalCodeStandard | null {
  const fields = line.split('\t');
  
  const conceptId = fields[4];
  const term = fields[7];
  const active = fields[2];
  
  if (active !== '1') return null;
  
  return {
    code_system: 'snomed',
    code_value: conceptId,
    // grouping_code: null,         // No grouping needed
    display_name: term,
    entity_type: classifySNOMEDEntity(conceptId),
    search_text: term,
    library_version: 'v2025Q1',
    country_code: null,
    region_specific_data: {
      original_concept_id: conceptId
    }
  };
}
```

### 4.4 LOINC Parser (Universal - Lab/Observations)

**Input Files:**
- Primary: `Loinc.csv`

```typescript
function parseLOINC(row: CSVRow): MedicalCodeStandard {
  return {
    code_system: 'loinc',
    code_value: row.LOINC_NUM,
    // grouping_code: null,         // No grouping needed
    display_name: row.LONG_COMMON_NAME || row.COMPONENT,
    entity_type: 'observation',
    search_text: `${row.LONG_COMMON_NAME} ${row.COMPONENT}`,
    library_version: 'v2025Q1',
    country_code: null,
    region_specific_data: {
      original_loinc_num: row.LOINC_NUM,
      component: row.COMPONENT,
      property: row.PROPERTY,
      system: row.SYSTEM,
      class: row.CLASS
    }
  };
}
```

### 4.5 MBS Parser (Regional - Australia Procedures)

**Input Files:**
- Primary: `MBS_Items_YYYYMMDD.xlsx` or `MBS.csv`

```typescript
function parseMBS(row: CSVRow): MedicalCodeStandard {
  return {
    code_system: 'mbs',
    code_value: row.Item,
    // grouping_code: null,         // MBS items are unique
    display_name: row.Description,
    entity_type: 'procedure',
    search_text: `${row.Description} ${row.Category}`,
    library_version: 'v2025Q1',
    country_code: 'AUS',
    region_specific_data: {
      original_item: row.Item,
      category: row.Category,
      fee: parseFloat(row.Fee?.replace('$', '') || '0'),
      schedule_fee: parseFloat(row.ScheduleFee?.replace('$', '') || '0')
    }
  };
}
```

### 4.6 ICD-10-AM Parser (Regional - Australia Diagnoses)

**Input Files:**
- Primary: `ICD-10-AM-Tabular-List.xlsx`

```typescript
function parseICD10AM(row: CSVRow): MedicalCodeStandard {
  return {
    code_system: 'icd10_am',
    code_value: row.Code,
    // grouping_code: null,         // ICD codes are unique
    display_name: row.Description,
    entity_type: 'condition',
    search_text: row.Description,
    library_version: 'v2025Q1',
    country_code: 'AUS',
    region_specific_data: {
      original_code: row.Code,
      category: row.Category,
      chapter: row.Chapter
    }
  };
}
```

---

## 5. Deduplication Strategy

### Universal Libraries (RxNorm, SNOMED, LOINC)
```typescript
// Standard deduplication - each code_value should be unique
function removeDuplicates(codes: MedicalCodeStandard[]): MedicalCodeStandard[] {
  const seen = new Set<string>();
  return codes.filter(code => {
    const key = `${code.code_system}:${code.code_value}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
```

### Regional Libraries with Brands (PBS)
```typescript
// NO deduplication - preserve all brand variants
function preserveAllVariants(codes: MedicalCodeStandard[]): MedicalCodeStandard[] {
  return codes; // Each li_item_id is already unique per brand
}
```

### Regional Libraries without Brands (MBS, ICD-10-AM)
```typescript
// Standard deduplication - codes should be unique
function removeDuplicates(codes: MedicalCodeStandard[]): MedicalCodeStandard[] {
  // Same as universal libraries
}
```

---

## 6. Output File Structure

```
data/medical-codes/
├── rxnorm/processed/rxnorm_codes.json           # ~33,000 records
├── snomed/processed/snomed_codes.json           # ~100,000 records  
├── loinc/processed/loinc_codes.json             # ~50,000 records
├── pbs/processed/pbs_codes.json                 # ~3,000 records
├── mbs/processed/mbs_codes.json                 # ~5,000 records
└── icd10am/processed/icd10am_codes.json         # ~20,000 records
```

**Example Output (PBS with brand preservation):**
```json
[
  {
    "code_system": "pbs",
    "code_value": "10001J_14023_31078_31081_31083",
    "grouping_code": "10001J", 
    "display_name": "Rifaximin Tablet 550 mg",
    "entity_type": "medication",
    "search_text": "Rifaximin Tablet 550 mg Xifaxan",
    "library_version": "v2025Q4",
    "country_code": "AUS",
    "region_specific_data": {
      "original_li_item_id": "10001J_14023_31078_31081_31083",
      "original_pbs_code": "10001J",
      "brand_name": "Xifaxan",
      "li_form": "Tablet 550 mg",
      "manufacturer_code": "NE"
    }
  }
]
```

---

## 7. Validation Rules

```typescript
function validateCode(code: MedicalCodeStandard): boolean {
  // Required fields
  if (!code.code_system || !code.code_value || !code.display_name) return false;
  
  // Entity type
  const validTypes = ['medication', 'condition', 'procedure', 'observation', 'allergy'];
  if (!validTypes.includes(code.entity_type)) return false;
  
  // Search text
  if (!code.search_text?.trim()) return false;
  
  // Library version format
  if (!/^v\d{4}Q[1-4]$/.test(code.library_version)) return false;
  
  // Country code format (if regional)
  if (code.country_code && !/^[A-Z]{3}$/.test(code.country_code)) return false;
  
  return true;
}
```

---

## 8. Implementation Timeline

### Phase 1: Regional Libraries (Week 1)
- ✅ PBS parser complete (brand preservation working)
- 🔄 MBS parser implementation
- 🔄 Run parsers on full datasets

### Phase 2: Universal Libraries (Week 2-3)
- ⏳ UMLS account approval pending
- ⏳ RxNorm parser implementation  
- ⏳ SNOMED-CT parser implementation
- ⏳ LOINC parser implementation

### Phase 3: Integration (Week 4)
- ⏳ Embedding generation for all libraries
- ⏳ Database population with vectors
- ⏳ Pass 1.5 integration testing

---

## 9. Next Steps

**Immediate:**
1. Run PBS parser on full dataset (~3,000 records)
2. Implement MBS parser using same standardized approach
3. Test embedding generation with PBS output

**After UMLS Access:**
4. Implement RxNorm, SNOMED-CT, LOINC parsers
5. Generate embeddings for all 6 libraries (~211,000 codes)
6. Populate Supabase with standardized medical code vectors

---

**Last Updated:** 2025-10-16  
**Status:** PBS parser ready - MBS parser next  
**Estimated Completion:** 3-4 weeks (dependent on UMLS approval)