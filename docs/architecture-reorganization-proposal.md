# Guardian Documentation Architecture Reorganization Proposal

**Date:** 2025-08-01  
**Author:** Architecture Review  
**Status:** Proposal  

## Executive Summary

This document proposes a comprehensive reorganization of the Guardian documentation structure, focusing on the `/docs/architecture/` folder. The goal is to create a clearer, more maintainable, and more discoverable documentation hierarchy that better serves developers and stakeholders.

## Current Issues Identified

### 1. Architecture Folder Issues
- **Redundant nesting**: Most content lives under `data-pipeline/`, creating unnecessarily deep paths
- **Buried current architecture**: The active v7 architecture is hidden at `data-pipeline/v7/`
- **Mixed organizational patterns**: Frontend docs at top level while data pipeline is nested
- **Scattered ADRs**: Architecture Decision Records exist in multiple locations without clear hierarchy
- **Archive clutter**: Large archive folder with 17+ versioned files creates noise
- **Unclear research relevance**: Research folder lacks clear indicators of current applicability

### 2. API Folder Analysis
The `/docs/api/` folder contains:
- `authentication.md` (empty file)
- `endpoints.md` (comprehensive API documentation)
- `webhooks.md` (empty file)

**API Folder Recommendation**: Keep but clean up - the endpoints.md file is valuable and current, but empty files should be removed.

## Proposed Architecture Folder Structure

```
docs/architecture/
├── README.md                          # Main entry point and navigation guide
├── overview/                          # High-level architecture documentation
│   ├── system-design.md              # Overall system architecture
│   ├── vision.md                     # Product vision and goals
│   └── prototype.md                  # POC/prototype information
│
├── current/                          # Active architecture (v7)
│   ├── README.md                     # v7 overview (from data-pipeline/v7/)
│   ├── core/                         # Core architectural components
│   │   ├── schema.md                 # Database schema design
│   │   ├── multi-profile.md          # Multi-profile management system
│   │   ├── security-compliance.md    # Security and compliance architecture
│   │   └── performance.md            # Performance and monitoring strategy
│   │
│   ├── features/                     # Feature-specific architecture
│   │   ├── healthcare-journey.md     # Patient timeline system
│   │   ├── appointments.md           # Appointment management
│   │   ├── user-experience.md        # UX architecture decisions
│   │   └── provider-portal.md        # Provider portal planning
│   │
│   ├── integration/                  # External integrations
│   │   ├── healthcare-interoperability.md  # FHIR/HL7 integration
│   │   └── infrastructure.md         # Infrastructure integration
│   │
│   └── implementation/               # Implementation details
│       ├── roadmap.md                # Implementation roadmap
│       ├── guide.md                  # Step-by-step implementation guide
│       ├── sql/                      # SQL scripts for deployment
│       └── testing/                  # Testing documentation
│
├── frontend/                         # Frontend architecture
│   ├── design.md                     # Frontend design principles
│   └── prompts/                      # AI development prompts
│
├── decisions/                        # All Architecture Decision Records
│   ├── README.md                     # ADR process and index
│   ├── infrastructure/               # Infrastructure decisions
│   │   ├── 0001-database-choice.md
│   │   └── 0002-hybrid-infrastructure.md
│   │
│   ├── pipeline/                     # Document pipeline decisions
│   │   ├── 0002-gemini-strategy.md
│   │   ├── 0003-claude-strategy.md
│   │   ├── 0004-gemini-rebuttal.md
│   │   ├── 0005-claude-counter.md
│   │   ├── 0006-final-recommendation.md
│   │   └── 0007-claude-synthesis.md
│   │
│   └── frontend/                     # Frontend decisions
│       └── 0008-ai-workflow.md
│
├── research/                         # Active research and analysis
│   ├── README.md                     # Index with status indicators
│   ├── health-app-rag-ai.md         # RAG AI strategy research
│   ├── ocr-comparison.md             # OCR technology comparison
│   └── relational-db-analysis/      # Database design research
│
└── _archive/                         # Historical versions
    ├── README.md                     # Archive structure explanation
    └── v1-v6/                        # Previous architecture versions
```

## Migration Plan

### Phase 1: Structure Creation
1. Create new folder structure
2. Add navigation README files
3. Set up proper cross-linking

### Phase 2: Content Migration
1. **Move v7 content** from `data-pipeline/v7/` to `current/`
2. **Consolidate ADRs** into single `decisions/` hierarchy
3. **Archive old versions** into `_archive/v1-v6/`
4. **Rename files** for clarity (remove redundant prefixes)

### Phase 3: Content Cleanup
1. **Delete empty files** in API folder
2. **Remove duplicate content** across files
3. **Update all internal links** to reflect new structure
4. **Add status indicators** to research documents

## Key Benefits

1. **Improved Discoverability**: Current architecture (v7) is immediately visible
2. **Reduced Path Depth**: Elimination of unnecessary nesting
3. **Clear Organization**: Logical grouping by architectural concern
4. **Better Navigation**: Consistent structure across all sections
5. **Historical Preservation**: Clear separation of archive content
6. **Unified ADR Location**: All decisions in one searchable location

## Files to be Renamed

| Current Name | New Name | Reason |
|-------------|----------|---------|
| `core-schema.md` | `schema.md` | Context clear from folder |
| `multi-profile-management.md` | `multi-profile.md` | Brevity |
| `performance-monitoring.md` | `performance.md` | Brevity |
| `Doctor_portal_architecture_analysis.md` | `provider-portal.md` | Consistency |
| `textract-vs-google-cloud-vision-OCR.md` | `ocr-comparison.md` | Clarity |

## Files to be Deleted/Archived

1. **Archive all**: `unified-data-architecture.v*.md` files (17 versions)
2. **Delete**: Empty `authentication.md` and `webhooks.md` in API folder
3. **Delete**: Redundant README files that only redirect

## API Folder Recommendation

The `/docs/api/` folder should be:
1. **Retained** - The `endpoints.md` file contains valuable, current API documentation
2. **Cleaned** - Remove empty `authentication.md` and `webhooks.md` files
3. **Consider renaming** to `api-reference.md` as a single comprehensive file
4. **Potentially moved** to `/docs/technical/api-reference.md` if creating a broader technical docs section

## Next Steps

1. **Review and approve** this proposal with stakeholders
2. **Create migration checklist** with specific file movements
3. **Execute migration** in a single PR to maintain consistency
4. **Update CLAUDE.md** and other references to reflect new structure
5. **Add redirect notes** in old locations for transition period

## Success Metrics

- Developers can find v7 architecture within 2 clicks from docs root
- ADR lookup time reduced by having single location
- No broken internal documentation links post-migration
- Clear separation between current and archived content

---

*This proposal aims to create a documentation structure that scales with the Guardian project while maintaining clarity and accessibility for all stakeholders.*