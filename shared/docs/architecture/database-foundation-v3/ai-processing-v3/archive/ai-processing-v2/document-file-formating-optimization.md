Here's a comprehensive markdown file for Claude Code to implement the intelligent document rendering strategy:

```markdown
# Intelligent Document Rendering Strategy
## Architecture Decision Record (ADR-001)

### Status
Proposed - Ready for Implementation

### Context
The healthcare document processing pipeline must handle diverse file formats (DOCX, PDF, HEIC, etc.) with high reliability. Previous approaches using format-specific parsers resulted in frequent failures due to corrupted files, unsupported features, and edge cases. A universal rendering approach was considered but rejected due to performance and cost implications.

### Decision
Implement an **Intelligent Routing System** that:
1. Attempts direct extraction for well-formed documents (fast path)
2. Falls back to rendering for problematic formats (safety net)
3. Learns from failures to optimize routing decisions

### Implementation Requirements

## 1. Format Detection and Classification

Create a new module at `src/services/document-processing/format-detector.ts`:

```typescript
interface FormatAnalysis {
  format: 'pdf' | 'docx' | 'xlsx' | 'png' | 'jpeg' | 'heic' | 'unknown';
  hasTextLayer: boolean;
  hasComplexObjects: boolean;
  requiresRendering: boolean;
  confidence: number;
  processingStrategy: 'direct' | 'render' | 'hybrid';
}
```

The detector must:
- Check file signatures (magic bytes)
- Analyze PDF text layers using pdf-parse
- Detect complex Office objects (charts, embedded files)
- Return processing recommendations

## 2. Processing Router

Update `src/services/document-processing/pipeline-orchestrator.ts`:

```typescript
class DocumentRouter {
  async route(document: UploadedDocument): Promise<ProcessingPath> {
    const analysis = await this.formatDetector.analyze(document);
    
    // Fast path for clean documents
    if (analysis.processingStrategy === 'direct') {
      const result = await this.tryDirectExtraction(document);
      if (result.confidence > 0.85) {
        return { path: 'direct', result };
      }
    }
    
    // Rendering fallback
    return { 
      path: 'rendered',
      result: await this.renderAndExtract(document)
    };
  }
}
```

## 3. Rendering Service

Create `src/services/document-processing/rendering-service.ts`:

### Core Requirements:
- Use Puppeteer for DOCX/XLSX rendering via HTML conversion
- Use pdf-to-png for PDF rendering
- Use Sharp for image format conversions
- Output: 300 DPI PNG images

### Performance Constraints:
- Maximum 30 seconds per document
- Memory limit: 2GB per rendering job
- Concurrent renders: 5 maximum

## 4. Failure Monitoring

Create `src/services/monitoring/processing-metrics.ts`:

Track and store:
- Format-specific failure rates
- Processing times per strategy
- Error types and patterns
- Memory/CPU usage

Store metrics in database table `document_processing_metrics`:
```sql
CREATE TABLE document_processing_metrics (
  id UUID PRIMARY KEY,
  document_id UUID,
  format VARCHAR(20),
  processing_strategy VARCHAR(20),
  success BOOLEAN,
  processing_time_ms INTEGER,
  error_type VARCHAR(100),
  error_message TEXT,
  confidence_score DECIMAL(3,2),
  created_at TIMESTAMP
);
```

## 5. Storage Strategy

Update storage configuration in `src/config/storage.ts`:

```typescript
const storageConfig = {
  originals: {
    bucket: 'medical-docs-originals',
    path: '{userId}/{documentId}/original.{ext}',
    retention: '7 years'  // HIPAA requirement
  },
  rendered: {
    bucket: 'medical-docs-processed',
    path: '{userId}/{documentId}/page-{pageNum}.png',
    retention: '90 days'  // Cache only
  }
};
```

## 6. API Endpoints

Update `src/api/documents/upload.ts`:

```typescript
POST /api/documents/upload
Request: multipart/form-data with file
Response: {
  documentId: string,
  status: 'processing',
  processingStrategy: 'direct' | 'render',
  estimatedTime: number
}

GET /api/documents/{id}/status
Response: {
  status: 'completed' | 'processing' | 'failed',
  processingPath: 'direct' | 'rendered',
  pageCount: number,
  extractedText: string,
  confidence: number
}
```

## 7. Configuration Updates

Add to `.env`:
```bash
# Rendering Configuration
RENDERING_ENABLED=true
RENDERING_MAX_PAGES=100
RENDERING_TIMEOUT_MS=30000
RENDERING_DPI=300

# Processing Strategy
DIRECT_EXTRACTION_CONFIDENCE_THRESHOLD=0.85
AUTO_RENDER_FORMATS=heic,avif,webp
ALWAYS_DIRECT_FORMATS=csv,json,xml,txt
```

## 8. Database Schema Updates

Add columns to `documents` table:
```sql
ALTER TABLE documents ADD COLUMN processing_strategy VARCHAR(20);
ALTER TABLE documents ADD COLUMN rendering_required BOOLEAN DEFAULT FALSE;
ALTER TABLE documents ADD COLUMN original_format VARCHAR(20);
ALTER TABLE documents ADD COLUMN rendered_at TIMESTAMP;
ALTER TABLE documents ADD COLUMN extraction_confidence DECIMAL(3,2);
```

## 9. Performance Targets

- Clean PDF text extraction: < 500ms
- Simple image processing: < 1 second
- Complex DOCX rendering: < 3 seconds per page
- Overall pipeline (10 pages): < 15 seconds

## 10. Error Handling

Implement cascading fallbacks:
1. Try direct extraction
2. If fails or low confidence -> Try rendering
3. If rendering fails -> Mark for manual review
4. Log all attempts for pattern analysis

## 11. Cost Optimization Rules

Automatic rendering triggers:
- HEIC/AVIF/WebP formats (always)
- PDFs without text layer
- Office docs with embedded objects
- Any document that failed direct extraction
- Sources with >20% historical failure rate

Skip rendering for:
- Clean text PDFs (with >95% extraction confidence)
- Standard images (PNG, JPEG)
- Structured data (CSV, JSON, XML)
- Documents < 100KB text-only

## 12. Files to Update

**Priority 1 - Core Pipeline:**
- `/src/services/document-processing/pipeline-orchestrator.ts` - Add routing logic
- `/src/services/document-processing/format-detector.ts` - Create new
- `/src/services/document-processing/rendering-service.ts` - Create new
- `/src/services/document-processing/extraction-service.ts` - Update to handle both paths

**Priority 2 - Infrastructure:**
- `/infrastructure/docker-compose.yml` - Add Puppeteer container
- `/infrastructure/terraform/compute.tf` - Add rendering service resources
- `/src/config/storage.ts` - Add rendered document buckets

**Priority 3 - Documentation:**
- `/docs/architecture/ai-processing-v2/03-extraction-pipeline/README.md` - Update flow
- `/docs/architecture/ai-processing-v2/draft-ai-processing-pipeline-flow.md` - Update diagram
- `/docs/api/documents.md` - Document new endpoints

**Priority 4 - Monitoring:**
- `/src/services/monitoring/processing-metrics.ts` - Create new
- `/src/services/monitoring/dashboards/document-processing.json` - Add metrics

## 13. Testing Requirements

Create tests for:
- Format detection accuracy
- Routing decision logic
- Rendering quality validation
- Fallback cascade behavior
- Performance benchmarks
- Cost tracking

## 14. Rollout Plan

Phase 1 (Week 1): Deploy format detection without rendering
Phase 2 (Week 2): Enable rendering for HEIC/AVIF only
Phase 3 (Week 3): Enable intelligent routing for PDFs
Phase 4 (Week 4): Full rollout with monitoring

## 15. Success Metrics

- Processing success rate > 99.5%
- Average processing time < 5 seconds
- Rendering fallback rate < 30%
- Cost per document < $0.02
- Zero data loss incidents

---

## Instructions for Claude Code

1. **Read this entire document first** to understand the architectural decision
2. **Update the pipeline orchestrator** to implement the intelligent routing logic
3. **Create the new services** (format-detector, rendering-service, processing-metrics)
4. **Update the database schema** with the new columns
5. **Modify the API endpoints** to support the new processing strategies
6. **Update all documentation** to reflect the dual-path approach
7. **Do NOT implement universal rendering** - only render when necessary
8. **Preserve the fast path** for clean documents

Key principle: Optimize for the common case (clean documents) while maintaining a robust fallback (rendering) for edge cases.
```

This markdown file provides Claude Code with complete context and specific implementation instructions. It clearly rejects universal rendering in favor of intelligent routing, includes all necessary technical details, and provides a clear implementation path.