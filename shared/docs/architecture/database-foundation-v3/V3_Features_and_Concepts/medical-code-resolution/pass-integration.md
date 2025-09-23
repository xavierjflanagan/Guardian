# Pass 1 to Pass 2 Integration (Simplified)

**Purpose**: Simple integration between entity extraction and medical code assignment using parallel vector search across both universal and regional code libraries.

**Core Flow**: Pass 1 entity → Single embedding → Fork to search both universal & regional vectors → Two shortlists → AI selection → Pass 2 enriched context

## Simple 4-Step Process

### **Step 1: Pass 1 Extracts Clinical Entities**

**Purpose**: AI extracts clinical entities from documents without attempting medical code assignment.
**Output**: Raw clinical entity data with extracted text that will be embedded for vector search.

// ⚠️ ARCHITECTURAL UNCERTAINTY:
// The Pass1-Output structure is unknown at this point - actual Pass 1 output format is TBD.
// Critical decisions pending:
// - Which field(s) should be embedded for vector search?
// - How to handle multi-field entities (name + strength + form)?
// - Should we embed `extracted_text` or construct from `attributes`?

### **Step 2: Fork-Style Parallel Vector Search**

**Purpose**: Single entity embedding searches BOTH universal and regional code libraries simultaneously.
**Output**: Two separate shortlists (universal + regional candidates) for AI selection.
**Regional Decision**: Based on document origin detection (PBS for AUS, NHS dm+d for GBR, etc.)

```typescript
async function findParallelCodeCandidates(
  entity: Pass1Output,
  documentOrigin: string
): Promise<ParallelCandidates> {

  // ⚠️ EMBEDDING FIELD UNCERTAINTY:
  // Currently embedding `extracted_text` but this may need to change based on
  // actual Pass 1 output structure
  const embedding = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: entity.extracted_text  // TODO: Verify this is the correct field
  });

  // FORK: Search both universal and regional vectors in parallel
  const [universalCandidates, regionalCandidates] = await Promise.all([
    // Universal vector search (RxNorm, SNOMED, LOINC)
    supabase.rpc('search_universal_codes', {
      query_embedding: embedding,
      entity_type: entity.entity_type,
      max_results: 10
    }),

    // Regional vector search (PBS, MBS, NHS dm+d, etc.) based on document origin
    supabase.rpc('search_regional_codes', {
      query_embedding: embedding,
      entity_type: entity.entity_type,
      country_code: documentOrigin,  // 'AUS', 'GBR', 'USA', etc.
      max_results: 10
    })
  ]);

  return {
    universal: universalCandidates.data || [],
    regional: regionalCandidates.data || [],
    document_origin: documentOrigin
  };
}

interface ParallelCandidates {
  universal: CodeCandidate[];
  regional: CodeCandidate[];
  document_origin: string;
}
```

### **Step 3: AI Selects Best Codes from Both Shortlists**

**Purpose**: AI evaluates both universal and regional candidate shortlists independently.
**Output**: Separate selections for universal and regional codes (both attempted).
**Context**: Both shortlists provided to AI for informed selection with full candidate context.

// shortlists either procided to pass 2 along with other context + large prompt outlining task (amongst other enrichment tasks), OR if too AI pass 2's role is swelling beyond capability, we recruit a seperate stand alone cheap as chips ai model to perform this simple task of picking the best medical code per medical entity. TBC on which approach we will use but hopefully the first one.  


### **Step 4: Parallel Universal + Regional Code Assignment**

**Purpose**: Convert AI selections into final code assignments for both universal and regional systems.
**Output**: Enhanced entity with both universal and regional codes for Pass 2 processing.
**Storage**: Codes stored in separate `medical_code_assignments` table (not embedded in clinical tables).

// PARALLEL ASSIGNMENT (not hierarchical) - always attempt both
// ALWAYS attempt universal code assignment
// ALWAYS attempt regional code assignment (independent of universal result)
// STORAGE: All codes stored in separate medical_code_assignments table, not embedded in clinical tables


## Complete Fork-Style Integration Function

**Purpose**: Full parallel vector search and code assignment pipeline for Pass 1 to Pass 2 enhancement.
**Process**: Entity → Embed → Fork search → AI selection → Code assignment → Enhanced entity for Pass 2

```typescript
async function enhanceEntitiesWithParallelCodes(entities: Pass1Output[]): Promise<EnhancedEntity[]> {
  const enhancedEntities = [];

  for (const entity of entities) {
    try {
      // Detect document origin for regional code library selection
      const documentOrigin = detectDocumentOrigin(entity);

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

async function buildParallelCodeAssignment(
  entity: Pass1Output,
  candidates: ParallelCandidates,
  selections: ParallelSelections,
  documentOrigin: string
): Promise<ParallelCodeResult> {

  const result: ParallelCodeResult = {};

  // Universal code assignment (if selected and meets confidence threshold)
  if (selections.universal && selections.universal.confidence >= 0.6) {
    const selectedCandidate = candidates.universal[selections.universal.selected_index];
    result.universal = {
      system: selectedCandidate.code_system,
      code: selectedCandidate.code_value,
      display: selectedCandidate.display_name,
      confidence: selections.universal.confidence
    };
  }

  // Regional code assignment (if selected and meets confidence threshold)
  if (selections.regional && selections.regional.confidence >= 0.6) {
    const selectedCandidate = candidates.regional[selections.regional.selected_index];
    result.regional = {
      system: selectedCandidate.code_system,
      code: selectedCandidate.code_value,
      display: selectedCandidate.display_name,
      country_code: documentOrigin,
      confidence: selections.regional.confidence
    };
  }

  return result;
}

interface ParallelCodeResult {
  universal?: {
    system: string;
    code: string;
    display: string;
    confidence: number;
  };
  regional?: {
    system: string;
    code: string;
    display: string;
    country_code: string;
    confidence: number;
  };
}
```

## Enhanced Entity for Pass 2

```typescript
interface EnhancedEntity {
  // Original Pass 1 data
  entity_id: string;
  entity_type: string;
  extracted_text: string;
  attributes: object;

  // Medical codes (stored in separate assignment tables)
  code_assignment_id?: string;     // References medical_code_assignments table

  // Codes provided for Pass 2 processing (not stored in clinical tables)
  medical_codes?: {
    universal?: {
      system: string;        // 'rxnorm', 'snomed', 'loinc'
      code: string;         // '314076'
      display: string;      // 'Lisinopril 10mg Oral Tablet'
      confidence: number;
    };
    regional?: {
      system: string;       // 'pbs', 'mbs', 'nhs_dmd', etc.
      code: string;        // '2345'
      display: string;     // 'Lisinopril tablets'
      country_code: string; // 'AUS', 'GBR', 'USA', etc.
      confidence: number;
    };
  };

  // Fallback handling
  fallback_identifier?: string;    // When no suitable code found
  selection_confidence?: number;
  requires_review?: boolean;
  error?: string;
}
```

## Document Origin Detection (Multi-Regional)

**Purpose**: Determine which regional code library to search based on document markers.
**Output**: Country code that determines regional vector database (PBS for AUS, NHS dm+d for GBR, etc.)
**Impact**: Drives regional code library selection in fork-style vector search.

```typescript
function detectDocumentOrigin(entity: Pass1Output): string {
  const text = entity.extracted_text.toLowerCase();

  // Multi-regional pattern matching (expandable beyond Australia)
  if (text.includes('pbs') || text.includes('medicare') || text.includes('tga')) return 'AUS';
  if (text.includes('nhs') || text.includes('bnf') || text.includes('nice')) return 'GBR';
  if (text.includes('medicaid') || text.includes('fda') || text.includes('cpt')) return 'USA';
  if (text.includes('krankenkasse') || text.includes('€')) return 'DEU';
  if (text.includes('ramq') || text.includes('ohip')) return 'CAN';

  return 'UNKNOWN';
}

function getRegionalSystemNames(countryCode: string): string {
  const systemMap = {
    'AUS': 'PBS/MBS/TGA',
    'GBR': 'NHS dm+d/BNF/NICE',
    'USA': 'NDC/CPT/CMS',
    'DEU': 'PZN/ICD_10_GM/BfArM',
    'CAN': 'DIN/Health Canada/OHIP',
    'FRA': 'CIP/ANSM/AMELI'
  };
  return systemMap[countryCode] || 'Unknown Regional Systems';
}
```

## Performance Targets

- **End-to-end latency**: <500ms for 10 entities
- **Parallel vector search**: <100ms per entity (both universal + regional)
- **AI dual selection**: <200ms per entity (both shortlists processed)
- **Success rate**: >85% code assignment (either universal or regional)
- **Accuracy**: >90% clinically appropriate selections
- **Fork efficiency**: 2x candidates generated with <1.5x latency overhead

## Integration Benefits

**Fork-Style Architecture**: Single embedding searches both universal and regional libraries simultaneously, providing AI with comprehensive context while maintaining performance.

**Pass 2 Enrichment**: Enhanced entities include both universal codes (global interoperability) and regional codes (local healthcare integration) for comprehensive clinical data processing.

**Fallback Safety**: Conservative fallback identifiers ensure no clinical entities are lost when vector search fails or confidence is low.