# Embedding-Based Code Matching

**Status**: Complete Implementation Specification  
**Purpose**: Semantic embedding approach for medical code resolution that provides AI models with relevant code candidates without overwhelming context windows

## Overview

The embedding-based code matching system operates between Pass 1 (raw extraction) and Pass 2 (medical code assignment), providing AI models with 10-20 relevant medical code candidates instead of searching through 300,000+ possible codes. This approach eliminates hallucination while maintaining semantic matching power.

**Key Integration Points**:
- Integrates with [`./code-hierarchy-selection.md`](./code-hierarchy-selection.md) for code assignment logic
- Supports [`./vague-medication-handling.md`](./vague-medication-handling.md) for drug class scenarios
- Feeds into [`../temporal-data-management/clinical-identity-policies.md`](../temporal-data-management/clinical-identity-policies.md) for identity determination

## Architecture Overview

### Two-Phase Medical Code Resolution

```typescript
// Phase 1: Embedding-based candidate retrieval (this file)
const candidates = await retrieveCodeCandidates(extractedEntity);

// Phase 2: AI-powered final selection (code-hierarchy-selection.md)
const finalCode = await selectOptimalCode(extractedEntity, candidates);
```

### Core Components

1. **Embedded Medical Code Database**: Vector representations of all medical codes
2. **Semantic Search Engine**: Fast similarity matching with configurable thresholds
3. **Australian Healthcare Integration**: PBS/MBS codes with local terminology
4. **Vague Medication Resolver**: Special handling for drug class mentions

## Embedded Medical Code Database

### Database Schema for Vector Storage

```sql
-- Medical code embeddings table
CREATE TABLE medical_code_embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Medical code information
  code_system TEXT NOT NULL, -- 'rxnorm', 'snomed', 'pbs', 'atc', etc.
  code_value TEXT NOT NULL,
  display_name TEXT NOT NULL,
  
  -- Search optimization
  search_text TEXT NOT NULL, -- Optimized text for embedding generation
  synonyms TEXT[], -- Alternative names and brand variants
  
  -- Vector embedding (1536 dimensions for text-embedding-3-small)
  embedding VECTOR(1536) NOT NULL,
  
  -- Australian healthcare specificity
  australian_specific BOOLEAN DEFAULT FALSE,
  pbs_authority_required BOOLEAN DEFAULT FALSE,
  mbs_complexity_level TEXT,
  
  -- Quality metadata
  usage_frequency INTEGER DEFAULT 0,
  last_updated TIMESTAMP DEFAULT NOW(),
  
  -- Indexing
  UNIQUE(code_system, code_value)
);

-- Vector similarity index
CREATE INDEX idx_medical_embeddings_vector 
  ON medical_code_embeddings 
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- Performance indexes
CREATE INDEX idx_medical_embeddings_system ON medical_code_embeddings (code_system);
CREATE INDEX idx_medical_embeddings_search ON medical_code_embeddings 
  USING GIN (to_tsvector('english', search_text));
```

### Search Text Optimization

```typescript
function generateOptimizedSearchText(codeData: MedicalCodeData): string {
  const components = [
    codeData.display_name,
    ...codeData.synonyms,
    codeData.generic_name,
    codeData.brand_names?.join(' '),
    codeData.clinical_description
  ].filter(Boolean);
  
  // Optimize for embedding similarity
  const optimized = components
    .join(' ')
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ') // Remove special characters
    .replace(/\s+/g, ' ')     // Normalize whitespace
    .trim();
    
  return optimized;
}

// Example optimized search texts
const searchTextExamples = {
  lisinopril: "lisinopril ace inhibitor blood pressure hypertension prinivil zestril angiotensin converting enzyme",
  metformin: "metformin diabetes type 2 blood sugar glucose glucophage fortamet biguanide",
  prednisolone: "prednisolone corticosteroid steroid inflammation immune system prednisone prelone"
};
```

### Database Population Pipeline

```typescript
async function populateMedicalCodeEmbeddings(): Promise<void> {
  const codesBySystem = {
    rxnorm: await loadRxNormCodes(),
    snomed: await loadSNOMEDCodes(),
    pbs: await loadPBSCodes(),
    atc: await loadATCCodes(),
    icd10: await loadICD10Codes(),
    mbs: await loadMBSCodes()
  };
  
  for (const [system, codes] of Object.entries(codesBySystem)) {
    for (const code of codes) {
      const searchText = generateOptimizedSearchText(code);
      const embedding = await generateEmbedding(searchText);
      
      await insertCodeEmbedding({
        code_system: system,
        code_value: code.code,
        display_name: code.display,
        search_text: searchText,
        synonyms: code.synonyms || [],
        embedding: embedding,
        australian_specific: ['pbs', 'mbs'].includes(system)
      });
    }
  }
}
```

## Semantic Search Engine

### Embedding Generation

```typescript
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

async function generateEmbedding(text: string): Promise<number[]> {
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: text.substring(0, 8191), // Model input limit
    encoding_format: 'float'
  });
  
  return response.data[0].embedding;
}

// Clinical entity text preparation for embedding
function prepareEntityForEmbedding(entity: ClinicalEntity): string {
  const components = [
    entity.extracted_name,
    entity.strength,
    entity.dose_form,
    entity.route,
    entity.frequency,
    entity.clinical_context
  ].filter(Boolean);
  
  return components.join(' ').toLowerCase().trim();
}
```

### Vector Similarity Search

```typescript
interface CodeCandidate {
  code_system: string;
  code_value: string;
  display_name: string;
  similarity_score: number;
  confidence: number;
  australian_specific: boolean;
}

async function retrieveCodeCandidates(
  entity: ClinicalEntity,
  options: SearchOptions = {}
): Promise<CodeCandidate[]> {
  
  const {
    maxCandidates = 20,
    minSimilarity = 0.7,
    preferAustralian = true,
    entityType = 'medication'
  } = options;
  
  // Generate embedding for extracted entity
  const entityText = prepareEntityForEmbedding(entity);
  const queryEmbedding = await generateEmbedding(entityText);
  
  // Vector similarity search with hybrid approach
  const candidates = await db.query(`
    WITH similarity_search AS (
      SELECT 
        code_system,
        code_value,
        display_name,
        search_text,
        australian_specific,
        1 - (embedding <=> $1::vector) AS similarity_score
      FROM medical_code_embeddings
      WHERE code_system = ANY($2) -- Filter by relevant code systems
        AND 1 - (embedding <=> $1::vector) > $3 -- Similarity threshold
      ORDER BY embedding <=> $1::vector
      LIMIT $4
    ),
    
    text_search AS (
      SELECT 
        code_system,
        code_value,
        display_name,
        search_text,
        australian_specific,
        ts_rank(to_tsvector('english', search_text), plainto_tsquery($5)) AS text_score
      FROM medical_code_embeddings
      WHERE to_tsvector('english', search_text) @@ plainto_tsquery($5)
        AND code_system = ANY($2)
      ORDER BY text_score DESC
      LIMIT 10
    )
    
    SELECT DISTINCT 
      code_system,
      code_value,
      display_name,
      COALESCE(similarity_score, 0) as similarity_score,
      COALESCE(text_score, 0) as text_score,
      australian_specific,
      -- Boost Australian codes if preferred
      CASE 
        WHEN australian_specific AND $6 THEN 
          COALESCE(similarity_score, 0) * 1.1 
        ELSE COALESCE(similarity_score, 0) 
      END as boosted_score
    FROM (
      SELECT * FROM similarity_search
      UNION
      SELECT *, 0 as similarity_score FROM text_search
    ) combined
    ORDER BY boosted_score DESC, australian_specific DESC
    LIMIT $4;
  `, [
    queryEmbedding,
    getRelevantCodeSystems(entityType),
    minSimilarity,
    maxCandidates,
    entityText,
    preferAustralian
  ]);
  
  return candidates.rows.map(row => ({
    ...row,
    confidence: calculateConfidence(row.similarity_score, row.text_score, row.australian_specific)
  }));
}

function getRelevantCodeSystems(entityType: string): string[] {
  const systemMap = {
    medication: ['rxnorm', 'pbs', 'atc'],
    condition: ['snomed', 'icd10', 'icd10_am'],
    procedure: ['snomed', 'mbs', 'cpt'],
    allergy: ['snomed', 'rxnorm'] // For substance allergies
  };
  
  return systemMap[entityType] || ['snomed'];
}
```

## Vague Medication Handling Integration

### Integration with Drug Class Resolution

**Reference**: [`./vague-medication-handling.md`](./vague-medication-handling.md) for complete vague medication logic

```typescript
async function handleVagueMedicationEmbedding(
  vagueEntity: ClinicalEntity
): Promise<CodeCandidate[]> {
  
  // Check if entity matches vague medication patterns
  const vaguePatterns = await checkVagueMedicationPatterns(vagueEntity.extracted_name);
  
  if (vaguePatterns.isVague) {
    // Use ATC code candidates for drug classes
    const atcCandidates = await retrieveATCClassCandidates(
      vaguePatterns.drugClass,
      vagueEntity.clinical_context
    );
    
    return atcCandidates.map(candidate => ({
      ...candidate,
      is_vague_mention: true,
      drug_class: vaguePatterns.drugClass,
      specific_medications: vaguePatterns.commonMedications
    }));
  }
  
  // Standard embedding search for specific medications
  return retrieveCodeCandidates(vagueEntity);
}

async function retrieveATCClassCandidates(
  drugClass: string,
  clinicalContext: string
): Promise<CodeCandidate[]> {
  
  // Focus on ATC codes for drug class matching
  const atcQuery = `${drugClass} ${clinicalContext}`.trim();
  const embedding = await generateEmbedding(atcQuery);
  
  const candidates = await db.query(`
    SELECT 
      code_system,
      code_value,
      display_name,
      search_text,
      1 - (embedding <=> $1::vector) AS similarity_score
    FROM medical_code_embeddings
    WHERE code_system = 'atc'
      AND 1 - (embedding <=> $1::vector) > 0.6
    ORDER BY similarity_score DESC
    LIMIT 10;
  `, [embedding]);
  
  return candidates.rows.map(row => ({
    ...row,
    confidence: row.similarity_score * 0.8, // Lower confidence for vague mentions
    requires_clinical_clarification: true
  }));
}
```

### Vague Mention Detection Pipeline

```typescript
interface VagueMedicationPattern {
  isVague: boolean;
  drugClass?: string;
  atcCode?: string;
  commonMedications?: string[];
  confidence: number;
}

async function checkVagueMedicationPatterns(
  extractedName: string
): Promise<VagueMedicationPattern> {
  
  const normalizedName = extractedName.toLowerCase().trim();
  
  // Predefined vague medication patterns
  const vaguePatterns = {
    "steroids": {
      drugClass: "systemic_corticosteroids",
      atcCode: "H02AB",
      commonMedications: ["prednisolone", "prednisone", "hydrocortisone"]
    },
    "antibiotics": {
      drugClass: "systemic_antibacterials",
      atcCode: "J01",
      commonMedications: ["amoxicillin", "cephalexin", "doxycycline"]
    },
    "blood pressure medication": {
      drugClass: "antihypertensives",
      atcCode: "C02",
      commonMedications: ["lisinopril", "amlodipine", "metoprolol"]
    },
    "diabetes medication": {
      drugClass: "antidiabetics",
      atcCode: "A10",
      commonMedications: ["metformin", "insulin", "gliclazide"]
    }
  };
  
  // Check for exact pattern matches
  for (const [pattern, details] of Object.entries(vaguePatterns)) {
    if (normalizedName.includes(pattern)) {
      return {
        isVague: true,
        drugClass: details.drugClass,
        atcCode: details.atcCode,
        commonMedications: details.commonMedications,
        confidence: 0.9
      };
    }
  }
  
  // Check for partial matches using embedding similarity
  const patternEmbedding = await generateEmbedding(normalizedName);
  const similarPatterns = await findSimilarVaguePatterns(patternEmbedding);
  
  if (similarPatterns.length > 0 && similarPatterns[0].similarity > 0.8) {
    return {
      isVague: true,
      ...similarPatterns[0],
      confidence: similarPatterns[0].similarity * 0.8
    };
  }
  
  return { isVague: false, confidence: 0 };
}
```

## Australian Healthcare Specialization

### PBS Code Integration

```typescript
async function enhancePBSCodeMatching(
  medicationEntity: ClinicalEntity
): Promise<CodeCandidate[]> {
  
  // Australian-specific medication matching
  const pbsCandidates = await retrieveCodeCandidates(medicationEntity, {
    entityType: 'medication',
    preferAustralian: true,
    maxCandidates: 15
  });
  
  // Filter and enhance PBS codes
  const enhancedPBS = pbsCandidates
    .filter(candidate => candidate.code_system === 'pbs')
    .map(candidate => ({
      ...candidate,
      
      // PBS-specific enhancements
      authority_required: checkPBSAuthorityRequirement(candidate.code_value),
      subsidy_information: getPBSSubsidyInfo(candidate.code_value),
      australian_brand_names: getAustralianBrandNames(candidate.code_value),
      
      // Boost confidence for Australian context
      confidence: candidate.confidence * 1.1
    }));
  
  return enhancedPBS;
}

async function checkPBSAuthorityRequirement(pbsCode: string): Promise<boolean> {
  const authorityQuery = await db.query(`
    SELECT pbs_authority_required 
    FROM medical_code_embeddings 
    WHERE code_system = 'pbs' AND code_value = $1
  `, [pbsCode]);
  
  return authorityQuery.rows[0]?.pbs_authority_required || false;
}
```

### SNOMED-AU Variants

```typescript
async function handleSNOMEDAustralianVariants(
  entity: ClinicalEntity
): Promise<CodeCandidate[]> {
  
  // Prioritize SNOMED-AU codes for Australian healthcare context
  const candidates = await retrieveCodeCandidates(entity, {
    entityType: entity.type,
    preferAustralian: true
  });
  
  return candidates.map(candidate => {
    if (candidate.code_system === 'snomed' && candidate.australian_specific) {
      return {
        ...candidate,
        variant_type: 'snomed_au',
        local_terminology: true,
        confidence: candidate.confidence * 1.05 // Slight boost for local variants
      };
    }
    return candidate;
  });
}
```

## Performance Optimization

### Caching Strategy

```typescript
interface CacheEntry {
  candidates: CodeCandidate[];
  timestamp: Date;
  hit_count: number;
}

class EmbeddingCodeCache {
  private cache = new Map<string, CacheEntry>();
  private readonly TTL = 24 * 60 * 60 * 1000; // 24 hours
  private readonly MAX_ENTRIES = 10000;
  
  async getCandidates(
    entityText: string,
    searchOptions: SearchOptions
  ): Promise<CodeCandidate[] | null> {
    
    const cacheKey = this.generateCacheKey(entityText, searchOptions);
    const entry = this.cache.get(cacheKey);
    
    if (entry && (Date.now() - entry.timestamp.getTime()) < this.TTL) {
      entry.hit_count++;
      return entry.candidates;
    }
    
    return null;
  }
  
  async setCandidates(
    entityText: string,
    searchOptions: SearchOptions,
    candidates: CodeCandidate[]
  ): Promise<void> {
    
    // Manage cache size
    if (this.cache.size >= this.MAX_ENTRIES) {
      this.evictLeastUsed();
    }
    
    const cacheKey = this.generateCacheKey(entityText, searchOptions);
    this.cache.set(cacheKey, {
      candidates,
      timestamp: new Date(),
      hit_count: 0
    });
  }
  
  private generateCacheKey(entityText: string, options: SearchOptions): string {
    return `${entityText}:${JSON.stringify(options)}`;
  }
  
  private evictLeastUsed(): void {
    const entries = Array.from(this.cache.entries());
    entries.sort((a, b) => a[1].hit_count - b[1].hit_count);
    
    // Remove least used 10%
    const toRemove = Math.floor(entries.length * 0.1);
    for (let i = 0; i < toRemove; i++) {
      this.cache.delete(entries[i][0]);
    }
  }
}
```

### Batch Processing Optimization

```typescript
async function batchRetrieveCodeCandidates(
  entities: ClinicalEntity[]
): Promise<Map<string, CodeCandidate[]>> {
  
  const results = new Map<string, CodeCandidate[]>();
  
  // Generate all embeddings in batch
  const entityTexts = entities.map(entity => prepareEntityForEmbedding(entity));
  const embeddings = await batchGenerateEmbeddings(entityTexts);
  
  // Batch database query
  const allCandidates = await db.query(`
    SELECT 
      $1::text as entity_id,
      code_system,
      code_value,
      display_name,
      1 - (embedding <=> $2::vector) AS similarity_score,
      australian_specific
    FROM medical_code_embeddings,
         unnest($3::text[], $4::vector[]) AS input(entity_id, query_embedding)
    WHERE 1 - (embedding <=> query_embedding) > 0.7
    ORDER BY entity_id, similarity_score DESC;
  `, [
    entities.map(e => e.id),
    embeddings,
    entities.map(e => e.id),
    embeddings
  ]);
  
  // Group results by entity
  const groupedResults = groupBy(allCandidates.rows, 'entity_id');
  
  for (const [entityId, candidates] of Object.entries(groupedResults)) {
    results.set(entityId, candidates.slice(0, 20)); // Limit to top 20
  }
  
  return results;
}

async function batchGenerateEmbeddings(texts: string[]): Promise<number[][]> {
  const batchSize = 100; // OpenAI batch limit
  const allEmbeddings: number[][] = [];
  
  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    
    const response = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: batch
    });
    
    allEmbeddings.push(...response.data.map(item => item.embedding));
  }
  
  return allEmbeddings;
}
```

## Quality Assurance and Validation

### Confidence Scoring Algorithm

```typescript
function calculateConfidence(
  similarityScore: number,
  textScore: number,
  australianSpecific: boolean,
  entity: ClinicalEntity
): number {
  
  // Base confidence from similarity
  let confidence = similarityScore;
  
  // Boost for text search agreement
  if (textScore > 0.1) {
    confidence = Math.min(confidence + (textScore * 0.1), 1.0);
  }
  
  // Australian healthcare context boost
  if (australianSpecific && entity.australian_context) {
    confidence *= 1.05;
  }
  
  // Penalty for vague entities
  if (entity.is_vague_mention) {
    confidence *= 0.8;
  }
  
  // Penalty for low extraction confidence
  if (entity.extraction_confidence < 0.8) {
    confidence *= entity.extraction_confidence;
  }
  
  return Math.min(Math.max(confidence, 0), 1);
}
```

### Validation Against Known Medical Lists

```typescript
async function validateCodeCandidates(
  candidates: CodeCandidate[],
  entity: ClinicalEntity
): Promise<ValidationResult> {
  
  const validationChecks = await Promise.all([
    validateAgainstTGA(candidates), // Australian Therapeutic Goods Administration
    validateAgainstPBS(candidates), // Pharmaceutical Benefits Scheme
    validateAgainstAMT(candidates), // Australian Medicines Terminology
    crossReferenceWithFDA(candidates) // International validation
  ]);
  
  const overallValidation = {
    candidates_validated: candidates.length,
    tga_approved: validationChecks[0].approved_count,
    pbs_listed: validationChecks[1].listed_count,
    amt_matched: validationChecks[2].matched_count,
    international_recognized: validationChecks[3].recognized_count,
    
    overall_confidence: calculateOverallValidationConfidence(validationChecks),
    
    red_flags: [
      ...validationChecks.flatMap(check => check.red_flags || [])
    ]
  };
  
  return overallValidation;
}
```

### A/B Testing Framework

```typescript
interface ABTestConfig {
  test_name: string;
  control_model: string;
  variant_model: string;
  traffic_split: number; // 0.0 to 1.0
  success_metrics: string[];
}

async function runEmbeddingModelABTest(
  entity: ClinicalEntity,
  testConfig: ABTestConfig
): Promise<CodeCandidate[]> {
  
  const useVariant = Math.random() < testConfig.traffic_split;
  const modelToUse = useVariant ? testConfig.variant_model : testConfig.control_model;
  
  // Log for analysis
  await logABTestEvent({
    test_name: testConfig.test_name,
    entity_id: entity.id,
    model_used: modelToUse,
    is_variant: useVariant,
    timestamp: new Date()
  });
  
  // Generate embedding with selected model
  const embedding = await generateEmbeddingWithModel(
    prepareEntityForEmbedding(entity),
    modelToUse
  );
  
  return performVectorSearch(embedding, entity);
}
```

## Success Criteria

### Technical Performance
- **Sub-100ms candidate retrieval** for 95% of queries
- **95%+ code assignment accuracy** validated against medical experts
- **20x token reduction** compared to full code database context
- **99.9% uptime** for embedding search service

### Clinical Safety
- **Zero harmful code misassignments** in medication resolution
- **Complete audit trail** for all embedding-based decisions
- **Graceful degradation** to conservative fallbacks on low confidence
- **Australian healthcare compliance** with TGA/PBS standards

### Cost Optimization
- **90% reduction in AI context costs** compared to full code database
- **Efficient caching** reducing API calls by 70%+
- **Scalable infrastructure** handling 10,000+ concurrent searches

## Integration Testing

### End-to-End Validation Pipeline

```typescript
async function validateFullCodeResolutionPipeline(
  testCases: ClinicalEntity[]
): Promise<ValidationReport> {
  
  const results = await Promise.all(
    testCases.map(async (entity) => {
      // Step 1: Embedding-based candidate retrieval
      const candidates = await retrieveCodeCandidates(entity);
      
      // Step 2: Code hierarchy selection (from code-hierarchy-selection.md)
      const selectedCode = await selectOptimalCode(entity, candidates);
      
      // Step 3: Clinical identity determination (from clinical-identity-policies.md)
      const identityKey = await generateClinicalIdentityKey(entity, selectedCode);
      
      return {
        entity_id: entity.id,
        candidates_found: candidates.length,
        selected_code: selectedCode,
        identity_key: identityKey,
        pipeline_success: selectedCode !== null
      };
    })
  );
  
  return generateValidationReport(results);
}
```

This comprehensive embedding-based code matching system ensures accurate, efficient, and cost-effective medical code resolution while maintaining the semantic search capabilities needed for complex healthcare terminology.