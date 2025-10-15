# Embedding Generation Plan

**Purpose:** Strategy for generating vector embeddings for medical codes

**Status:** SPECIFICATION COMPLETE - Ready for implementation

**Created:** 2025-10-15

---

## Overview

This document details the process for generating vector embeddings for all medical codes in the Pass 1.5 system. Embeddings enable semantic similarity search, allowing us to match clinical entity text (from Pass 1) to relevant medical codes without keyword matching.

**Key Components:**
1. Search text optimization for medical codes
2. OpenAI API integration (text-embedding-3-small, 1536 dimensions)
3. Batch processing strategy for initial population
4. Cost analysis and optimization
5. Synonym and brand name handling
6. Embedding update strategy for new codes

---

## 1. Search Text Optimization

### Objective

Create optimal text representations of medical codes that will match well with clinical entity text from Pass 1.

### Strategy by Code System

**RxNorm (Medications):**
```typescript
function generateRxNormSearchText(code: RxNormCode): string {
  const components = [
    code.generic_name,           // "Lisinopril"
    code.strength,               // "10mg"
    code.dose_form,              // "Oral Tablet"
    ...code.brand_names,         // ["Prinivil", "Zestril"]
    ...code.synonyms             // Alternative names
  ].filter(Boolean);

  return components.join(' ').toLowerCase().trim();
}

// Example output: "lisinopril 10mg oral tablet prinivil zestril"
```

**SNOMED-CT (Conditions, Procedures):**
```typescript
function generateSNOMEDSearchText(code: SNOMEDCode): string {
  const components = [
    code.fully_specified_name,   // "Type 2 diabetes mellitus (disorder)"
    code.preferred_term,         // "Type 2 diabetes"
    ...code.synonyms,            // ["T2DM", "Adult-onset diabetes", "NIDDM"]
    code.definition              // Clinical definition
  ].filter(Boolean);

  return components.join(' ').toLowerCase().trim();
}

// Example output: "type 2 diabetes mellitus disorder type 2 diabetes t2dm adult-onset diabetes niddm"
```

**LOINC (Observations, Labs):**
```typescript
function generateLOINCSearchText(code: LOINCCode): string {
  const components = [
    code.long_common_name,       // "Blood pressure"
    code.short_name,             // "BP"
    code.component,              // "Blood pressure"
    code.property,               // "Pressure"
    code.system,                 // "Arterial system"
    ...code.synonyms
  ].filter(Boolean);

  return components.join(' ').toLowerCase().trim();
}

// Example output: "blood pressure bp pressure arterial system"
```

**PBS (Australian Medications):**
```typescript
function generatePBSSearchText(code: PBSCode): string {
  const components = [
    code.drug_name,              // PBS schedule drug name
    code.brand_name,             // Australian brand
    code.active_ingredient,      // Chemical name
    code.atc_description,        // ATC category description
    ...code.australian_synonyms  // Local terminology
  ].filter(Boolean);

  return components.join(' ').toLowerCase().trim();
}
```

**MBS (Australian Procedures):**
```typescript
function generateMBSSearchText(code: MBSCode): string {
  const components = [
    code.item_description,       // Full procedure description
    code.short_description,      // Abbreviated version
    code.category_description,   // Procedure category
    ...code.synonyms
  ].filter(Boolean);

  return components.join(' ').toLowerCase().trim();
}
```

---

## 2. OpenAI API Integration

### Model Selection

**Model:** `text-embedding-3-small`
- **Dimensions:** 1536
- **Cost:** $0.02 per 1M tokens
- **Performance:** High quality semantic matching
- **Input limit:** 8,191 tokens

### API Configuration

```typescript
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  maxRetries: 3,
  timeout: 60000 // 60 seconds
});

async function generateEmbedding(searchText: string): Promise<number[]> {
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: searchText.substring(0, 8191), // Enforce input limit
    encoding_format: 'float'
  });

  return response.data[0].embedding;
}
```

### Batch Processing

```typescript
/**
 * Batch embedding generation for initial database population.
 * OpenAI supports up to 100 inputs per request.
 */
async function generateEmbeddingsBatch(
  searchTexts: string[],
  batchSize: number = 100
): Promise<number[][]> {

  const allEmbeddings: number[][] = [];

  for (let i = 0; i < searchTexts.length; i += batchSize) {
    const batch = searchTexts.slice(i, i + batchSize);

    console.log(`Processing batch ${i / batchSize + 1} of ${Math.ceil(searchTexts.length / batchSize)}`);

    const response = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: batch,
      encoding_format: 'float'
    });

    allEmbeddings.push(...response.data.map(item => item.embedding));

    // Rate limiting: 500 requests per minute
    if (i + batchSize < searchTexts.length) {
      await sleep(120); // 120ms delay between batches
    }
  }

  return allEmbeddings;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
```

---

## 3. Initial Population Strategy

### Database Size Estimates

**Universal Codes:**
- RxNorm: ~50,000 active codes (medications)
- SNOMED-CT: ~100,000 active codes (conditions, procedures)
- LOINC: ~50,000 active codes (observations, labs)
- **Total Universal:** ~200,000 codes

**Regional Codes (Australia):**
- PBS: ~3,000 active codes
- MBS: ~5,000 active codes
- ICD-10-AM: ~20,000 codes
- **Total Regional (AUS):** ~28,000 codes

**Grand Total:** ~228,000 medical codes

### Batch Processing Plan

```typescript
/**
 * Initial population script for universal_medical_codes table.
 */
async function populateUniversalCodes(supabase: SupabaseClient): Promise<void> {

  console.log('Starting universal code embedding generation...');

  // Step 1: Load all code systems
  const rxnormCodes = await loadRxNormCodes();      // ~50,000
  const snomedCodes = await loadSNOMEDCodes();      // ~100,000
  const loincCodes = await loadLOINCCodes();        // ~50,000

  const allCodes = [
    ...rxnormCodes.map(code => ({ system: 'rxnorm', ...code })),
    ...snomedCodes.map(code => ({ system: 'snomed', ...code })),
    ...loincCodes.map(code => ({ system: 'loinc', ...code }))
  ];

  console.log(`Total codes to process: ${allCodes.length}`);

  // Step 2: Generate search texts
  const searchTexts = allCodes.map(code =>
    generateSearchText(code.system, code)
  );

  // Step 3: Generate embeddings in batches
  const embeddings = await generateEmbeddingsBatch(searchTexts);

  console.log(`Generated ${embeddings.length} embeddings`);

  // Step 4: Insert into database in chunks
  const CHUNK_SIZE = 1000;
  for (let i = 0; i < allCodes.length; i += CHUNK_SIZE) {
    const chunk = allCodes.slice(i, i + CHUNK_SIZE);
    const chunkEmbeddings = embeddings.slice(i, i + CHUNK_SIZE);

    const records = chunk.map((code, idx) => ({
      code_system: code.system,
      code_value: code.code,
      display_name: code.display,
      embedding: chunkEmbeddings[idx],
      entity_type: mapCodeToEntityType(code.system, code),
      usage_frequency: 0,
      active: true
    }));

    await supabase.from('universal_medical_codes').insert(records);

    console.log(`Inserted chunk ${i / CHUNK_SIZE + 1} of ${Math.ceil(allCodes.length / CHUNK_SIZE)}`);
  }

  console.log('Universal code population complete!');
}

/**
 * Similar function for regional codes
 */
async function populateRegionalCodes(supabase: SupabaseClient): Promise<void> {
  console.log('Starting regional code embedding generation...');

  // Step 1: Load all regional code systems
  const pbsCodes = await loadPBSCodes();          // ~3,000
  const mbsCodes = await loadMBSCodes();          // ~5,000
  const icd10AmCodes = await loadICD10AMCodes();  // ~20,000

  const allCodes = [
    ...pbsCodes.map(code => ({ system: 'pbs', country: 'AUS', ...code })),
    ...mbsCodes.map(code => ({ system: 'mbs', country: 'AUS', ...code })),
    ...icd10AmCodes.map(code => ({ system: 'icd10_am', country: 'AUS', ...code }))
  ];

  console.log(`Total regional codes to process: ${allCodes.length}`);

  // Step 2: Generate search texts
  const searchTexts = allCodes.map(code =>
    generateSearchText(code.system, code)
  );

  // Step 3: Generate embeddings in batches
  const embeddings = await generateEmbeddingsBatch(searchTexts);

  console.log(`Generated ${embeddings.length} embeddings`);

  // Step 4: Insert into database in chunks
  const CHUNK_SIZE = 1000;
  for (let i = 0; i < allCodes.length; i += CHUNK_SIZE) {
    const chunk = allCodes.slice(i, i + CHUNK_SIZE);
    const chunkEmbeddings = embeddings.slice(i, i + CHUNK_SIZE);

    const records = chunk.map((code, idx) => ({
      code_system: code.system,
      code_value: code.code,
      display_name: code.display,
      embedding: chunkEmbeddings[idx],
      entity_type: mapCodeToEntityType(code.system, code),
      country_code: code.country,
      usage_frequency: 0,
      active: true
    }));

    await supabase.from('regional_medical_codes').insert(records);

    console.log(`Inserted chunk ${i / CHUNK_SIZE + 1} of ${Math.ceil(allCodes.length / CHUNK_SIZE)}`);
  }

  console.log('Regional code population complete!');
}
```

---

## 4. Cost Analysis

### Initial Population Cost

**Universal Codes (200,000):**
- Average search text length: ~50 tokens
- Total tokens: 200,000 × 50 = 10M tokens
- Cost: 10M × $0.02 / 1M = **$0.20 USD**

**Regional Codes (28,000):**
- Average search text length: ~50 tokens
- Total tokens: 28,000 × 50 = 1.4M tokens
- Cost: 1.4M × $0.02 / 1M = **$0.03 USD**

**Total Initial Population:** **~$0.23 USD**

### Runtime Cost (Per Entity Search)

**Per entity embedding:**
- Average entity text: ~20 tokens
- Cost per embedding: 20 × $0.02 / 1M = **$0.0000004 USD**
- Essentially free (~400 embeddings per penny)

**Caching Strategy:**
- Cache embeddings for 24 hours
- Expected 70% cache hit rate
- Reduces runtime costs by 70%

---

## 5. Synonym and Brand Name Handling

### Strategy

Medical codes often have multiple names (brand names, generic names, abbreviations). We include ALL variants in the search text to maximize matching.

**Example: Lisinopril**
```typescript
const searchText = [
  'lisinopril',           // Generic name
  '10mg',                 // Strength
  'oral tablet',          // Form
  'prinivil',             // Brand name 1
  'zestril',              // Brand name 2
  'ace inhibitor',        // Drug class
  'blood pressure',       // Indication
  'hypertension'          // Indication
].join(' ');

// Embedding captures ALL semantic relationships
```

### Synonym Sources

**RxNorm:**
- Generic names (TTY=IN, SCD, SBD)
- Brand names (TTY=BN)
- Dose forms
- Synonyms from RxNorm relationships

**SNOMED-CT:**
- Fully Specified Names (FSN)
- Preferred Terms (PT)
- Synonyms
- Definitions

**PBS/MBS:**
- Australian brand names
- Active ingredients
- Schedule names
- Local terminology

---

## 6. Embedding Update Strategy

### New Codes

**Frequency:** Monthly updates (medical code databases update quarterly)

**Process:**
```typescript
async function addNewMedicalCodes(
  supabase: SupabaseClient,
  newCodes: MedicalCode[]
): Promise<void> {

  // Step 1: Generate search texts
  const searchTexts = newCodes.map(code =>
    generateSearchText(code.code_system, code)
  );

  // Step 2: Generate embeddings
  const embeddings = await generateEmbeddingsBatch(searchTexts);

  // Step 3: Split into universal and regional records
  const universalRecords: any[] = [];
  const regionalRecords: any[] = [];

  newCodes.forEach((code, idx) => {
    const baseRecord = {
      code_system: code.code_system,
      code_value: code.code_value,
      display_name: code.display_name,
      embedding: embeddings[idx],
      entity_type: mapCodeToEntityType(code.code_system, code),
      active: true
    };

    if (isRegionalCode(code.code_system)) {
      regionalRecords.push({
        ...baseRecord,
        country_code: getCountryCode(code.code_system)
      });
    } else {
      universalRecords.push(baseRecord);
    }
  });

  // Step 4: Insert into appropriate tables
  if (universalRecords.length > 0) {
    await supabase.from('universal_medical_codes').insert(universalRecords);
    console.log(`Added ${universalRecords.length} new universal codes`);
  }

  if (regionalRecords.length > 0) {
    await supabase.from('regional_medical_codes').insert(regionalRecords);
    console.log(`Added ${regionalRecords.length} new regional codes`);
  }
}
```

### Deprecated Codes

**Process:**
```typescript
async function deactivateDeprecatedCodes(
  supabase: SupabaseClient,
  deprecatedCodes: string[]
): Promise<void> {

  // Mark as inactive (don't delete for audit trail)
  await supabase
    .from('universal_medical_codes')
    .update({ active: false, last_updated: new Date() })
    .in('code_value', deprecatedCodes);

  await supabase
    .from('regional_medical_codes')
    .update({ active: false, last_updated: new Date() })
    .in('code_value', deprecatedCodes);

  console.log(`Deactivated ${deprecatedCodes.length} deprecated codes`);
}
```

---

## 7. Quality Assurance

### Validation Tests

```typescript
/**
 * Test embedding quality by verifying expected matches.
 */
async function validateEmbeddingQuality(
  supabase: SupabaseClient
): Promise<void> {

  const testCases = [
    {
      query: 'blood pressure',
      expectedCodes: ['LOINC 85354-9', 'LOINC 8480-6', 'SNOMED 75367002'],
      minSimilarity: 0.85
    },
    {
      query: 'lisinopril 10mg',
      expectedCodes: ['RxNorm 314076', 'PBS 2345'],
      minSimilarity: 0.90
    },
    {
      query: 'type 2 diabetes',
      expectedCodes: ['SNOMED 44054006', 'ICD-10 E11'],
      minSimilarity: 0.85
    }
  ];

  for (const testCase of testCases) {
    const embedding = await generateEmbedding(testCase.query);
    const results = await searchSimilarCodes(supabase, embedding);

    const matchedCodes = results
      .filter(r => r.similarity_score >= testCase.minSimilarity)
      .map(r => `${r.code_system} ${r.code_value}`);

    const hasAllExpected = testCase.expectedCodes.every(
      expected => matchedCodes.includes(expected)
    );

    console.log(`Test "${testCase.query}": ${hasAllExpected ? 'PASS' : 'FAIL'}`);
    if (!hasAllExpected) {
      console.log('Expected:', testCase.expectedCodes);
      console.log('Got:', matchedCodes);
    }
  }
}
```

---

## 8. Monitoring and Maintenance

### Usage Tracking

```typescript
/**
 * Track which codes are frequently matched.
 * Update usage_frequency column for analytics.
 */
async function incrementCodeUsageFrequency(
  supabase: SupabaseClient,
  codeSystem: string,
  codeValue: string
): Promise<void> {

  await supabase.rpc('increment_code_usage', {
    p_code_system: codeSystem,
    p_code_value: codeValue
  });
}
```

### Performance Metrics

Monitor:
- Average embedding generation time
- Vector search latency (p50, p95, p99)
- Cache hit rate
- API error rate
- Cost per entity processed

---

## Implementation Checklist

- [ ] Set up OpenAI API key in environment
- [ ] Load medical code data sources (RxNorm, SNOMED, LOINC, PBS, MBS)
- [ ] Implement search text generation for each code system
- [ ] Create batch embedding generation script
- [ ] Populate universal_medical_codes table (~200,000 codes)
- [ ] Populate regional_medical_codes table (~28,000 codes for AUS)
- [ ] Verify pgvector indexes are created
- [ ] Run validation tests
- [ ] Set up monthly update cron job
- [ ] Configure monitoring dashboard

---

**Last Updated:** 2025-10-15
**Status:** Ready for implementation
**Estimated Initial Cost:** $0.23 USD
**Estimated Runtime Cost:** Negligible (~$0.0000004 per entity)
