# Narrative Relationship Model

**Status**: Implementation Ready - Aligned with DRAFT-VISION
**Purpose**: Define flexible relationship-based architecture for organizing clinical narratives without rigid hierarchy levels
**Technical Authority**: Based on [NARRATIVE-ARCHITECTURE-DRAFT-VISION.md](./NARRATIVE-ARCHITECTURE-DRAFT-VISION.md)

## Overview

Moves away from fixed "Master-Sub" hierarchy to flexible parent-child relationships based on clinical logic. Enables multi-parent relationships and dynamic narrative organization based on actual medical context.

## Core Principles

### Flexible Relationship Architecture
**No Fixed Levels**: Abandons rigid "Grand/Minor/Sub" hierarchy in favor of clinical entity-type categorization with flexible parent-child connections.

**Clinical Entity Types**: Categorize narratives by medical context rather than arbitrary hierarchy levels:
- **Condition Narratives**: Heart Failure, Diabetes, Hypertension
- **Medication Narratives**: Lisinopril journey, Metformin management
- **Event Narratives**: Hospital admissions, procedures, crises
- **Procedure Narratives**: Surgery recovery, diagnostic workups
- **Allergy Narratives**: Drug reactions, food sensitivities
- **Monitoring Narratives**: Blood pressure tracking, glucose logs

### Relationship Graph Structure
**Parent-Child Connections**: Based on actual clinical relationships rather than predetermined levels
- Event narrative (hospital admission) can contain multiple medication narratives
- Medication narrative can span multiple event narratives
- Condition narrative can encompass multiple medication and event narratives
- Heart Failure narrative could be under broader Cardiology narrative for complex patients

**Multi-Parent Support**: Complex medical conditions can have multiple parent narratives
- Diabetes medication narrative could link to both "Diabetes Management" and "Cardiovascular Risk" narratives
- Hospital admission could relate to multiple condition narratives

## Database Architecture

### Narrative Relationships Table
```sql
CREATE TABLE narrative_relationships (
  id UUID PRIMARY KEY,
  parent_narrative_id UUID REFERENCES clinical_narratives(id),
  child_narrative_id UUID REFERENCES clinical_narratives(id),
  relationship_type VARCHAR(50), -- 'contains', 'relates_to', 'caused_by', 'part_of'
  relationship_strength DECIMAL(3,2),
  patient_id UUID NOT NULL, -- For RLS
  created_at TIMESTAMP DEFAULT NOW()
);
```

### Relationship Types
- **contains**: Parent encompasses child (e.g., "Heart Failure Management" contains "Lisinopril Therapy")
- **relates_to**: Narratives are clinically connected but not hierarchical
- **caused_by**: Child narrative resulted from parent (e.g., "Medication Side Effects" caused_by "New Drug Trial")
- **part_of**: Child is component of larger parent narrative

### Sibling Relationship Inference
**Automatic Sibling Detection**: Siblings are not explicitly stored but inferred from shared parents
```sql
-- Find sibling narratives
SELECT DISTINCT nr2.child_narrative_id as sibling_id
FROM narrative_relationships nr1
JOIN narrative_relationships nr2 ON nr1.parent_narrative_id = nr2.parent_narrative_id
WHERE nr1.child_narrative_id = ? -- Current narrative
  AND nr2.child_narrative_id != ?; -- Exclude self
```

## Relationship Management

### Dynamic Relationship Creation
**AI-Driven Relationships**: Pass 3 Phase 2 proposes relationships with confidence scores
```typescript
// Pass 3 Phase 2 output example
interface RelationshipHint {
  parent_narrative_id: UUID;
  child_narrative_id: UUID;
  relationship_type: 'contains' | 'relates_to' | 'caused_by' | 'part_of';
  confidence: number; // 0.0 to 1.0
  reasoning: string;
}
```

**Relationship Validation**: System validates proposed relationships for clinical coherence
- Prevent circular relationships (A → B → A)
- Validate entity type compatibility
- Check temporal consistency (child events must align with parent timeline)

### Relationship Traversal
**Graph Navigation Queries**:
```sql
-- Get all children of a narrative
SELECT n.*, nr.relationship_type, nr.relationship_strength
FROM clinical_narratives n
JOIN narrative_relationships nr ON n.id = nr.child_narrative_id
WHERE nr.parent_narrative_id = ?
  AND n.is_current = true;

-- Get all parents of a narrative
SELECT n.*, nr.relationship_type, nr.relationship_strength
FROM clinical_narratives n
JOIN narrative_relationships nr ON n.id = nr.parent_narrative_id
WHERE nr.child_narrative_id = ?
  AND n.is_current = true;

-- Get narrative tree with depth limit
WITH RECURSIVE narrative_tree AS (
  -- Base case: start with target narrative
  SELECT id, title, 0 as depth, ARRAY[id] as path
  FROM clinical_narratives
  WHERE id = ? AND is_current = true

  UNION ALL

  -- Recursive case: find children
  SELECT n.id, n.title, nt.depth + 1, nt.path || n.id
  FROM clinical_narratives n
  JOIN narrative_relationships nr ON n.id = nr.child_narrative_id
  JOIN narrative_tree nt ON nr.parent_narrative_id = nt.id
  WHERE nt.depth < 3 -- Depth limit
    AND NOT n.id = ANY(nt.path) -- Prevent cycles
    AND n.is_current = true
)
SELECT * FROM narrative_tree ORDER BY depth, title;
```

## Cross-Type Relationship Examples

### Medication-Centric View
**Lisinopril Narrative** could have relationships:
- **Parent**: "Heart Failure Management" (condition narrative)
- **Parent**: "Hypertension Control" (condition narrative)
- **Children**: "Dose Escalation Event" (event narrative)
- **Children**: "Side Effect Monitoring" (monitoring narrative)
- **Siblings**: "Metoprolol Therapy", "Furosemide Management" (other medication narratives under same parents)

### Event-Centric View
**Hospital Admission Narrative** could have relationships:
- **Parent**: "Acute Heart Failure Episode" (condition narrative)
- **Children**: "Emergency Medication Changes" (medication narrative)
- **Children**: "Diagnostic Workup" (procedure narrative)
- **Children**: "Discharge Planning" (event narrative)

### Condition-Centric View
**Heart Failure Management** could have relationships:
- **Parent**: "Cardiovascular Health" (broader condition narrative)
- **Children**: Multiple medication narratives (Lisinopril, Metoprolol, etc.)
- **Children**: Multiple event narratives (admissions, clinic visits)
- **Children**: "Symptom Monitoring" (monitoring narrative)

## User Experience Features

### Interactive Narrative Navigation
**Click-to-Explore**: Users can click any narrative to see:
- All parent narratives (broader context)
- All child narratives (detailed components)
- All sibling narratives (related storylines)
- Timeline view of all linked clinical events

### Relationship Visualization
**Narrative Graph View**: Visual representation of narrative relationships
- Node types differentiated by entity type (condition, medication, etc.)
- Edge types show relationship categories
- Relationship strength indicated by edge thickness
- Interactive expansion/collapse of narrative branches

### Contextual Narrative Summaries
**Multi-Context Display**: Same narrative can be summarized differently based on parent context
- "Lisinopril" under "Heart Failure Management": Focus on heart failure benefits
- "Lisinopril" under "Hypertension Control": Focus on blood pressure management

## Clinical Safety & Coherence

### Relationship Validation Rules
**Clinical Logic Checks**:
- Temporal consistency: Child events must fall within or overlap parent timeline
- Entity compatibility: Prevent illogical relationships (e.g., medication containing condition)
- Patient isolation: All relationships must be within same patient context

**Circular Relationship Prevention**:
```sql
-- Check for circular relationships before creation
WITH RECURSIVE path_check AS (
  SELECT parent_narrative_id as start_id, child_narrative_id as current_id, 1 as depth
  FROM narrative_relationships
  WHERE parent_narrative_id = ? -- Proposed parent

  UNION ALL

  SELECT pc.start_id, nr.child_narrative_id, pc.depth + 1
  FROM narrative_relationships nr
  JOIN path_check pc ON nr.parent_narrative_id = pc.current_id
  WHERE pc.depth < 10 -- Prevent infinite recursion
)
SELECT COUNT(*) as circular_count
FROM path_check
WHERE current_id = ? -- Proposed child
  AND start_id = current_id; -- Would create cycle
```

### Quality Assurance
**Relationship Coherence Scoring**: AI evaluates relationship quality
- Medical relevance of connection
- Temporal alignment of narratives
- Consistency with existing relationships
- Overall clinical coherence

## Integration with Pass 3 Processing

### Phase 2: Relationship Hints
**AI Relationship Proposal**: Pass 3 Phase 2 analyzes Phase 1 narrative updates and proposes new relationships
```typescript
interface Phase2Output {
  relationship_hints: {
    parent_narrative_id: UUID;
    child_narrative_id: UUID;
    relationship_type: string;
    confidence: number;
    reasoning: string;
  }[];
}
```

**Relationship Creation Logic**:
```typescript
async function createNarrativeRelationships(
  relationshipHints: RelationshipHint[],
  confidenceThreshold: number = 0.7
) {
  const validHints = relationshipHints.filter(hint =>
    hint.confidence >= confidenceThreshold
  );

  for (const hint of validHints) {
    // Check for circular relationships
    const wouldCreateCycle = await checkCircularRelationship(
      hint.parent_narrative_id,
      hint.child_narrative_id
    );

    if (!wouldCreateCycle) {
      await createRelationship(hint);
    }
  }
}
```

## Performance Considerations

### Efficient Relationship Queries
```sql
-- Optimized indexes for relationship traversal
CREATE INDEX idx_narrative_relationships_parent ON narrative_relationships(parent_narrative_id);
CREATE INDEX idx_narrative_relationships_child ON narrative_relationships(child_narrative_id);
CREATE INDEX idx_narrative_relationships_patient ON narrative_relationships(patient_id);
```

### Relationship Caching
**Common Relationship Views**: Cache frequently accessed relationship patterns
- Patient's top-level narratives (no parents)
- Complete narrative tree for dashboard display
- Sibling groups for related narrative suggestions

### Recursive Query Optimization
**Depth Limiting**: Prevent excessive recursion in narrative tree queries
**Cycle Detection**: Built-in circular relationship prevention
**Patient Scoping**: All recursive queries scoped to single patient for RLS compliance

## Migration from Fixed Hierarchy

### Legacy Compatibility
**Existing "Master-Sub" Concepts**: Can be represented as parent-child relationships
- Former "Master" narratives become parent narratives
- Former "Sub" narratives become child narratives
- Relationship type = 'contains' for most legacy relationships

### Gradual Transition
**Hybrid Period**: Support both fixed categories and flexible relationships during migration
**Data Migration**: Convert existing hierarchical data to relationship table entries
**UI Evolution**: Gradually replace fixed hierarchy UI with dynamic relationship navigation

## Implementation Guidelines

### Relationship Creation Checklist
1. ✅ Validate relationship type compatibility
2. ✅ Check for circular relationship creation
3. ✅ Verify temporal consistency between narratives
4. ✅ Ensure patient isolation (RLS compliance)
5. ✅ Calculate and store relationship strength
6. ✅ Generate clinical reasoning for relationship
7. ✅ Update relationship search indexes

### Performance Best Practices
- Index on parent and child narrative IDs for fast traversal
- Use recursive query depth limits to prevent infinite loops
- Cache common relationship patterns for dashboard display
- Implement relationship strength scoring for relevance ranking

### Clinical Safety Requirements
- Prevent circular relationships that could confuse medical context
- Validate temporal alignment of related narratives
- Maintain patient isolation across all relationship queries
- Preserve complete relationship history for audit compliance

This flexible relationship model enables rich clinical storytelling while maintaining the safety and auditability required for healthcare applications, allowing narratives to organize naturally based on medical logic rather than artificial hierarchy constraints.