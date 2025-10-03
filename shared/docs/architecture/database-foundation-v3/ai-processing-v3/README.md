# AI Processing V3: Complete Architecture & Implementation Guide

**Status:** Pass 1 Complete, Pass 2/3 Pending
**Updated:** 3 October 2025
**Current State:** Pass 1 entity detection implemented and ready for testing

---

## Quick Navigation

**If you're looking for:**
- **Pass 1 Implementation:** See [Pass 1 Architecture](#pass-1-entity-detection-implemented) below
- **Current Status:** See [Implementation Status](#implementation-status)
- **File Locations:** See [File Structure](#complete-file-structure)
- **Testing Guide:** See [Getting Started](#getting-started-testing-pass-1)
- **Architecture Docs:** See folders in this directory

---

## Implementation Status

### ✅ **Pass 1: Entity Detection (COMPLETE)**
**Status:** Code complete, build successful, testing pending
**Location:** `apps/render-worker/src/pass1/` (2,395 lines TypeScript)
**Completion Date:** October 3, 2025

**What's Implemented:**
- ✅ GPT-4o Vision API integration
- ✅ Dual-input processing (Vision + OCR cross-validation)
- ✅ Three-category entity classification system
- ✅ All 7 database tables integrated
- ✅ Worker job handler complete
- ✅ Build successful

**What's Needed:**
- ⏳ OCR integration (Google Cloud Vision)
- ⏳ Upload flow modification to create Pass 1 jobs
- ⏳ End-to-end testing
- ⏳ Database table verification

### ⏳ **Pass 2: Clinical Enrichment (PENDING)**
**Status:** Bridge schemas complete, implementation not started
**Location:** Planning docs in `implementation-planning/pass-2-clinical-enrichment/`

### ⏳ **Pass 3: Semantic Narratives (PENDING)**
**Status:** Architecture planned, implementation not started
**Location:** Planning docs in `v3-pipeline-planning/`

---

## Architecture Overview

### **Three-Pass Processing Pipeline**

Exora uses a three-pass AI processing architecture for cost-optimized, accurate medical document analysis:

```
┌─────────────────────────────────────────────────────────────────┐
│                     UPLOAD & STORAGE                            │
│  User uploads → Supabase Storage → shell_files table            │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                  PASS 1: Entity Detection                        │
│  AI Model: GPT-4o Vision                                        │
│  Cost: ~$0.015-0.05/document                                    │
│  Input: Raw image + OCR spatial data                            │
│  Output: Classified entities (3 categories)                     │
│  Database: 7 tables (audit, metrics, classification)            │
│  Time: 1-3 seconds                                              │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│               PASS 2: Clinical Enrichment                       │
│  AI Model: GPT-4 (high accuracy)                                │
│  Cost: Variable based on Pass 1 results                         │
│  Input: Pass 1 entities + bridge schemas                        │
│  Output: Structured clinical data                               │
│  Database: 13+ clinical tables                                  │
│  Status: NOT YET IMPLEMENTED                                    │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│              PASS 3: Semantic Narratives                        │
│  AI Model: GPT-4                                                │
│  Cost: Minimal (processes structured data, not raw text)        │
│  Input: Pass 2 clinical data                                    │
│  Output: Clinical storylines and timelines                      │
│  Status: NOT YET IMPLEMENTED                                    │
└─────────────────────────────────────────────────────────────────┘
```

---

## Pass 1: Entity Detection (IMPLEMENTED)

### **Purpose**
Classify every piece of document content into processing categories to optimize Pass 2 workload and cost.

### **Three-Category Classification System**

**1. Clinical Events** (Full Pass 2 enrichment)
- Vital signs, lab results, medications, procedures
- Diagnoses, allergies, symptoms, clinical findings
- **Processing:** Full AI analysis + timeline integration
- **Cost Impact:** Highest value data

**2. Healthcare Context** (Limited Pass 2 enrichment)
- Patient identifiers, provider info, facility details
- Appointments, referrals, insurance, billing codes
- **Processing:** Profile matching + contextual schemas
- **Cost Impact:** Medium value data

**3. Document Structure** (Logging only - no Pass 2)
- Headers, footers, logos, page markers
- Signatures, watermarks, form structure
- **Processing:** Identification and audit logging only
- **Cost Impact:** Minimal (no AI processing)

### **Dual-Input Architecture**

Pass 1 uses **two data sources** for maximum accuracy:

**PRIMARY:** GPT-4o Vision analyzing raw document image
- Visual context interpretation
- Formatting and layout understanding
- Handwriting and complex elements

**SECONDARY:** OCR spatial data for cross-validation
- Google Cloud Vision API
- Spatial coordinates for click-to-zoom
- Text confidence scores

**Benefits:**
- AI-OCR agreement scoring
- Discrepancy detection
- Higher accuracy than OCR or Vision alone

### **Database Integration (7 Tables)**

Pass 1 writes to 7 database tables:

1. **entity_processing_audit** - All detected entities with metadata (bulk INSERT)
2. **ai_processing_sessions** - Session coordination across passes (INSERT)
3. **shell_files** - Update with Pass 1 completion status (UPDATE)
4. **profile_classification_audit** - Patient safety validation (INSERT)
5. **pass1_entity_metrics** - Performance and quality metrics (INSERT)
6. **ai_confidence_scoring** - Confidence scores for quality tracking (INSERT)
7. **manual_review_queue** - Low-confidence entities flagged for review (INSERT)

### **Implementation Files**

```
apps/render-worker/src/pass1/
├── Pass1EntityDetector.ts       (431 lines) - Main detection class
├── pass1-types.ts               (471 lines) - TypeScript interfaces
├── pass1-prompts.ts             (334 lines) - AI prompt templates
├── pass1-schema-mapping.ts      (335 lines) - Entity → schema mappings
├── pass1-translation.ts         (361 lines) - AI → database translation
├── pass1-database-builder.ts    (388 lines) - 7-table record builder
└── index.ts                     (75 lines)  - Public exports

Total: 2,395 lines of TypeScript
```

### **Worker Integration**

Pass 1 is integrated into the Render.com worker:

```typescript
// apps/render-worker/src/worker.ts

case 'pass1_entity_detection':
  result = await this.processPass1EntityDetection(job);
  break;
```

**Job Payload Format:**
```typescript
{
  shell_file_id: string;
  patient_id: string;
  processing_session_id: string;
  raw_file: {
    file_data: string;      // Base64 encoded
    file_type: string;
    filename: string;
    file_size: number;
  };
  ocr_spatial_data: {
    extracted_text: string;
    spatial_mapping: Array<{
      text: string;
      page_number: number;
      bounding_box: { x, y, width, height };
      confidence: number;
    }>;
    ocr_confidence: number;
    ocr_provider: string;
  };
  document_metadata: {
    filename: string;
    file_type: string;
    page_count: number;
    patient_id: string;
    upload_timestamp: string;
  };
}
```

---

## Current Upload Flow vs Pass 1 Flow

### **Current Flow (V3 - August 2025)**

```
1. User uploads file → Supabase Storage
2. Edge Function (shell-file-processor-v3) creates:
   - shell_files record
   - job_queue with job_type='shell_file_processing'
3. Worker claims job
4. Worker processShellFile() - JUST A TODO STUB
   - sleep(2000) simulation
   - Updates shell_files to 'completed'
   - No actual processing!
```

**Status:** Upload infrastructure works, but processing is placeholder only.

### **Pass 1 Flow (NEW - October 2025)**

```
1. User uploads file → Supabase Storage
2. Edge Function creates shell_files record
3. OCR Processing (NEEDS INTEGRATION):
   - Google Cloud Vision API
   - Extract text + spatial coordinates
4. Edge Function creates job_queue:
   - job_type='pass1_entity_detection'
   - Includes raw file + OCR data
5. Worker claims job
6. Worker calls Pass1EntityDetector:
   - GPT-4o Vision analysis
   - Entity classification
   - Database writes (7 tables)
7. Pass 1 complete → Ready for Pass 2
```

**Status:** Implementation complete, OCR integration needed, upload flow modification needed.

---

## Bridge Schema Architecture

### **What Are Bridge Schemas?**

Bridge schemas define the **database extraction requirements** for AI models. They specify:
- What fields to extract from documents
- How to structure data for database insertion
- Required vs optional fields
- Validation rules

### **Three-Tier System**

Each database table has **three versions** of its bridge schema:

1. **Source (`.md`)** - Human-readable documentation
   - Location: `bridge-schema-architecture/bridge-schemas/source/`
   - Purpose: Developer reference
   - Format: Markdown with examples

2. **Detailed (`.json`)** - Complete AI specifications
   - Location: `bridge-schema-architecture/bridge-schemas/detailed/`
   - Purpose: Full AI prompt inclusion
   - Format: JSON with descriptions, rules, examples

3. **Minimal (`.json`)** - Token-optimized specifications
   - Location: `bridge-schema-architecture/bridge-schemas/minimal/`
   - Purpose: Cost-optimized AI prompts
   - Format: Compact JSON, essential fields only

### **Pass 1 vs Pass 2 Usage**

**Pass 1 Bridge Schemas (7 tables):**
- **NOT sent to AI**
- Used as documentation for TypeScript code
- Define OUTPUT structure (what to write to DB)
- TypeScript code knows the schema, not AI

**Pass 2 Bridge Schemas (18 tables):**
- **WILL be sent to AI** (future implementation)
- Define INPUT structure (what AI should return)
- AI receives schema and returns structured data
- Dynamic schema loading based on Pass 1 results

**File Counts:**
- Pass 1: 7 schemas × 3 formats = 21 files
- Pass 2: 18 schemas × 3 formats = 54 files
- Total: 75 bridge schema files created

---

## Complete File Structure

### **Documentation (Source of Truth for Architecture)**

```
shared/docs/architecture/database-foundation-v3/
├── ai-processing-v3/                    ← YOU ARE HERE
│   ├── README.md                        ← This file
│   ├── bridge-schema-architecture/
│   │   ├── README.md                    ← Bridge schema guide
│   │   ├── BRIDGE_SCHEMA_BUILD_PROCESS.md
│   │   └── bridge-schemas/
│   │       ├── source/                  ← Human-readable docs
│   │       │   ├── pass-1/              (7 schemas)
│   │       │   └── pass-2/              (18 schemas)
│   │       ├── detailed/                ← AI prompt specs
│   │       │   ├── pass-1/              (7 JSON files)
│   │       │   └── pass-2/              (18 JSON files)
│   │       └── minimal/                 ← Token-optimized
│   │           ├── pass-1/              (7 JSON files)
│   │           └── pass-2/              (18 JSON files)
│   │
│   ├── implementation-planning/
│   │   └── pass-1-entity-detection/
│   │       ├── README.md                ← Pass 1 implementation guide
│   │       ├── PASS-1-ARCHITECTURE.md
│   │       ├── PASS-1-BRIDGE-SCHEMA-AND-PROMPTS.md
│   │       ├── PASS-1-WORKER-IMPLEMENTATION.md
│   │       └── archive/                 (2 outdated files)
│   │
│   └── v3-pipeline-planning/            ← Overall pipeline architecture
│
├── current_functions/                   ← Edge Function docs
│   ├── shell-file-processor-v3/
│   │   └── README.md
│   └── audit-logger-v3/
│       └── README.md
│
├── current_workers/                     ← Worker docs
│   ├── WORKER_ARCHITECTURE.md
│   └── render-com-deployment-guide.md
│
└── deployment/                          ← V3 deployment history
```

### **Implementation (Source of Truth for Code)**

```
Guardian-Cursor/
├── apps/
│   ├── web/                             ← Frontend (Next.js)
│   │   ├── app/
│   │   ├── components/
│   │   └── utils/
│   │       └── uploadFile.ts            ← Upload logic
│   │
│   └── render-worker/                   ← Background worker
│       ├── src/
│       │   ├── worker.ts                ← Main worker (job claiming)
│       │   └── pass1/                   ← Pass 1 implementation ✅
│       │       ├── Pass1EntityDetector.ts
│       │       ├── pass1-types.ts
│       │       ├── pass1-prompts.ts
│       │       ├── pass1-schema-mapping.ts
│       │       ├── pass1-translation.ts
│       │       ├── pass1-database-builder.ts
│       │       └── index.ts
│       ├── package.json
│       └── tsconfig.json
│
├── supabase/
│   └── functions/                       ← Edge Functions (Deno)
│       ├── _shared/                     ← Shared utilities
│       ├── shell-file-processor-v3/     ← Upload processor
│       └── audit-logger-v3/             ← Audit logging
│
├── shared/docs/                         ← Documentation (see above)
│
└── TODAYS_PLAN_2025-10-03.md           ← Daily work tracking
```

---

## Infrastructure Components

### **V3 Database (Supabase)**
- **Status:** ✅ Deployed (August 2025)
- **Tables:** 50+ tables including all Pass 1 tables
- **Functions:** `enqueue_job_v3`, `claim_next_job_v3`, `complete_job`, etc.
- **Location:** Supabase project (see deployment docs)

### **Render.com Worker**
- **Status:** ✅ Deployed (staging branch)
- **Service:** exora-v3-worker
- **Location:** apps/render-worker/
- **Environment:** NODE_ENV=production, APP_ENV=staging

### **Edge Functions (Supabase)**
- **Status:** ✅ Deployed
- **Functions:**
  - `shell-file-processor-v3` - Upload handling
  - `audit-logger-v3` - Audit logging
- **Location:** supabase/functions/

### **Job Queue System**
- **Status:** ✅ Operational
- **Tables:** job_queue
- **RPCs:** enqueue_job_v3, claim_next_job_v3, complete_job, update_job_heartbeat
- **Worker Polling:** Every 5 seconds

---

## Environment Variables Required

### **Render.com Worker**
```bash
# Core Infrastructure
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# AI Processing
OPENAI_API_KEY=sk-...                    # Required for Pass 1
GOOGLE_CLOUD_API_KEY=...                 # Required for OCR

# Worker Configuration
NODE_ENV=production                      # Always production
APP_ENV=staging                          # staging or production
WORKER_CONCURRENCY=50
WORKER_ID=render-${RENDER_SERVICE_ID}
HEALTH_CHECK_PORT=10000

# Enhanced Debugging (Staging)
LOG_LEVEL=debug
DEBUG=*
VERBOSE=true
```

### **Supabase Edge Functions**
```bash
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
SUPABASE_ANON_KEY=your_anon_key
```

---

## Getting Started: Testing Pass 1

### **Prerequisites Check**

1. **Verify Render.com Worker:**
```bash
# Check worker is running
curl https://exora-v3-worker.onrender.com:10000/health

# Check Render.com dashboard:
# - Service: exora-v3-worker
# - Status: Running
# - Branch: staging
```

2. **Verify Environment Variables:**
```bash
# In Render.com dashboard, verify:
# - OPENAI_API_KEY exists
# - GOOGLE_CLOUD_API_KEY exists (for future OCR)
# - SUPABASE_URL exists
# - SUPABASE_SERVICE_ROLE_KEY exists
```

3. **Verify Database Tables:**
```sql
-- Run in Supabase SQL Editor:
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name IN (
  'entity_processing_audit',
  'ai_processing_sessions',
  'shell_files',
  'profile_classification_audit',
  'pass1_entity_metrics',
  'ai_confidence_scoring',
  'manual_review_queue'
);

-- Should return all 7 tables
```

### **Option 1: Manual Test (Easiest First Test)**

Create a test job directly in the database:

```sql
-- Insert a manual Pass 1 test job
INSERT INTO job_queue (
  job_type,
  job_category,
  job_name,
  job_payload,
  priority,
  status
) VALUES (
  'pass1_entity_detection',
  'ai_processing',
  'Manual Pass 1 Test',
  '{
    "shell_file_id": "existing-shell-file-uuid",
    "patient_id": "existing-patient-uuid",
    "processing_session_id": "generate-new-uuid-here",
    "raw_file": {
      "file_data": "base64-encoded-image-data-here",
      "file_type": "image/jpeg",
      "filename": "test-medical-doc.jpg",
      "file_size": 50000
    },
    "ocr_spatial_data": {
      "extracted_text": "Sample medical text for testing",
      "spatial_mapping": [],
      "ocr_confidence": 0.95,
      "processing_time_ms": 1000,
      "ocr_provider": "manual_test"
    },
    "document_metadata": {
      "filename": "test-medical-doc.jpg",
      "file_type": "image/jpeg",
      "page_count": 1,
      "patient_id": "existing-patient-uuid",
      "upload_timestamp": "2025-10-03T12:00:00Z"
    }
  }'::jsonb,
  10,
  'pending'
) RETURNING id;

-- Worker should pick this up within 5 seconds
-- Monitor: SELECT * FROM job_queue WHERE id = 'returned-id';
```

### **Option 2: Full Upload Flow (After Integration)**

This requires completing Phase 5-6 first (OCR integration + upload flow modification).

---

## Blocking Issues Before Testing

### **Phase 4 Investigation (In Progress)**

**4.1: Upload Flow** ✅ COMPLETE
- Current: shell-file-processor-v3 creates `shell_file_processing` jobs
- Needed: Modify to create `pass1_entity_detection` jobs

**4.2: Render.com Status** ⏳ PENDING
- Verify worker is running
- Check environment variables

**4.3: Database Tables** ⏳ PENDING
- Verify all 7 Pass 1 tables exist
- Verify table structures match implementation

**4.4: Job Queue** ⏳ PENDING
- Verify `pass1_entity_detection` job type supported
- Verify job queue functions exist

### **Phase 5: OCR Integration** ⏳ PENDING
- Google Cloud Vision API integration
- OCR spatial data extraction
- Storage of OCR results with shell_file

### **Phase 6: Upload Flow Modification** ⏳ PENDING
- Modify shell-file-processor-v3 Edge Function
- Create `pass1_entity_detection` jobs instead of `shell_file_processing`
- Include OCR data in job payload

---

## Cost Analysis

### **Pass 1 Costs**

**GPT-4o Vision Pricing:**
- Input: $2.50 per 1M tokens
- Output: $10.00 per 1M tokens
- Image: ~$7.65 per 1M tokens (varies by size)

**Typical Document:**
- Vision tokens: ~2,000 (image)
- Input tokens: ~1,500 (OCR + prompts)
- Output tokens: ~500 (entity list)
- **Total cost: ~$0.015 - $0.05 per document**

**Google Cloud Vision OCR:**
- ~$1.50 per 1,000 documents
- **Cost per document: ~$0.0015**

**Combined Pass 1 Cost: ~$0.017 - $0.052 per document**

### **Comparison to Traditional Approaches**

**Traditional Full-Document AI:**
- Single GPT-4 call on entire document
- ~$0.25 - $0.50 per document
- **Exora savings: 85-90%**

---

## Next Steps

### **Immediate (Phase 4-6)**
1. Complete Render.com status check
2. Verify database tables exist
3. Integrate Google Cloud Vision OCR
4. Modify upload flow to create Pass 1 jobs
5. Run first end-to-end test

### **Short Term (Pass 2)**
1. Implement Pass 2 clinical enrichment
2. Load bridge schemas dynamically
3. Write to clinical tables
4. Test with real medical documents

### **Long Term (Pass 3)**
1. Implement semantic narrative generation
2. Create clinical storylines
3. Timeline integration
4. Full system testing

---

## Related Documentation

**Pass 1 Implementation:**
- [Pass 1 README](implementation-planning/pass-1-entity-detection/README.md)
- [Pass 1 Architecture](implementation-planning/pass-1-entity-detection/PASS-1-ARCHITECTURE.md)
- [Pass 1 Prompts](implementation-planning/pass-1-entity-detection/PASS-1-BRIDGE-SCHEMA-AND-PROMPTS.md)
- [Pass 1 Worker Implementation](implementation-planning/pass-1-entity-detection/PASS-1-WORKER-IMPLEMENTATION.md)

**Bridge Schemas:**
- [Bridge Schema Architecture](bridge-schema-architecture/README.md)
- [Bridge Schema Build Process](bridge-schema-architecture/BRIDGE_SCHEMA_BUILD_PROCESS.md)

**Infrastructure:**
- [Worker Architecture](../current_workers/WORKER_ARCHITECTURE.md)
- [Render.com Deployment Guide](../current_workers/render-com-deployment-guide.md)
- [V3 Phase 2 Implementation Plan](../v3-phase2-implementation-plan-v5.md)

**Edge Functions:**
- [shell-file-processor-v3](../current_functions/shell-file-processor-v3/README.md)
- [audit-logger-v3](../current_functions/audit-logger-v3/README.md)

---

**Last Updated:** October 3, 2025
**Maintained By:** Exora Health Development
**Status:** Pass 1 complete and ready for testing
