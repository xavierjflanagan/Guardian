# ADR 0002: Hybrid Infrastructure - Supabase Core + Render Compute

**Status:** Proposed  
**Date:** 2025-01-31  
**Owner:** Xavier Flanagan

## Context

Guardian (Exora) is evolving from a web-first MVP to a mobile-first production application. The current architecture uses Supabase for everything (DB, Auth, Storage, Edge Functions), but we're hitting limitations:

1. **Edge Function Time Limits**: 150s (free) / 400s (paid) insufficient for AI document processing
2. **Mobile-First Requirements**: Need robust background processing, email ingestion, scheduled syncs
3. **Complex AI Pipeline**: Multi-agent architecture requires orchestration beyond Edge Functions
4. **Background Jobs**: Cron tasks, queue processing, long-running operations needed
5. **Cost Optimization**: Current pipeline costs $16-31/1K docs, need to maintain efficiency

The solo developer constraint requires minimal DevOps overhead while supporting thousands of users.

## Options Considered

| Option | Pros | Cons |
|--------|------|------|
| 1. **Supabase-only** | Single service, integrated, low complexity | Edge Function limits, no true background jobs |
| 2. **Render-only** | Full backend control, any language, cron jobs | Need separate auth/storage/DB solutions |
| 3. **Hybrid: Supabase + Render** | Best of both, clear separation of concerns | Two services to manage |
| 4. **Firebase** | Great mobile SDKs, real-time | Poor SQL support for healthcare data |
| 5. **Railway** | Like Render but better PostgreSQL integration | Less mature than Render |
| 6. **Vercel + Serverless** | Great DX, edge computing | Still has time limits, complex for jobs |

## Decision

Choose **Hybrid Architecture: Supabase Core + Render Compute**

### Architecture Split:

**Supabase handles:**
- PostgreSQL database (all data, RLS policies)
- Authentication (works great with mobile SDKs)
- File storage (medical documents)
- Quick APIs via Edge Functions
- Real-time subscriptions
- Database-level cron (pg_cron)

**Render handles:**
- Complex API endpoints (no time limits)
- Document processing workers
- Background job queues
- Email ingestion cron
- My Health Record sync
- Long-running AI pipelines

### Rationale

1. **Separation of Concerns**: Supabase handles "solved problems", Render handles "complex compute"
2. **No Time Limits**: Render workers can run AI processing for hours if needed
3. **Mobile-First**: Supabase SDKs are production-ready for React Native/Expo
4. **Cost Effective**: ~$44/mo base infrastructure (Supabase Pro + Render Individual)
5. **Developer Experience**: TypeScript everywhere, shared types, minimal DevOps
6. **Scalability**: Can move logic between Edge Functions and Render as needed

## Implementation

### Phase 1: Core Infrastructure (Week 1)
- Keep existing Supabase setup
- Add queue table for job processing
- Update Edge Functions to enqueue vs process

### Phase 2: Render Compute (Week 2)
- Deploy TypeScript Node.js service
- Implement PostgreSQL queue polling
- Migrate document processing from Edge Functions
- Set up cron jobs

### Phase 3: Mobile Integration (Week 3-4)
- Supabase SDK in Expo app
- Offline-first architecture
- Real-time subscriptions

### Phase 4: Production (Week 5)
- Error handling, retries
- Monitoring (Sentry + Render)
- Performance optimization

## Consequences

### Positive
- Unlimited processing time for AI pipeline
- True background job support
- Better separation of concerns
- Can use Python for AI if needed later
- No vendor lock-in (standard PostgreSQL + Node.js)

### Negative
- Two services to monitor/manage
- Additional ~$19/mo for Render
- Need to implement queue polling
- Slightly more complex deployment

### Migration Path
- Existing Edge Functions continue working
- Gradually move complex operations to Render
- Database schema remains unchanged
- No breaking changes for current users

## Queue Architecture

Simple PostgreSQL-based queue in Supabase:

```sql
CREATE TABLE job_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL,
  payload JSONB NOT NULL,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  error TEXT,
  result JSONB
);

-- Indexes for efficient polling
CREATE INDEX idx_queue_status ON job_queue(status, created_at);
```

Render workers poll this table, no need for Redis/RabbitMQ.

## Monitoring Strategy

- Supabase Dashboard for DB/Auth metrics
- Render Dashboard for compute metrics
- Sentry for error tracking across both
- Custom health checks between services

## Security Considerations

- All inter-service communication via Supabase DB (RLS protected)
- Render accesses Supabase via service role key (env var)
- No direct internet exposure of Render workers
- API rate limiting on both platforms

## Related Documents

- `/docs/architecture/adr/0001-database-choice.md` - Original Supabase decision
- `/docs/architecture/data-pipeline/v7/README.md` - Current architecture
- `/docs/architecture/system-design.md` - High-level overview