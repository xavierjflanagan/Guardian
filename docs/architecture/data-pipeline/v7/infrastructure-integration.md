# Guardian v7 Infrastructure Integration Guide

**Status:** Active  
**Date:** 2025-01-31  
**Version:** 1.0  

---

## Overview

This document describes how Guardian v7's modular architecture integrates with the new hybrid infrastructure approach (Supabase Core + Render Compute). It serves as a bridge between the v7 data architecture and the infrastructure decision in ADR-0002.

## Architecture Alignment

### v7 Modules → Infrastructure Mapping

| v7 Module | Supabase Components | Render Components |
|-----------|-------------------|-------------------|
| **Core Schema** | PostgreSQL tables, RLS policies | - |
| **Multi-Profile Management** | Auth, user tables, profile switching | Profile aggregation APIs |
| **Healthcare Journey** | Timeline tables, real-time subscriptions | Journey compilation service |
| **Document Processing** | Storage buckets, queue table | AI processing workers |
| **Provider Portal** | Auth roles, access tables | Provider API endpoints |
| **Clinical Decision Support** | Rules tables, triggers | Decision engine service |
| **FHIR Integration** | FHIR resource tables | FHIR transformation service |

## Processing Pipeline Architecture

### Current v7 Pipeline (Edge Functions)
```
Upload → Edge Function → AI Processing → Database
         (150-400s limit)
```

### New Hybrid Pipeline
```
Upload → Edge Function → Queue → Render Worker → Database
         (quick ACK)     (DB)    (unlimited time)
```

## Implementation Changes

### 1. Document Processing Updates

**Current (Edge Function):**
```typescript
// supabase/functions/document-processor/index.ts
export async function processDocument(docId: string) {
  // Limited to 400s execution time
  const visionResult = await callGoogleVision(...)
  const aiResult = await callOpenAI(...)
  await updateDatabase(...)
}
```

**New (Hybrid):**
```typescript
// Edge Function - Quick acknowledgment
export async function enqueueDocument(docId: string) {
  await supabase.from('job_queue').insert({
    type: 'process_document',
    payload: { document_id: docId },
    status: 'pending'
  })
  return { queued: true }
}

// Render Worker - Unlimited processing
export async function processDocumentWorker() {
  const job = await pollQueue('process_document')
  // Can run for hours if needed
  const visionResult = await callGoogleVision(...)
  const aiResult = await callOpenAI(...)
  await updateDatabase(...)
}
```

### 2. Healthcare Journey Compilation

**Supabase Edge Function:**
- Quick timeline queries
- Real-time subscription setup
- Basic filtering

**Render Service:**
- Complex journey aggregation
- Multi-profile compilation
- AI-powered insights generation
- Trend analysis across years of data

### 3. FHIR Transformations

**Supabase:**
- Store FHIR resources in JSONB
- Basic validation via constraints

**Render:**
- Complex FHIR transformations
- Bulk import/export operations
- Validation against profiles
- Terminology service integration

## Database Schema Additions

Add job queue table to v7 schema:

```sql
-- Add to existing v7 schema
CREATE TABLE job_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL,
  payload JSONB NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  priority INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  error TEXT,
  result JSONB,
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3
);

-- Indexes for efficient polling
CREATE INDEX idx_queue_status_priority ON job_queue(status, priority DESC, created_at);
CREATE INDEX idx_queue_type_status ON job_queue(type, status);

-- RLS policies
ALTER TABLE job_queue ENABLE ROW LEVEL SECURITY;

-- Only service role can access queue
CREATE POLICY "Service role full access" ON job_queue
  FOR ALL USING (auth.jwt()->>'role' = 'service_role');
```

## API Endpoint Distribution

### Supabase Edge Functions (Fast Operations)
- `/auth/*` - All authentication
- `/profiles/*` - Profile CRUD
- `/documents/upload` - Initial upload handling
- `/realtime/*` - WebSocket subscriptions
- `/quick-search` - Fast document search

### Render APIs (Complex Operations)
- `/api/process-document` - Full AI pipeline
- `/api/healthcare-journey` - Complex timeline generation
- `/api/fhir/*` - FHIR transformations
- `/api/reports/*` - Multi-document reports
- `/api/sync/*` - External system sync
- `/api/ml/*` - Machine learning operations

## Cron Job Distribution

### Supabase (pg_cron)
```sql
-- Database maintenance
SELECT cron.schedule('cleanup-old-sessions', '0 2 * * *', 
  'DELETE FROM auth.sessions WHERE created_at < NOW() - INTERVAL ''30 days''');

-- Quick status updates
SELECT cron.schedule('mark-stale-jobs', '*/5 * * * *',
  'UPDATE job_queue SET status = ''failed'' WHERE status = ''processing'' AND started_at < NOW() - INTERVAL ''1 hour''');
```

### Render Cron
```typescript
// render-cron.ts
schedule.scheduleJob('0 */6 * * *', async () => {
  // Email ingestion
  await processIncomingEmails()
  
  // My Health Record sync
  await syncMyHealthRecords()
  
  // Document re-analysis for updates
  await reanalyzeOldDocuments()
})
```

## Mobile App Integration

### Supabase SDK Usage
```typescript
// Direct Supabase access for core features
const { data: profiles } = await supabase
  .from('profiles')
  .select('*')
  
// Real-time subscriptions
supabase
  .channel('documents')
  .on('postgres_changes', { 
    event: 'INSERT', 
    schema: 'public', 
    table: 'documents' 
  }, handleNewDocument)
  .subscribe()
```

### Render API Usage
```typescript
// Complex operations via Render
const journeyData = await fetch(`${RENDER_API}/api/healthcare-journey`, {
  headers: { Authorization: `Bearer ${session.access_token}` }
}).then(r => r.json())
```

## Security Considerations

1. **Inter-Service Auth**: Render uses Supabase service role key
2. **API Gateway**: Consider adding Kong/Tyk in front of Render
3. **Rate Limiting**: Implement on both Supabase and Render
4. **Audit Trail**: All Render operations logged to Supabase

## Monitoring Strategy

- **Supabase Dashboard**: DB performance, auth metrics
- **Render Dashboard**: API latency, worker queue depth
- **Custom Dashboard**: Unified view of both systems
- **Alerts**: Set up for queue backlog, processing failures

## Migration Path

1. **Week 1**: Deploy Render infrastructure
2. **Week 2**: Move document processing to Render
3. **Week 3**: Migrate complex APIs
4. **Week 4**: Set up monitoring and optimization

## Cost Implications

- **Supabase Pro**: $25/mo (required for production)
- **Render Individual**: $19/mo (background workers)
- **Total Infrastructure**: ~$44/mo + AI API costs
- **Scaling**: Both platforms scale independently

## Related Documents

- [ADR-0002: Hybrid Infrastructure](../../adr/0002-hybrid-infrastructure-supabase-render.md)
- [v7 Architecture Overview](./README.md)
- [Implementation Guide](../implementation-guides/v7-implementation.md)