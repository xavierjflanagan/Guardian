# Database Migration History

## Overview

This directory contains all database schema migrations for the Exora Guardian V3 healthcare platform. Each migration is a SQL file that documents database changes with complete audit trails.

## Two-Touchpoint Migration Workflow

Database migrations follow a structured two-touchpoint process for safety and completeness:

### Touchpoint 1: Research + Create Script
**AI Actions (single response):**
1. Research what needs to change and impact analysis
2. Identify which `current_schema/*.sql` files need updates (with line numbers)
3. Create complete migration script in `migration_history/`
4. Present script for human review + second AI bot review

**Output:** Migration script ready for review with complete impact summary

### Touchpoint 2: Execute + Finalize (after review approval)
**AI Actions (single response):**
1. Apply any feedback from human + second AI bot review
2. Execute migration via `mcp__supabase__apply_migration()`
3. Update source of truth: `current_schema/*.sql` files
4. Update downstream files:
   - Bridge schemas (`bridge-schemas/source/*.md`)
   - Detailed schemas (`bridge-schemas/detailed/*.json`)
   - Minimal schemas (`bridge-schemas/minimal/*.json`)
   - Worker TypeScript files (if applicable)
   - Type definitions (if applicable)
5. Mark migration header complete with execution date and checkboxes

**Output:** Migration executed, all files updated, complete audit trail

## Migration Procedure (Detailed)

### 1. Create Migration Script

Create a new migration file following the naming convention:
```
YYYY-MM-DD_NN_descriptive_name.sql
```

Example: `2025-10-08_18_add_processing_time_minutes.sql`

### 2. Migration Script Template

Each migration must include:

```sql
-- ============================================================================
-- Migration: [Descriptive Title]
-- Date: YYYY-MM-DD
-- Issue: [Problem being solved]
--
-- PROBLEM:
--   [Detailed explanation of the issue]
--
-- SOLUTION:
--   [Description of the fix]
--
-- AFFECTED TABLES:
--   - table_name_1
--   - table_name_2
--
-- SOURCE OF TRUTH SCHEMA UPDATED:
--   [ ] current_schema/XX_filename.sql
--      - Line XXX: Description of change
--
-- SCHEMA DOCUMENTATION UPDATED:
--   [ ] bridge-schemas/source/path/to/schema.md
--   [ ] bridge-schemas/detailed/path/to/schema.json
--   [ ] bridge-schemas/minimal/path/to/schema.json
--
-- MIGRATION STRATEGY:
--   [Single-step, multi-phase, etc.]
-- ============================================================================

-- Migration SQL here

-- ============================================================================
-- Verification Query
-- ============================================================================
-- [Optional verification queries]

-- ============================================================================
-- Rollback Script (If Needed)
-- ============================================================================
/*
[Rollback SQL]
*/
```

### 3. Review Process

Before execution:
1. Review SQL for correctness and safety
2. Check for idempotency (use `IF NOT EXISTS`, `IF EXISTS`, etc.)
3. Consider locking and performance impact
4. Verify rollback script is included

### 4. Execute Migration

Using Supabase MCP (recommended):
```typescript
// Claude Code can execute via MCP
mcp__supabase__apply_migration(name, query)
```

Or via Supabase SQL Editor:
1. Copy migration SQL
2. Paste into Supabase Dashboard SQL Editor
3. Execute and verify results

### 5. Update Source of Truth

After successful execution:

1. Update `current_schema/` files with the new schema
2. Update bridge schemas if applicable:
   - `bridge-schemas/source/*.md`
   - `bridge-schemas/detailed/*.json`
   - `bridge-schemas/minimal/*.json`

### 6. Update Migration Header

Mark completed items in the migration script:
```sql
-- SOURCE OF TRUTH SCHEMA UPDATED:
--   [X] current_schema/08_job_coordination.sql  -- Changed from [ ]
--      - Line 228: Added processing_time_minutes
--
-- MIGRATION EXECUTED:
--   [X] Applied to Supabase on 2025-10-08
--   [X] Verified with production data
```

## Directory Structure

```
migration_history/
├── README.md (this file)
├── 2025-09-03_00_add_heartbeat_index.sql
├── 2025-09-25_01_universal_date_format_management.sql
├── 2025-10-08_15_add_token_breakdown_to_metrics_tables.sql
└── ... (sequential migrations)
```

## Source of Truth Location

The canonical schema definitions live in:
```
shared/docs/architecture/database-foundation-v3/current_schema/
├── 01_foundations.sql
├── 02_profiles.sql
├── 03_clinical_core.sql
├── 04_ai_processing.sql
├── 05_healthcare_journey.sql
├── 06_security.sql
├── 07_optimization.sql
└── 08_job_coordination.sql
```

## Best Practices

### Idempotency
Always make migrations idempotent:
```sql
-- Good
ALTER TABLE foo ADD COLUMN IF NOT EXISTS bar TEXT;

-- Bad
ALTER TABLE foo ADD COLUMN bar TEXT; -- Fails on re-run
```

### Locking Considerations
- `ALTER TABLE` takes AccessExclusive lock
- `STORED` generated columns trigger table rewrite
- Run during low-traffic windows for large tables

### Documentation
- DONT EVER USE EMOJIS.
- Document the "why" not just the "what"
- Include verification queries
- Always provide rollback script
- Update all checkboxes after completion

### Security
- Use `IF EXISTS` checks for conditional operations
- Avoid destructive operations without explicit confirmation
- Test migrations on staging/dev before production

## Migration Checklist

Before marking a migration complete, ensure:

- [ ] Migration script created with proper naming
- [ ] Problem and solution documented in header
- [ ] SQL tested for correctness and idempotency
- [ ] Migration executed successfully
- [ ] Verification query confirms expected result
- [ ] Source of truth schemas updated
- [ ] Bridge schemas updated (if applicable)
- [ ] Migration header marked complete
- [ ] Rollback script tested (if applicable)

## Questions?

See examples in this directory or consult:
- Migration 15: Token breakdown (comprehensive multi-phase migration)
- Migration 18: Processing time minutes (simple generated column)
