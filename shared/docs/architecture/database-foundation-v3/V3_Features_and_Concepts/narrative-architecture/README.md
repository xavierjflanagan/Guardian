# Narrative Architecture

## Overview

This folder contains the design for Exora's innovative dual-lens healthcare data presentation system: chronological timelines and semantic clinical narratives that provide complementary views of the same underlying clinical data.

## Xavier's Comprehensive Narrative Vision - North Star

### **Core User Experience Goals**
**Rich, Navigable Clinical Storytelling**: Users can click on any narrative and explore comprehensive medical context to any depth, with seamless bi-directional navigation between granular details and broader clinical context.

### **Narrative Interaction Model**
**Click on Any Narrative** → Access complete context including:
- **All Contributing Clinical Events**: Timestamped events with links to original source documents
- **All Relationships**: Parent/child/sibling narratives with summaries for context
- **All Linked Entities**: Complete lists of conditions, medications, allergies, procedures connected to this narrative
- **Timeline Integration**: "View Timeline" feature showing chronological sequence of all narrative-related events
- **Bi-directional Navigation**:
  - Small narrative (medication) → broader context (condition management, hospital episodes)
  - Large narrative (hospital admission) → detailed components (specific procedures, medication changes)

### **Narrative Update Architecture Philosophy**
**Immutable Healthcare Records**: Never delete or overwrite narrative data - all updates create new versions preserving complete audit trail for regulatory compliance and clinical safety.

**Frequent Update Handling**: Same narrative updated repeatedly (e.g., medication lists with duplicate entries) should intelligently consolidate into single narrative while preserving all contributing clinical event references.

**Smart Deduplication**: Multiple uploads of same medication list should enhance existing medication narrative rather than create duplicates, while maintaining links to all source documents.

### **AI Processing Strategy**
**Hierarchical Processing Flow**: Update smaller narratives first (medications, procedures) then work up to larger narratives (episodes, conditions) since large narratives are constructed from smaller narrative summaries.

**Minimal AI Context**: Pass 3 AI receives narrative summaries and relationships (not raw clinical event IDs) to focus on narrative coherence rather than data management, with clinical events already wrapped into summaries.

**Timeline-Narrative Integration**: Narratives and timeline views are two complementary lenses of the same clinical data, enabling users to switch seamlessly between semantic storylines and chronological sequences.

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






Xaviers thoughts 18th of September 2025; I've had some more thoughts on the narrative design and concept architecture. I think maybe there should be a third level of narrative. Currently the pre-existing set up is for a master and a sub narrative but I'm thinking there might be need to be a master minor and sub narrative where the master narrative is the very very large overarching narrative such as heart failure than the And the next level down is the minor narrative which is acute presentation to hospital for three days for heart failure management. Then the sub narrative would be a specific to a medication or specific to a complication or specific to a side effect or all the little things that might've happened underneath that minor narrative such as the narrative for a particular medication that was taken and all of the different dose changes that happened or when it started when it was stopped etc and the names of the drugs. The reason why I wanted this additional third layer is that I think the jump from master to sub is too big. We need a bit more of a hierarchy there. All this still needs to be flushed out more than thought through more for all of the used cases and what what kind of a system Best fits maybe maybe there's even a fourth or fifth level too, Not sure. Just I'm gonna continue rambling but taking heart failure as an example the overarching highest level narrative would be heart failure. Let's assign that grandmaster narrative or grand narrative then within that you'd have next level down narratives which could be heart failure medication narrative as well as acute presentation hospital for acute heart failure narrative anything that's directly below the grand narrative of heartfailure. Then the next level down in the hierarchy tree would be anything. It's related to those second level. That's underneath those second level narratives such as I knew a specific medication that was trialed as a part of the anti hyper anti-heart failure medication narrative. This now just makes me think that maybe we don't need to lock names or titles into the hierarchy of narratives assigning titles such as grand master and minor and sub. Instead we just have Top level narrative and sub narratives or we just have narratives and sub-narratives and all we have to worry about is the up or down relationships between narratives because potentially a grand narrative could actually be underneath another one for instance heart failure could be underneath Cardiology or heart management because the patient also has another heart issue in theyre Intertwined. So how do we count for this multi sub up-and-down relationship narrative tree within the The database design and set up. Maybe alternatively we could label narratives not by their hierarchy but by their context or event type such as medication, narrative event narrative condition narrative etc. Because an event narrative could be within a medication narrative and a medication narrative could be within an event narrative. I'm interested to hear AI's thoughts on this. We do definitely need narratives for every medication taken by a patient and for every condition and for every allergy and for every procedure for pretty much everything that you normally think exists on a Patient dashboard list such as a medication condition list or a past surgical list should become a unique narrative because that's where all of the enriched in-depth information will live because AI will be generating these narratives and adding them on almost like a Blockchain and like a human doctor would, but But AI would do it in a much better way. Father thought are that if we do this really well the dashboard could actually pull from the narratives and a summary list bullet point derivative of pitch narrative.  