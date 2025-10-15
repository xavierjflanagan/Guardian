# Worker Functions

**Purpose:** TypeScript implementation for Pass 1.5 vector search

**Status:** SPECIFICATION COMPLETE - Ready for implementation

**Created:** 2025-10-15

---

## Overview

Pass 1.5 worker functions handle vector similarity search for medical code candidate retrieval. These functions run as part of the Render.com worker service and integrate between Pass 1 entity detection and Pass 2 clinical enrichment.

**Key Functions:**
1. `getEmbeddingText()` - Smart entity-type-based text selection
2. `generateEmbedding()` - OpenAI API integration for embeddings
3. `searchMedicalCodeCandidates()` - pgvector similarity search
4. `selectCodeCandidates()` - Candidate filtering and ranking

---

## 1. Embedding Text Selection (Smart Entity-Type Strategy)

```typescript
/**
 * Selects optimal text for embedding generation based on entity type.
 * Leverages Pass 1's dual-input model (AI vision + OCR) to match
 * embedding text format to medical code database expectations.
 */
interface Pass1EntityInput {
  entity_subtype: string;
  original_text: string;
  ai_visual_interpretation: string | null;
  visual_formatting_context: string | null;
}

export function getEmbeddingText(entity: Pass1EntityInput): string {
  const subtype = entity.entity_subtype;

  // Medications/Immunizations: Use standardized format
  // RxNorm/PBS codes expect clean drug names without annotations
  if (['medication', 'immunization'].includes(subtype)) {
    return entity.original_text;
  }

  // Diagnoses/Conditions/Allergies: Prefer expanded clinical context
  // SNOMED/ICD codes benefit from full descriptions (e.g., "T2DM" → "Type 2 Diabetes Mellitus")
  if (['diagnosis', 'allergy', 'symptom'].includes(subtype)) {
    // Use AI interpretation if it adds context beyond original text
    if (entity.ai_visual_interpretation &&
        entity.ai_visual_interpretation !== entity.original_text) {
      return entity.ai_visual_interpretation;
    }
    return entity.original_text;
  }

  // Vital Signs/Labs/Findings: Add measurement context
  // LOINC codes include measurement types in descriptions
  if (['vital_sign', 'lab_result', 'physical_finding'].includes(subtype)) {
    const parts = [entity.original_text];

    // Add formatting context if meaningful
    if (entity.visual_formatting_context &&
        !entity.visual_formatting_context.includes('standard text')) {
      parts.push(entity.visual_formatting_context);
    }

    return parts.join(' ').trim();
  }

  // Procedures: Use expanded descriptions when available
  // MBS/CPT codes have detailed procedure descriptions
  if (subtype === 'procedure') {
    if (entity.ai_visual_interpretation &&
        entity.ai_visual_interpretation.length > entity.original_text.length) {
      return entity.ai_visual_interpretation;
    }
    return entity.original_text;
  }

  // Healthcare Context Identifiers: Use exact text
  // Patient/provider/facility identifiers must be exact matches
  if (['patient_identifier', 'provider_identifier', 'facility_identifier'].includes(subtype)) {
    return entity.original_text;
  }

  // Safe default: original_text (AI-cleaned)
  return entity.original_text;
}
```

---

## 2. Embedding Generation (OpenAI Integration)

```typescript
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

/**
 * Generates vector embedding for medical entity text.
 * Uses OpenAI text-embedding-3-small (1536 dimensions).
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  try {
    const response = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: text.substring(0, 8191), // Model input limit
      encoding_format: 'float'
    });

    return response.data[0].embedding;
  } catch (error) {
    console.error('Embedding generation failed:', error);
    throw new Error(`Failed to generate embedding for text: ${text.substring(0, 50)}...`);
  }
}

/**
 * Batch embedding generation for multiple entities.
 * OpenAI supports up to 100 inputs per request.
 */
export async function generateEmbeddingsBatch(texts: string[]): Promise<number[][]> {
  const batchSize = 100;
  const allEmbeddings: number[][] = [];

  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);

    const response = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: batch,
      encoding_format: 'float'
    });

    allEmbeddings.push(...response.data.map(item => item.embedding));
  }

  return allEmbeddings;
}
```

---

## 3. Medical Code Candidate Search (pgvector)

```typescript
import { SupabaseClient } from '@supabase/supabase-js';

interface CodeCandidate {
  code_system: string;
  code_value: string;
  display_name: string;
  similarity_score: number;
  code_type: 'universal' | 'regional';
  country_code?: string;
}

interface SearchOptions {
  maxCandidates?: number;      // Default: 20
  minSimilarity?: number;       // Default: 0.60
  entityType?: string;          // Filter by entity type
  preferAustralian?: boolean;   // Boost Australian codes
  countryCode?: string;         // Default: 'AUS'
}

/**
 * Searches both universal and regional code databases using pgvector.
 * Implements fork-style parallel search with combined results.
 */
export async function searchMedicalCodeCandidates(
  supabase: SupabaseClient,
  entity: Pass1EntityInput,
  patientCountry: string = 'AUS',
  options: SearchOptions = {}
): Promise<CodeCandidate[]> {

  const {
    maxCandidates = 20,
    minSimilarity = 0.60,
    entityType = entity.entity_subtype,
    preferAustralian = true
  } = options;

  // Step 1: Generate embedding for entity
  const embeddingText = getEmbeddingText(entity);
  const queryEmbedding = await generateEmbedding(embeddingText);

  // Step 2: Fork-style parallel search (universal + regional)
  const [universalResults, regionalResults] = await Promise.all([
    searchUniversalCodes(supabase, queryEmbedding, entityType, maxCandidates, minSimilarity),
    searchRegionalCodes(supabase, queryEmbedding, entityType, patientCountry, maxCandidates, minSimilarity)
  ]);

  // Step 3: Combine and rank results
  const allCandidates = [...universalResults, ...regionalResults];

  // Step 4: Apply Australian preference boost if enabled
  if (preferAustralian && patientCountry === 'AUS') {
    allCandidates.forEach(candidate => {
      if (candidate.code_type === 'regional' && candidate.country_code === 'AUS') {
        candidate.similarity_score *= 1.1; // 10% boost
      }
    });
  }

  // Step 5: Sort by similarity and limit
  const rankedCandidates = allCandidates
    .sort((a, b) => b.similarity_score - a.similarity_score)
    .slice(0, maxCandidates);

  return rankedCandidates;
}

/**
 * Search universal medical codes (RxNorm, SNOMED, LOINC)
 */
async function searchUniversalCodes(
  supabase: SupabaseClient,
  embedding: number[],
  entityType: string,
  limit: number,
  minSimilarity: number
): Promise<CodeCandidate[]> {

  const { data, error } = await supabase.rpc('search_universal_codes', {
    query_embedding: embedding,
    entity_type: entityType,
    max_results: limit
  });

  if (error) throw error;

  return data
    .filter((row: any) => row.similarity_score >= minSimilarity)
    .map((row: any) => ({
      code_system: row.code_system,
      code_value: row.code_value,
      display_name: row.display_name,
      similarity_score: row.similarity_score,
      code_type: 'universal' as const
    }));
}

/**
 * Search regional medical codes (PBS, MBS, ICD-10-AM)
 */
async function searchRegionalCodes(
  supabase: SupabaseClient,
  embedding: number[],
  entityType: string,
  countryCode: string,
  limit: number,
  minSimilarity: number
): Promise<CodeCandidate[]> {

  const { data, error } = await supabase.rpc('search_regional_codes', {
    query_embedding: embedding,
    entity_type: entityType,
    country_code: countryCode,
    max_results: limit
  });

  if (error) throw error;

  return data
    .filter((row: any) => row.similarity_score >= minSimilarity)
    .map((row: any) => ({
      code_system: row.code_system,
      code_value: row.code_value,
      display_name: row.display_name,
      similarity_score: row.similarity_score,
      code_type: 'regional' as const,
      country_code: row.country_code
    }));
}
```

---

## 4. Candidate Selection and Filtering

```typescript
interface CandidateSelectionConfig {
  MIN_CANDIDATES: 5;
  MAX_CANDIDATES: 20;
  AUTO_INCLUDE_THRESHOLD: 0.85;
  MIN_SIMILARITY: 0.60;
  TARGET_CANDIDATES: 10;
}

const CONFIG: CandidateSelectionConfig = {
  MIN_CANDIDATES: 5,
  MAX_CANDIDATES: 20,
  AUTO_INCLUDE_THRESHOLD: 0.85,
  MIN_SIMILARITY: 0.60,
  TARGET_CANDIDATES: 10
};

/**
 * Selects optimal subset of code candidates using hybrid thresholds.
 * Balances quality (confidence) with quantity (options for AI).
 */
export function selectCodeCandidates(
  rawCandidates: CodeCandidate[]
): CodeCandidate[] {

  // Step 1: Filter out low similarity candidates
  const filtered = rawCandidates.filter(
    c => c.similarity_score >= CONFIG.MIN_SIMILARITY
  );

  // Step 2: Auto-include high confidence candidates
  const highConfidence = filtered.filter(
    c => c.similarity_score >= CONFIG.AUTO_INCLUDE_THRESHOLD
  );

  // Step 3: Fill to target of 10 candidates
  const remaining = filtered.filter(
    c => c.similarity_score < CONFIG.AUTO_INCLUDE_THRESHOLD
  );
  const toInclude = Math.max(CONFIG.TARGET_CANDIDATES - highConfidence.length, 0);
  const additional = remaining.slice(0, toInclude);

  // Step 4: If many good matches (>= 0.75), include up to 20 total
  const goodMatches = filtered.filter(c => c.similarity_score >= 0.75);
  const finalList = goodMatches.length > 10
    ? goodMatches.slice(0, CONFIG.MAX_CANDIDATES)
    : [...highConfidence, ...additional];

  // Step 5: Ensure minimum of 5 candidates (if available)
  if (finalList.length < CONFIG.MIN_CANDIDATES && filtered.length >= CONFIG.MIN_CANDIDATES) {
    return filtered.slice(0, CONFIG.MIN_CANDIDATES);
  }

  return finalList;
}
```

---

## 5. Complete Integration Example

```typescript
/**
 * Main Pass 1.5 function: Retrieve medical code candidates for an entity.
 * Called by Pass 2 worker for each pending entity.
 */
export async function retrieveCodeCandidatesForEntity(
  supabase: SupabaseClient,
  entityId: string
): Promise<CodeCandidate[]> {

  const startTime = Date.now();  // Start timing for performance monitoring

  // Step 1: Fetch entity from Pass 1 output
  const { data: entity, error } = await supabase
    .from('entity_processing_audit')
    .select('entity_subtype, original_text, ai_visual_interpretation, visual_formatting_context, patient_id')
    .eq('id', entityId)
    .eq('pass2_status', 'pending')
    .single();

  if (error || !entity) {
    throw new Error(`Entity ${entityId} not found or not ready for Pass 2`);
  }

  // Step 2: Get patient's country from user_profiles (for regional code matching)
  // Note: entity.patient_id references user_profiles.id directly
  // Country is stored in user_profiles.date_preferences->'home_country'
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('date_preferences')
    .eq('id', entity.patient_id)
    .single();

  const patientCountry = profile?.date_preferences?.home_country || 'AUS';

  // Step 3: Search for code candidates
  const rawCandidates = await searchMedicalCodeCandidates(
    supabase,
    entity,
    patientCountry
  );

  // Step 4: Select optimal subset
  const selectedCandidates = selectCodeCandidates(rawCandidates);

  // Step 5: Log to audit trail with actual duration
  const searchDuration = Date.now() - startTime;
  await logCodeResolution(supabase, entityId, selectedCandidates, searchDuration);

  return selectedCandidates;
}

/**
 * Audit logging for code resolution process.
 * Stores candidates in pass15_code_candidates table for audit trail.
 */
async function logCodeResolution(
  supabase: SupabaseClient,
  entityId: string,
  candidates: CodeCandidate[],
  searchDuration: number
): Promise<void> {

  const universalCandidates = candidates.filter(c => c.code_type === 'universal');
  const regionalCandidates = candidates.filter(c => c.code_type === 'regional');

  // Get patient_id from entity for audit record
  const { data: entity } = await supabase
    .from('entity_processing_audit')
    .select('patient_id, original_text')
    .eq('id', entityId)
    .single();

  if (!entity) return;  // Skip if entity not found

  // Store candidates in pass15_code_candidates audit table
  await supabase.from('pass15_code_candidates').insert({
    entity_id: entityId,
    patient_id: entity.patient_id,
    embedding_text: entity.original_text,  // Text that was embedded
    universal_candidates: universalCandidates.map(c => ({
      code_id: c.code_id,
      code_system: c.code_system,
      code_value: c.code_value,
      display_name: c.display_name,
      similarity_score: c.similarity_score
    })),
    regional_candidates: regionalCandidates.map(c => ({
      code_id: c.code_id,
      code_system: c.code_system,
      code_value: c.code_value,
      display_name: c.display_name,
      similarity_score: c.similarity_score
    })),
    total_candidates_found: candidates.length,
    search_duration_ms: searchDuration  // Actual duration, not timestamp
  });
}
```

---

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

  async getCandidates(entityText: string): Promise<CodeCandidate[] | null> {
    const entry = this.cache.get(entityText);

    if (entry && (Date.now() - entry.timestamp.getTime()) < this.TTL) {
      entry.hit_count++;
      return entry.candidates;
    }

    return null;
  }

  setCandidates(entityText: string, candidates: CodeCandidate[]): void {
    if (this.cache.size >= this.MAX_ENTRIES) {
      this.evictLeastUsed();
    }

    this.cache.set(entityText, {
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

export const codeCache = new EmbeddingCodeCache();
```

---

## Error Handling

```typescript
/**
 * Graceful fallback when code candidate retrieval fails.
 * Ensures Pass 2 can continue with degraded functionality.
 */
export async function retrieveCodeCandidatesWithFallback(
  supabase: SupabaseClient,
  entityId: string
): Promise<CodeCandidate[]> {

  try {
    return await retrieveCodeCandidatesForEntity(supabase, entityId);
  } catch (error) {
    console.error(`Pass 1.5 failed for entity ${entityId}:`, error);

    // Log failure for monitoring
    await supabase.from('code_resolutions').insert({
      entity_id: entityId,
      fallback_used: true,
      candidates_count_universal: 0,
      candidates_count_regional: 0
    });

    // Return empty array (Pass 2 will handle no-candidates scenario)
    return [];
  }
}
```

---

## Integration with Pass 2

**Pass 2 Usage:**
```typescript
// In Pass 2 worker, for each pending entity:
const candidates = await retrieveCodeCandidatesWithFallback(supabase, entityId);

// Pass candidates to AI for final code selection
const selectedCode = await aiSelectOptimalCode(entity, candidates);

// Write to medical_code_assignments table
await assignMedicalCode(supabase, entityId, selectedCode);
```

---

**Last Updated:** 2025-10-15
**Status:** Ready for implementation
**Dependencies:** OpenAI SDK, Supabase client, pgvector database functions
