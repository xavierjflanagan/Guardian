# Narrative Architecture

## Overview

This folder contains the design for Exora's innovative dual-lens healthcare data presentation system: chronological timelines and semantic clinical narratives that provide complementary views of the same underlying clinical data.

## Problem Domain

Healthcare data presentation faces competing needs:
- **Chronological accuracy**: "What happened when" for clinical workflow
- **Clinical coherence**: "Why this matters" for medical understanding
- **Document fragmentation**: Related clinical events scattered across multiple uploads
- **Context preservation**: Maintaining medical reasoning across time

## Our Solution: Dual-Lens Architecture

Users can seamlessly switch between:
1. **Timeline View**: Chronological events with factual sequence
2. **Narrative View**: Semantic clinical storylines with medical reasoning

Both views reference the same underlying clinical events but organize them differently.

## Key Concepts

### Hierarchical Narrative Structure
- **Master Narratives**: High-level clinical journeys (e.g., "Hypertension Management")
- **Sub-Narratives**: Component storylines that contribute to masters
- **Timeline Categories**: LONGTERM, SHORTTERM, ROUTINE_CARE, GENERAL_HEALTH

### Narrative Evolution
- Narratives evolve through supersession (like clinical entities)
- Each upload can update existing narratives or create new ones
- Complete version history preserved for audit

## Key Files in This Folder

- **`master-sub-narrative-hierarchy.md`** - Hierarchical structure and categorization system
- **`timeline-narrative-integration.md`** - Bi-directional navigation between timeline and narrative views
- **`narrative-versioning-supersession.md`** - How narratives evolve over time through file uploads
- **`semantic-coherence-framework.md`** - Pass 3 AI processing for narrative creation

## Relationships to Other Folders

- **Temporal Data Management**: Provides the underlying clinical events that narratives organize
- **Medical Code Resolution**: Enables semantic matching of related clinical entities across narratives
- **Implementation Planning**: Defines database schemas and UI components needed

## Implementation Innovation

### Clinical Safety Through Separation
- Prevents dangerous mixing of clinical context across unrelated documents
- Maintains semantic coherence within narratives while preserving document provenance
- Enables rich clinical storylines without compromising data integrity

### Cost Optimization
- Pass 3 processes structured JSON (from Pass 2) rather than raw text
- 85-95% cost reduction compared to processing full document text for narrative creation
- Embedding-based narrative matching for efficient context management