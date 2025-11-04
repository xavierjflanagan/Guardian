# Database Migration History

## Overview

This directory contains all database schema migrations for the Exora Guardian V3 healthcare platform. Each migration is a SQL file that documents database changes with complete audit trails.

## Two-Touchpoint Migration Workflow

Database migrations follow a structured two-touchpoint process for safety and completeness:

### Touchpoint 1: Research + Create Script
**AI Actions (single response):**
1. **Verify current system behavior** (don't assume from documentation)
2. Research what needs to change and impact analysis
3. Identify which `current_schema/*.sql` files need updates (with line numbers)
4. Create complete migration script in `migration_history/`
5. Present script for human review + second AI bot review

**Output:** Migration script ready for review with complete impact summary

### Touchpoint 2: Execute + Finalize (after review approval)
**AI Actions (single response):**
1. Apply any feedback from human + second AI bot review
2. Execute migration via `mcp__supabase__apply_migration()`
3. Update source of truth: `current_schema/*.sql` files
4. Update downstream files (bridge schemas, TypeScript types if applicable)
5. Mark migration header complete with execution date and checkboxes

**Output:** Migration executed, all files updated, complete audit trail

## Post-Migration Success Strategies

### Pre-Migration Verification (Prevents 80% of post-deployment issues)
- **Verify RPC/API signatures** in actual system (don't assume from docs)
- **Check environment configs** match documentation reality  
- **Trace data types and constraints** end-to-end with real data
- **Map current system behavior** (avoid assumption-based development)

### Integration Testing Protocol  
- **Local testing** → **Staging integration** → **Production deployment**
- Test complete data flow with actual data types and constraints
- Validate error scenarios and edge cases before production

### Red Flags (Stop and verify first)
- "This should work..." → Test it with real data
- "Documentation says..." → Verify current system reality  
- "Same as before..." → Check for configuration drift

## Migration Procedure (Detailed)

### 1. Create Migration Script

Create a new migration file following the naming convention:
```
YYYY-MM-DD_NN_descriptive_name.sql
```

Example: `2025-10-08_18_add_processing_time_minutes.sql`

**CRITICAL: Sequential Numbering**

The `NN` number MUST follow sequential order. To determine the next number:

1. **List existing migrations** sorted by number:
   ```bash
   ls -1 migration_history/*.sql | sort
   ```

2. **Find the highest number** (e.g., `2025-11-03_37_add_ocr_raw_storage.sql` means last was 37)

3. **Use the next sequential number** (if last was 37, use 38; if last was 38, use 39)

4. **Current count**: As of 2025-11-04, the last migration is **38**. Next migration should be **39**.

**Why This Matters:**
- Sequential numbers create clear migration order
- Prevents conflicts when multiple developers work on migrations
- Makes it easy to identify missing migrations
- Supports automated migration tooling in the future

### 2. Migration Script Template

```sql
-- ============================================================================
-- Migration: [Descriptive Title]
-- Date: YYYY-MM-DD
-- Issue: [Problem being solved]
--
-- PROBLEM: [Brief explanation]
-- SOLUTION: [Description of the fix]  
-- AFFECTED TABLES: table_name_1, table_name_2
--
-- SOURCE OF TRUTH SCHEMA UPDATED:
--   [ ] current_schema/XX_filename.sql (Line XXX: Description)
--
-- DOWNSTREAM UPDATES:
--   [ ] Bridge schemas updated (if applicable)
--   [ ] TypeScript types updated (if applicable)
-- ============================================================================

-- Migration SQL here

-- Verification Query (optional)
-- SELECT COUNT(*) FROM table_name WHERE condition;

-- Rollback Script (if needed)
-- /* DROP COLUMN IF EXISTS...; */
```

### 3. Execute Migration

Using Supabase MCP (recommended):
```typescript
mcp__supabase__apply_migration(name, query)
```

### 4. Update Source of Truth

After successful execution:
1. Update `current_schema/` files with the new schema
2. Update bridge schemas and TypeScript types if applicable  
3. Mark migration header complete with checkboxes

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

### Safety & Idempotency
- Always use `IF NOT EXISTS` / `IF EXISTS` for idempotent operations
- Test migrations on staging before production  
- Include rollback script for destructive operations

### Performance  
- `ALTER TABLE` takes AccessExclusive lock - run during low-traffic windows
- `STORED` generated columns trigger table rewrite on large tables

### Documentation
- Document the "why" not just the "what"
- Update all checkboxes after completion
- Never use emojis in migration files

## Migration Checklist

### Pre-Migration (Prevents post-deployment issues)
- [ ] **Verify current system behavior** matches assumptions
- [ ] **Check RPC/API signatures** in actual system
- [ ] **Test SQL for idempotency** and correctness
- [ ] **Document problem/solution** clearly in header

### Post-Migration  
- [ ] **Migration executed** successfully via MCP
- [ ] **Verification query** confirms expected result
- [ ] **Source of truth schemas** updated in `current_schema/`
- [ ] **Migration header** marked complete with checkboxes
- [ ] **Integration testing** confirms end-to-end functionality

## Examples

See existing migrations in this directory:
- Simple: Processing time minutes (generated column)
- Complex: Token breakdown (multi-phase migration)
