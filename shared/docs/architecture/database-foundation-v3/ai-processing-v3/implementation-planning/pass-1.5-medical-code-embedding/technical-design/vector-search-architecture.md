# Vector Search Architecture

**Purpose:** Core technical design for vector similarity search

**Status:** Key decisions documented, implementation details pending

**Created:** 2025-10-14

---

## Embedding Text Selection Strategy

**Entity Type-Based Approach:**

```typescript
function getEmbeddingText(entity: Pass1Output): string {
  switch (entity.entity_subcategory) {
    case 'medication':
      // Use normalized for standardized dose format
      return entity.normalized_entity;

    case 'condition':
    case 'diagnosis':
      // Use raw text to preserve clinical nuance
      return entity.entity_text;

    case 'observation':
    case 'vital_sign':
    case 'lab_result':
      // Combine both for maximum context
      return `${entity.normalized_entity} ${entity.entity_text}`.trim();

    default:
      // Fallback: concatenate both
      return `${entity.normalized_entity} ${entity.entity_text}`.trim();
  }
}
```

**Rationale:**
- Medications benefit from standardization (dose format consistency)
- Conditions need clinical nuance preserved (specific terminology)
- Observations benefit from both contexts (measurement + clinical description)

---

## Candidate Selection Algorithm

**Hybrid Approach with Confidence Thresholds:**

```typescript
interface CandidateSelectionConfig {
  MIN_CANDIDATES: 5;      // Always provide at least 5 (unless fewer exist)
  MAX_CANDIDATES: 20;     // Never exceed 20 (token cost control)

  AUTO_INCLUDE_THRESHOLD: 0.85;  // Always include if similarity >= 0.85
  MIN_SIMILARITY: 0.60;           // Never include if similarity < 0.60

  TARGET_CANDIDATES: 10;  // Aim for 10, flex based on confidence
}

async function selectCodeCandidates(
  vectorSearchResults: RawCandidate[]
): Promise<CodeCandidate[]> {
  // Step 1: Filter out low similarity (< 0.60)
  const filtered = vectorSearchResults.filter(c => c.similarity >= 0.60);

  // Step 2: Auto-include high confidence (>= 0.85)
  const highConfidence = filtered.filter(c => c.similarity >= 0.85);

  // Step 3: Fill to target of 10
  const remaining = filtered.filter(c => c.similarity < 0.85);
  const toInclude = Math.max(10 - highConfidence.length, 0);
  const additional = remaining.slice(0, toInclude);

  // Step 4: If many good matches (>= 0.75), include up to 20 total
  const goodMatches = filtered.filter(c => c.similarity >= 0.75);
  const finalList = goodMatches.length > 10
    ? goodMatches.slice(0, 20)
    : [...highConfidence, ...additional];

  // Step 5: Ensure minimum of 5 (if available)
  return finalList.length < 5 && filtered.length >= 5
    ? filtered.slice(0, 5)
    : finalList;
}
```

**Benefits:**
- Token cost control (hard cap at 20)
- Quality guarantee (min 0.60 threshold)
- Flexibility (5-20 based on match quality)
- Always provides options (min 5 if available)

---

## PLACEHOLDER SECTIONS

**To be completed:**
- pgvector index configuration
- OpenAI API integration details
- Caching layer design
- Performance tuning parameters
- Fork-style parallel search (universal + regional codes)

---

**Last Updated:** 2025-10-14
**Status:** Key decisions documented
