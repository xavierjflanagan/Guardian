# Render.com Medical Code Resolution Functions Reference

**Purpose**: Functions that should be implemented in the Render.com worker service (NOT in Supabase)
**Context**: These complement the database functions in `2025-09-25_04_medical_code_resolution.sql`

## Required Functions for Render.com Worker

### 1. OpenAI Embedding Generation
```typescript
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

export async function generateEmbedding(text: string): Promise<number[]> {
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: text.substring(0, 8191), // Model input limit
    dimensions: 1536
  });

  return response.data[0].embedding;
}

export async function batchGenerateEmbeddings(texts: string[]): Promise<number[][]> {
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

### 2. Document Origin Detection
```typescript
export function detectDocumentOrigin(
  entityText: string,
  documentContent?: string
): string {
  const text = (entityText + ' ' + (documentContent || '')).toLowerCase();

  // Multi-regional pattern matching (from pass-integration.md)
  if (text.includes('pbs') || text.includes('medicare') || text.includes('tga')) return 'AUS';
  if (text.includes('nhs') || text.includes('bnf') || text.includes('nice')) return 'GBR';
  if (text.includes('medicaid') || text.includes('fda') || text.includes('cpt')) return 'USA';
  if (text.includes('krankenkasse') || text.includes('€')) return 'DEU';
  if (text.includes('ramq') || text.includes('ohip')) return 'CAN';

  return 'AUS'; // Default to Australia for launch
}

export function getRegionalSystemNames(countryCode: string): string[] {
  const systemMap = {
    'AUS': ['pbs', 'mbs', 'tga'],
    'GBR': ['nhs_dmd', 'bnf'],
    'USA': ['ndc', 'cpt'],
    'DEU': ['pzn', 'icd10_gm'],
    'CAN': ['din'],
    'FRA': ['cip', 'ansm']
  };

  return systemMap[countryCode] || ['pbs', 'mbs']; // Default to Australian systems
}
```

### 3. Vague Medication Processing (from vague-medication-handling.md)
```typescript
interface VagueMedicationPattern {
  isVague: boolean;
  drugClass?: string;
  atcCode?: string;
  commonMedications?: string[];
  confidence: number;
}

const DRUG_CLASS_MAPPINGS = {
  "steroids": {
    atc_code: "H02AB",
    clinical_class: "systemic_corticosteroids",
    common_medications: ["prednisolone", "prednisone", "hydrocortisone"],
    identity_strategy: "class_based_with_safety_flags"
  },
  "antibiotics": {
    atc_code: "J01",
    clinical_class: "antibacterials_systemic",
    common_medications: ["amoxicillin", "cephalexin", "doxycycline"],
    identity_strategy: "conservative_unique_per_mention"
  },
  "blood_thinners": {
    atc_code: "B01A",
    clinical_class: "antithrombotic_agents",
    common_medications: ["warfarin", "apixaban", "rivaroxaban"],
    identity_strategy: "class_based_with_bleeding_alerts"
  }
};

export async function processVagueMedicationMention(
  extractedText: string,
  clinicalContext: any
): Promise<VagueMedicationPattern> {
  const normalizedText = extractedText.toLowerCase().trim();

  // Check for exact pattern matches
  for (const [pattern, details] of Object.entries(DRUG_CLASS_MAPPINGS)) {
    if (normalizedText.includes(pattern)) {
      return {
        isVague: true,
        drugClass: details.clinical_class,
        atcCode: details.atc_code,
        commonMedications: details.common_medications,
        confidence: 0.9
      };
    }
  }

  // Check for partial matches using embedding similarity
  const patternEmbedding = await generateEmbedding(normalizedText);
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

### 4. Fork-Style Parallel Code Search (from pass-integration.md)
```typescript
interface ParallelCodeCandidates {
  universal: CodeCandidate[];
  regional: CodeCandidate[];
  documentOrigin: string;
}

export async function findParallelCodeCandidates(
  entity: Pass1Output,
  documentOrigin?: string
): Promise<ParallelCodeCandidates> {

  // Generate embedding for entity text
  const embedding = await generateEmbedding(entity.extracted_text);
  const detectedOrigin = documentOrigin || detectDocumentOrigin(entity.extracted_text);

  // FORK: Search both universal and regional vectors in parallel
  const [universalCandidates, regionalCandidates] = await Promise.all([
    // Universal vector search (RxNorm, SNOMED, LOINC)
    supabase.rpc('search_universal_codes', {
      query_embedding: embedding,
      entity_type_filter: entity.entity_type,
      max_results: 10,
      min_similarity: 0.7
    }),

    // Regional vector search (PBS, MBS, NHS dm+d, etc.)
    supabase.rpc('search_regional_codes', {
      query_embedding: embedding,
      entity_type_filter: entity.entity_type,
      country_code_filter: detectedOrigin,
      max_results: 10,
      min_similarity: 0.7
    })
  ]);

  return {
    universal: universalCandidates.data || [],
    regional: regionalCandidates.data || [],
    documentOrigin: detectedOrigin
  };
}
```

### 5. Code Hierarchy Selection (from code-hierarchy-selection.md)
```typescript
interface CodeSelection {
  selected_code: string | null;
  code_level: string;
  confidence: number;
  reasoning: string;
  requires_composite_identity?: boolean;
  safety_warning?: string;
}

export function selectOptimalRxNormCode(
  candidateCodes: any,
  clinicalContext: any
): CodeSelection {

  // Priority 1: SCD (Semantic Clinical Drug) - Safest for identity
  if (candidateCodes.rxnorm_scd && candidateCodes.scd_confidence > 0.8) {
    return {
      selected_code: candidateCodes.rxnorm_scd,
      code_level: 'SCD',
      confidence: candidateCodes.scd_confidence,
      reasoning: 'Specific strength and form available - safest for deduplication'
    };
  }

  // Priority 2: SBD (Semantic Branded Drug) - When brand specificity matters
  if (candidateCodes.rxnorm_sbd && clinicalContext.brand_specific_therapy) {
    return {
      selected_code: candidateCodes.rxnorm_sbd,
      code_level: 'SBD',
      confidence: candidateCodes.sbd_confidence,
      reasoning: 'Brand-specific therapy identified - preserving brand information'
    };
  }

  // Priority 3: SCDF (Clinical Drug Form) - When strength unclear but form known
  if (candidateCodes.rxnorm_scdf && candidateCodes.scdf_confidence > 0.7) {
    return {
      selected_code: candidateCodes.rxnorm_scdf,
      code_level: 'SCDF',
      confidence: candidateCodes.scdf_confidence,
      reasoning: 'Form identified but strength unclear - conservative approach'
    };
  }

  // Priority 4: Ingredient level - ONLY with strict safeguards
  if (candidateCodes.rxnorm_ingredient && candidateCodes.ingredient_confidence > 0.9) {
    return {
      selected_code: candidateCodes.rxnorm_ingredient,
      code_level: 'INGREDIENT',
      confidence: candidateCodes.ingredient_confidence,
      reasoning: 'High-confidence ingredient identification - requires composite identity',
      requires_composite_identity: true,
      safety_warning: 'Ingredient-level code requires additional safeguards'
    };
  }

  // No suitable RxNorm code found
  return {
    selected_code: null,
    code_level: 'NONE',
    confidence: 0,
    reasoning: 'No RxNorm codes meet confidence thresholds'
  };
}
```

### 6. Complete Pass 1 → Pass 2 Enhancement Pipeline
```typescript
export async function enhanceEntitiesWithParallelCodes(
  entities: Pass1Output[]
): Promise<EnhancedEntity[]> {
  const enhancedEntities = [];

  for (const entity of entities) {
    try {
      // Detect document origin for regional code library selection
      const documentOrigin = detectDocumentOrigin(entity.extracted_text);

      // Check for vague medication patterns
      const vaguePattern = await processVagueMedicationMention(
        entity.extracted_text,
        entity.clinical_context
      );

      if (vaguePattern.isVague) {
        // Handle vague medication with ATC codes
        enhancedEntities.push(await handleVagueMedication(entity, vaguePattern));
        continue;
      }

      // FORK: Search both universal and regional vectors in parallel
      const candidates = await findParallelCodeCandidates(entity, documentOrigin);

      if (candidates.universal.length === 0 && candidates.regional.length === 0) {
        // No matches in either library - create fallback identifier
        enhancedEntities.push({
          ...entity,
          medical_codes: null,
          fallback_identifier: `${entity.entity_type}:${entity.extracted_text.toLowerCase()}`
        });
        continue;
      }

      // AI selects from both shortlists independently
      const selections = await selectFromBothShortlists(entity, candidates);

      // Build final code assignment
      const finalCodes = await buildParallelCodeAssignment(
        entity,
        candidates,
        selections,
        documentOrigin
      );

      // Store assignment in database
      await storeCodeAssignment(entity, finalCodes);

      enhancedEntities.push({
        ...entity,
        medical_codes: finalCodes,
        selection_confidence: calculateCombinedConfidence(selections)
      });

    } catch (error) {
      // Error handling - create fallback
      enhancedEntities.push({
        ...entity,
        medical_codes: null,
        fallback_identifier: `${entity.entity_type}:${entity.extracted_text.toLowerCase()}`,
        error: error.message
      });
    }
  }

  return enhancedEntities;
}

async function storeCodeAssignment(
  entity: Pass1Output,
  finalCodes: ParallelCodeResult
): Promise<void> {
  const assignment = {
    entity_table: entity.target_table, // 'patient_medications', etc.
    entity_id: entity.entity_id,
    patient_id: entity.patient_id,

    // Universal code assignment
    universal_code_system: finalCodes.universal?.system,
    universal_code: finalCodes.universal?.code,
    universal_display: finalCodes.universal?.display,
    universal_confidence: finalCodes.universal?.confidence,

    // Regional code assignment
    regional_code_system: finalCodes.regional?.system,
    regional_code: finalCodes.regional?.code,
    regional_display: finalCodes.regional?.display,
    regional_confidence: finalCodes.regional?.confidence,
    regional_country_code: finalCodes.regional?.country_code,

    // Fallback handling
    fallback_identifier: finalCodes.fallback_identifier,

    assigned_by_system: 'vector_ai'
  };

  const { error } = await supabase
    .from('medical_code_assignments')
    .insert(assignment);

  if (error) {
    throw new Error(`Failed to store code assignment: ${error.message}`);
  }
}
```

### 7. External Validation (from embedding-based-code-matching.md)
```typescript
export async function validateCodeCandidates(
  candidates: CodeCandidate[],
  entity: ClinicalEntity
): Promise<ValidationResult> {

  const validationChecks = await Promise.all([
    validateAgainstTGA(candidates), // Australian Therapeutic Goods Administration
    validateAgainstPBS(candidates), // Pharmaceutical Benefits Scheme
    validateAgainstAMT(candidates), // Australian Medicines Terminology
    crossReferenceWithFDA(candidates) // International validation
  ]);

  return {
    candidates_validated: candidates.length,
    tga_approved: validationChecks[0].approved_count,
    pbs_listed: validationChecks[1].listed_count,
    amt_matched: validationChecks[2].matched_count,
    international_recognized: validationChecks[3].recognized_count,
    overall_confidence: calculateOverallValidationConfidence(validationChecks),
    red_flags: validationChecks.flatMap(check => check.red_flags || [])
  };
}

async function validateAgainstTGA(candidates: CodeCandidate[]): Promise<ValidationCheck> {
  // TGA validation logic for Australian therapeutic goods
  // This would integrate with TGA APIs or databases
  return {
    approved_count: candidates.filter(c => c.tga_approved).length,
    red_flags: candidates.filter(c => c.tga_warnings).map(c => c.tga_warnings).flat()
  };
}
```

### 8. Performance Caching
```typescript
interface CacheEntry {
  candidates: ParallelCodeCandidates;
  timestamp: Date;
  hit_count: number;
}

class MedicalCodeCache {
  private cache = new Map<string, CacheEntry>();
  private readonly TTL = 24 * 60 * 60 * 1000; // 24 hours
  private readonly MAX_ENTRIES = 10000;

  async getCandidates(
    entityText: string,
    documentOrigin: string
  ): Promise<ParallelCodeCandidates | null> {

    const cacheKey = `${entityText}:${documentOrigin}`;
    const entry = this.cache.get(cacheKey);

    if (entry && (Date.now() - entry.timestamp.getTime()) < this.TTL) {
      entry.hit_count++;
      return entry.candidates;
    }

    return null;
  }

  async setCandidates(
    entityText: string,
    documentOrigin: string,
    candidates: ParallelCodeCandidates
  ): Promise<void> {

    if (this.cache.size >= this.MAX_ENTRIES) {
      this.evictLeastUsed();
    }

    const cacheKey = `${entityText}:${documentOrigin}`;
    this.cache.set(cacheKey, {
      candidates,
      timestamp: new Date(),
      hit_count: 0
    });
  }

  private evictLeastUsed(): void {
    const entries = Array.from(this.cache.entries());
    entries.sort((a, b) => a[1].hit_count - b[1].hit_count);

    const toRemove = Math.floor(entries.length * 0.1);
    for (let i = 0; i < toRemove; i++) {
      this.cache.delete(entries[i][0]);
    }
  }
}
```

## Integration with Supabase Functions

### Query Universal Code Candidates
```typescript
const { data: universalCandidates } = await supabase.rpc('search_universal_codes', {
  query_embedding: embedding,
  entity_type_filter: 'medication',
  max_results: 10,
  min_similarity: 0.7
});
```

### Query Regional Code Candidates
```typescript
const { data: regionalCandidates } = await supabase.rpc('search_regional_codes', {
  query_embedding: embedding,
  entity_type_filter: 'medication',
  country_code_filter: 'AUS',
  max_results: 10,
  min_similarity: 0.7
});
```

### Get Assigned Codes for Entity
```typescript
const { data: assignedCodes } = await supabase.rpc('get_entity_medical_codes', {
  p_entity_table: 'patient_medications',
  p_entity_id: medicationId
});
```

## Architecture Benefits

### Supabase Handles:
- ✅ **Vector similarity search** with pgvector optimization
- ✅ **RLS enforcement** on code assignment queries
- ✅ **Complex database queries** across code libraries
- ✅ **Performance indexes** for fast vector search
- ✅ **Data persistence** and transactional integrity

### Render.com Handles:
- ✅ **OpenAI API integration** for embedding generation
- ✅ **Business logic** for code hierarchy selection
- ✅ **Document analysis** and origin detection
- ✅ **Vague medication processing** with ATC code logic
- ✅ **External validation** against TGA/PBS/FDA
- ✅ **Complete pipeline orchestration** from Pass 1 to Pass 2
- ✅ **Caching strategy** for performance optimization
- ✅ **Error handling** and retry logic

This split ensures optimal performance while maintaining proper separation of concerns between database operations (Supabase) and AI integration/business logic (Render.com).