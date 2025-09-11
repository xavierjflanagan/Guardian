# Medical Code Resolution

## Overview

This folder addresses the critical challenge of accurately mapping clinical entities extracted from documents to standardized medical codes without overwhelming AI models with massive terminology databases.

## Problem Domain

Healthcare requires standardized medical coding for:
- Clinical decision support (drug interactions, allergies)
- Regulatory compliance (PBS, MBS, SNOMED requirements)
- Data interoperability across healthcare systems
- Accurate deduplication of clinical entities

### Key Challenges
- AI models hallucinate medical codes when asked to generate them
- Medical code databases are too large for AI context windows (300K+ RxNorm concepts)
- Australian-specific codes (PBS, MBS) are not in standard AI training data
- Code granularity affects deduplication safety (ingredient vs specific drug formulation)

## Our Solution: Embedding-Based Code Matching

We use semantic embeddings to bridge the gap between extracted clinical text and verified medical codes:
1. Extract clinical attributes (not codes) in Pass 1
2. Use embeddings to find semantically similar codes from curated database
3. Provide relevant code candidates to Pass 2 for final selection

## Key Files in This Folder

- **`embedding-based-code-matching.md`** - Our innovative embedding approach for medical code resolution
- **`medical-code-database-design.md`** - Database structure for storing and querying medical codes with embeddings
- **`australian-healthcare-codes.md`** - Specific handling for PBS, MBS, and SNOMED-AU codes
- **`pass1-to-pass2-enhancement.md`** - Integration points with the three-pass AI pipeline

## Relationships to Other Folders

- **Temporal Data Management**: Provides the medical codes needed for clinical entity identity and deduplication
- **Narrative Architecture**: Supplies coded clinical data for semantic narrative creation
- **Implementation Planning**: Defines database schemas and AI pipeline modifications required

## Implementation Benefits

- **Accuracy**: No hallucinated codes, only real verified medical codes
- **Efficiency**: Controlled context size (10-20 relevant codes vs 300K+ database)
- **Australian Compliance**: Native support for local healthcare coding standards
- **Scalability**: Vector similarity search with caching for common entities