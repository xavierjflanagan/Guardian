# Master-Sub Narrative Hierarchy

**Status**: Placeholder - To be fleshed out  
**Purpose**: Define the hierarchical structure and categorization system for organizing clinical narratives into meaningful healthcare journeys

## File Contents (To Be Developed)

This file will contain:

### Hierarchical Structure Design
- Master narrative categories based on healthcare timeline intuition
- Sub-narrative organization and relationship modeling
- Many-to-many relationship handling between masters and subs
- Cross-journey narrative linking for complex medical conditions

### Timeline-Based Categorization
- LONGTERM_JOURNEYS: Chronic condition management spanning months/years
- SHORTTERM_JOURNEYS: Bounded health episodes with clear start/end
- ROUTINE_CARE: Regular preventive care and health maintenance
- GENERAL_HEALTH: Miscellaneous or uncategorized health activities

### Master Narrative Assignment Logic
- AI-driven categorization using medical context and temporal patterns
- Search-before-create logic to prevent duplicate masters
- Embedding-based similarity matching for existing narrative detection
- Clinical reasoning integration for coherent journey organization

### Sub-Narrative Management
- Medical code-based sub-narrative identity and matching
- Clinical event aggregation into coherent sub-stories
- Temporal span calculation and date range management
- Cross-document narrative continuation and evolution

### Many-to-Many Relationship Handling
- Junction table design for sub-narrative to master linking
- Relevance scoring and relationship strength measurement
- Context-specific narrative presentation in different masters
- Conflict resolution for competing master assignments

### User Experience Considerations
- Intuitive narrative naming and description generation
- User relabeling capabilities (e.g., "Pregnancy Journey" → "Charlie's Pregnancy")
- Narrative filtering and search functionality
- Cross-navigation between related healthcare journeys

### Clinical Safety and Coherence
- Prevention of dangerous clinical context mixing across unrelated narratives
- Maintenance of medical accuracy within narrative boundaries
- Provenance tracking for all narrative decisions
- Quality assurance for narrative medical content

### Evolution and Versioning
- Narrative updating through supersession chains
- Version history preservation for regulatory compliance
- Audit trails for narrative modifications and improvements
- Integration with document upload workflow for automatic updates

This hierarchical system enables users to understand their healthcare data through meaningful clinical storylines while maintaining the flexibility to view information through multiple organizational lenses.