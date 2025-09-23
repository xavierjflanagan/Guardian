# Narrative Versioning Strategy

**Status**: Implementation Ready - Aligned with DRAFT-VISION
**Purpose**: Define immutable narrative versioning using timestamp-based approach for healthcare audit compliance
**Technical Authority**: Based on [NARRATIVE-ARCHITECTURE-DRAFT-VISION.md](./NARRATIVE-ARCHITECTURE-DRAFT-VISION.md)

## Overview

Narrative versioning ensures complete audit trails for healthcare compliance while avoiding error-prone version numbering. Uses timestamp-based ordering with `is_current` flag as source of truth for active narratives.

## Core Principles

### Immutable Healthcare Records
**Requirements**: Never delete or overwrite narrative data - all updates create new versions preserving complete audit trail for regulatory compliance and clinical safety.

### INSERT-Only Pattern
**Implementation**: Never UPDATE narrative rows, only INSERT new versions
- Preserves complete historical context
- Eliminates risk of data loss
- Maintains regulatory compliance
- Enables point-in-time reconstruction

### Timestamp-Based Ordering
**Design Decision**: Use `created_at` for natural version ordering instead of error-prone version numbers
- AI cannot miscount timestamps
- Natural chronological ordering
- Eliminates race condition risks
- Prevents sequence gaps

## Database Schema Design

### Core Versioning Fields
```sql
-- Enhanced clinical_narratives table
CREATE TABLE clinical_narratives (
  id UUID PRIMARY KEY,
  narrative_id UUID,           -- Groups all versions of same narrative
  patient_id UUID NOT NULL,    -- For RLS

  -- Core content
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  summary TEXT,
  narrative_type VARCHAR(50) NOT NULL,

  -- Versioning (NO version numbers)
  is_current BOOLEAN DEFAULT TRUE,     -- Single source of truth
  supersedes_id UUID REFERENCES clinical_narratives(id),
  content_fingerprint TEXT,            -- Change detection

  -- Temporal tracking
  created_at TIMESTAMP DEFAULT NOW(),  -- Natural ordering
  created_by TEXT,                     -- Which Pass/model created this

  -- Clinical temporal fields
  narrative_start_date DATE,
  narrative_end_date DATE,
  last_event_effective_at TIMESTAMP,

  -- Quality metrics
  confidence_score DECIMAL(3,2),
  clinical_coherence_score DECIMAL(3,2),

  -- Shell file attribution
  shell_file_id UUID
);
```

### Version Management Queries
```sql
-- Find current version (source of truth)
SELECT * FROM clinical_narratives
WHERE narrative_id = ? AND is_current = true;

-- Find complete version history
SELECT *, ROW_NUMBER() OVER (PARTITION BY narrative_id ORDER BY created_at) as display_version
FROM clinical_narratives
WHERE narrative_id = ?
ORDER BY created_at DESC;

-- Find version at specific point in time
SELECT * FROM clinical_narratives
WHERE narrative_id = ?
  AND created_at <= ?
ORDER BY created_at DESC
LIMIT 1;
```

## Narrative Evolution Workflow

### Version Creation Process
```typescript
async function createNewNarrativeVersion(
  narrativeId: UUID,
  updates: NarrativeUpdates,
  createdBy: string
) {
  // 1. Generate content fingerprint
  const newFingerprint = generateFingerprint(updates.summary + updates.content);

  // 2. Check if content actually changed
  const current = await getCurrentVersion(narrativeId);
  if (current?.content_fingerprint === newFingerprint) {
    return current; // No actual change, return existing
  }

  // 3. Create new version (INSERT only)
  const newVersion = await db.transaction(async (tx) => {
    // Set previous version as non-current
    await tx.update('clinical_narratives')
      .set({ is_current: false })
      .where({ narrative_id: narrativeId, is_current: true });

    // Insert new version
    return await tx.insert('clinical_narratives').values({
      narrative_id: narrativeId,
      ...updates,
      content_fingerprint: newFingerprint,
      is_current: true,
      supersedes_id: current?.id,
      created_by: createdBy,
      created_at: new Date()
    });
  });

  return newVersion;
}
```

### Content Fingerprint Change Detection
**Purpose**: Prevent unnecessary processing when content hasn't actually changed
```typescript
function generateFingerprint(content: string): string {
  // Use hash of normalized content for change detection
  const normalized = content.trim().toLowerCase().replace(/\s+/g, ' ');
  return crypto.createHash('sha256').update(normalized).digest('hex');
}
```

## Version Safety & Atomicity

### Atomic Version Transitions
**Critical**: Ensure exactly one current version exists at all times
```sql
-- Atomic version update within transaction
BEGIN;
  -- Step 1: Set previous version as non-current
  UPDATE clinical_narratives
  SET is_current = false
  WHERE narrative_id = ? AND is_current = true;

  -- Step 2: Insert new current version
  INSERT INTO clinical_narratives (..., is_current)
  VALUES (..., true);
COMMIT;
```

### Idempotency Through Fingerprints
**Design**: Prevent duplicate processing using content fingerprints
- Same content + fingerprint = safe to skip processing
- Changed fingerprint = new version required
- Failed transaction = no partial state changes

### Relationship Preservation Across Versions
**Challenge**: How do narrative relationships work with versioning?
**Solution**: Relationships always point to `narrative_id` (not specific version ID)
```sql
-- Relationships use narrative_id (not version-specific id)
CREATE TABLE narrative_relationships (
  parent_narrative_id UUID, -- Points to narrative_id, not specific version
  child_narrative_id UUID,  -- Points to narrative_id, not specific version
  -- AI always works with current versions via is_current flag
);
```

## Integration with Pass 3 Processing

### Version Creation During Pass 3
```typescript
// Pass 3 processing with version safety
async function updateNarrativeDuringPass3(
  narrativeId: UUID,
  newContent: string,
  clinicalEvents: ClinicalEvent[]
) {
  // Check for actual content changes
  const contentChanged = await hasContentChanged(narrativeId, newContent);
  if (!contentChanged) {
    return { action: 'skipped', reason: 'no_content_change' };
  }

  // Create new version with updated temporal fields
  const newVersion = await createNewNarrativeVersion(narrativeId, {
    content: newContent,
    summary: generateSummary(newContent),
    last_event_effective_at: getLatestEventDate(clinicalEvents),
    // narrative_start_date/end_date updated based on event span
  }, 'Pass3_AI');

  return { action: 'updated', version: newVersion };
}
```

### Entity Link Migration
**Question**: How do clinical event links transfer across versions?
**Answer**: Links reference `narrative_id` (not version-specific ID), so they automatically follow current version
```sql
-- Entity links use narrative_id (stable across versions)
CREATE TABLE narrative_medication_links (
  narrative_id UUID,  -- Stable reference across versions
  medication_id UUID,
  -- Links automatically follow current version
);
```

## Audit Trail & Compliance

### Complete Version History
**Regulatory Requirement**: Healthcare systems must maintain complete audit trails
```sql
-- Audit query: Show narrative evolution over time
SELECT
  created_at,
  created_by,
  title,
  summary,
  CASE WHEN is_current THEN 'CURRENT' ELSE 'HISTORICAL' END as status,
  ROW_NUMBER() OVER (ORDER BY created_at) as sequence_number
FROM clinical_narratives
WHERE narrative_id = ?
ORDER BY created_at;
```

### Change Attribution
**Compliance**: Track who/what created each version
- `created_by`: 'Pass3_AI', 'manual_user_edit', 'system_migration'
- `shell_file_id`: Which document upload triggered the change
- `created_at`: Exact timestamp of change
- `supersedes_id`: Links to previous version for change tracking

### Point-in-Time Reconstruction
**Capability**: Reconstruct narrative state at any historical point
```typescript
async function getNarrativeAtDate(narrativeId: UUID, targetDate: Date) {
  return await db.query(`
    SELECT * FROM clinical_narratives
    WHERE narrative_id = ?
      AND created_at <= ?
    ORDER BY created_at DESC
    LIMIT 1
  `, [narrativeId, targetDate]);
}
```

## Performance Considerations

### Efficient Current Version Queries
```sql
-- Optimized index for current version lookups
CREATE INDEX idx_clinical_narratives_current
ON clinical_narratives(narrative_id, is_current)
WHERE is_current = true;

-- Fast current version query
SELECT * FROM clinical_narratives
WHERE narrative_id = ? AND is_current = true;
```

### Version History Pagination
```sql
-- Paginated version history
SELECT *,
       ROW_NUMBER() OVER (ORDER BY created_at DESC) as version_number
FROM clinical_narratives
WHERE narrative_id = ?
ORDER BY created_at DESC
LIMIT ? OFFSET ?;
```

### Storage Optimization
**Strategy**: Compress old versions while preserving audit capability
- Current versions: Full content + embeddings
- Historical versions: Compressed content, no embeddings
- Audit trail: Always preserved regardless of compression

## Error Handling & Recovery

### Transaction Failure Recovery
**Scenario**: Version creation transaction fails partway through
**Solution**: Atomic transactions ensure consistent state
```typescript
try {
  const newVersion = await createNewNarrativeVersion(id, updates, creator);
  return newVersion;
} catch (error) {
  // Transaction rolled back automatically
  // No partial state changes
  logger.error('Version creation failed', { narrativeId: id, error });
  throw error;
}
```

### Orphaned Version Cleanup
**Prevention**: Foreign key constraints prevent orphaned relationships
**Recovery**: Validation queries to detect and fix any inconsistencies
```sql
-- Validate: Each narrative_id should have exactly one current version
SELECT narrative_id, COUNT(*) as current_count
FROM clinical_narratives
WHERE is_current = true
GROUP BY narrative_id
HAVING COUNT(*) != 1;
```

## Implementation Guidelines

### Version Creation Checklist
1. ✅ Generate content fingerprint for change detection
2. ✅ Check if content actually changed (avoid unnecessary versions)
3. ✅ Use atomic transaction for version transition
4. ✅ Set previous version `is_current = false`
5. ✅ Insert new version with `is_current = true`
6. ✅ Update temporal fields based on clinical events
7. ✅ Track creation attribution (`created_by`)
8. ✅ Preserve relationship links via `narrative_id`

### Performance Best Practices
- Index on `(narrative_id, is_current)` for fast current version lookups
- Use content fingerprints to avoid unnecessary processing
- Compress historical versions for storage efficiency
- Paginate version history queries for large datasets

### Compliance Requirements
- Never delete narrative versions (audit trail preservation)
- Track all changes with attribution and timestamps
- Enable point-in-time reconstruction for regulatory requests
- Maintain relationship integrity across version changes

This versioning strategy provides robust audit trails while avoiding the complexity and error risks of version number management, ensuring healthcare compliance and clinical safety.