# AI Processing v3: Semantic Document Architecture with Hybrid Clinical Narratives

**Status:** Infrastructure Complete - AI Model Integration Required  
**Date:** 27 August 2025  
**Updated:** 6 September 2025 - Infrastructure Deployment Complete  
**Purpose:** Operational V3 infrastructure requiring AI model integration for three-pass processing  
**Previous:** Built pipeline architecture in [ai-processing-v2](../ai-processing-v2/)  
**Current:** V3 worker deployed on Render.com with job coordination operational

---

## Overview
AI Processing v3 implements a revolutionary **semantic document architecture** with hybrid shell file + clinical narratives approach. This system solves the critical multi-document problem while providing both shell_file-centric and story-centric views of medical data, ensuring clinical safety and user choice.

**Key Breakthrough:** Semantic segmentation of complex medical files into clinically coherent narratives while maintaining reliable shell file fallback system.

---

## File Structure

tbc

## Current Implementation Status

### ✅ **COMPLETED: V3 Infrastructure Deployment**

- [x] **V3 Database Schema** - 50+ tables with job coordination deployed to production
- [x] **Render.com Worker** - `exora-v3-worker` operational with job polling and heartbeat
- [x] **Edge Functions** - `shell-file-processor-v3` and `audit-logger-v3` deployed
- [x] **Job Coordination** - `claim_next_job_v3()`, `complete_job()`, heartbeat monitoring operational
- [x] **API Rate Limiting** - Backpressure system with OpenAI/Google Vision capacity management
- [x] **Healthcare Compliance** - Service role security and audit logging functional
- [x] **File Processing Pipeline** - Upload → Storage → Job Queue → Worker claiming operational

**Key Implementation Insights:**
- Hybrid architecture eliminates clinical safety risks from multi-file uploads
- Semantic narratives provide clinically coherent medical storylines  
- Dual-lens system accommodates both document-minded and clinical-minded users
- Progressive enhancement ensures system always remains functional

### ✅ **COMPLETED: Clinical Journeys Vision**

- [x] **Patient-Scoped Architecture** - Framework for cross-document clinical journeys designed
- [x] **Journey Detection Engine** - AI system for longitudinal healthcare narrative creation
- [x] **Timeline Evolution Strategy** - Path from document events to meaningful care stories
- [x] **Healthcare Provider Integration** - Journey-aware clinical decision support architecture

### 🚧 **CRITICAL: AI MODEL INTEGRATION REQUIRED**

**Operational Infrastructure (Ready):**
- ✅ V3 worker polling jobs with `claim_next_job_v3()`
- ✅ File upload creating jobs via `shell-file-processor-v3`
- ✅ Job heartbeat monitoring and completion tracking
- ✅ API capacity management for rate limiting

**Missing AI Processing Logic (Urgent):**
- ❌ OpenAI GPT-4 API integration (env var unused)
- ❌ Google Cloud Vision OCR (env var unused)
- ❌ Three-pass processing implementation
- ❌ Clinical data extraction to V3 tables
- ❌ Semantic narrative creation

**Current Worker Status:** Simulation mode only - no actual AI processing

---

## Architecture Decisions

### Confirmed Decisions
1. **Three-Pass AI Architecture** - Pass 1 entity detection, Pass 2 clinical enrichment, Pass 3 semantic narratives
2. **Hybrid Document System** - Shell files (physical) + clinical narratives (semantic) dual architecture
3. **Progressive Enhancement** - System functional after Pass 2, enhanced after Pass 3
4. **Dual-Lens User Experience** - Document view + narrative view with user choice
5. **Clinical Safety Priority** - Prevents dangerous multi-document context mixing
6. **Graceful Degradation** - Shell file fallback ensures system always functional
7. **Russian Babushka Doll Context** - Multi-layered clinical context from timeline to specialized tables

### Implementation Strategy
1. **Hybrid Migration Approach** - Replace primitive document intelligence with semantic architecture
2. **System Resilience** - No single point of failure, always maintains core functionality
3. **User Choice Preservation** - Both document-minded and clinical-minded user preferences supported
4. **Future Scalability** - Foundation for patient-scoped clinical journeys across documents

---

## Semantic Architecture Overview

**Shell Files (Physical Layer):**
- Actual uploaded files with extracted data and metadata
- AI synthesized summaries of all contained narratives.
- Always reliable reference point for clinical data

**Clinical Narratives (Semantic Layer):**
- AI-determined medical storylines based on clinical meaning
- Can span non-contiguous pages within documents
- Clinically coherent summaries (e.g., "Hypertension Management Journey")
- Optional enhancement - system works without them

**Processing Flow:**
```
Pass 1: Shell file → Entity detection with location data
Pass 2: Entities → Clinical events → Database (fully functional)
Pass 3: Clinical events → Semantic narratives (enhancement layer)
```

---

## Next Immediate Action

**CRITICAL PRIORITY:** Implement AI processing logic in operational worker

**Infrastructure Ready - AI Integration Required:**
1. **URGENT:** Add OpenAI API integration to `worker.ts:204-238` (`processShellFile` method)
2. **URGENT:** Add Google Cloud Vision OCR for text extraction with spatial coordinates
3. **URGENT:** Implement clinical data extraction to V3 database tables
4. **HIGH:** Add three-pass AI processing logic (Pass 1→2→3 pipeline)
5. **HIGH:** Connect semantic narrative creation to existing `shell_files` table

**Worker File Location:** `shared/docs/architecture/database-foundation-v3/current_workers/exora-v3-worker/src/worker.ts`

**Current Status:** Worker is polling and claiming jobs successfully, but `processShellFile()` contains only simulation code

## Key Documents

- **[07-semantic-document-architecture.md](v3-pipeline-planning/07-semantic-document-architecture.md)** - Complete shell file + clinical narratives architecture
- **[08-clinical-journeys-architecture.md](v3-pipeline-planning/08-clinical-journeys-architecture.md)** - Future patient-scoped journey evolution
- **[00-pipeline-overview.md](v3-pipeline-planning/00-pipeline-overview.md)** - Complete three-pass pipeline architecture

---

*This V3 approach implements semantic document architecture with hybrid clinical narratives, delivering a clinically safe, user-choice-driven, and future-scalable healthcare AI system that prevents dangerous multi-document context mixing while maintaining system resilience.*