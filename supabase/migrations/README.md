# Supabase Migrations Directory

**Status:** NOT USED - Legacy directory from early V3 development

## V3 Migration System

Exora V3 uses a **Supabase MCP-based migration system** instead of traditional Supabase CLI migrations.

### Actual Migration Locations

**Migration Scripts (source of truth):**
```
shared/docs/architecture/database-foundation-v3/migration_history/
```

**Database Schema (current state):**
```
shared/docs/architecture/database-foundation-v3/current_schema/
```

### How Migrations Work

1. **Create migration script** in `migration_history/` with proper template
2. **Execute via Supabase MCP** using `mcp__supabase__apply_migration()`
3. **Update source of truth** in `current_schema/*.sql` files
4. **Mark migration complete** with checkboxes in migration header

**This directory (`supabase/migrations/`) is not part of the V3 workflow.**

## Why Not Use This Directory?

The V3 architecture uses a "source of truth" pattern where:
- Current database state lives in `current_schema/` (always up-to-date)
- Migration history lives in `migration_history/` (chronological record)
- Migrations execute via MCP directly to Supabase (no CLI migration files)

This provides better architecture documentation and clearer separation between "current state" and "how we got here."

## Documentation

See these files for complete migration procedures:
- `shared/docs/architecture/database-foundation-v3/migration_history/README.md`
- `shared/docs/architecture/database-foundation-v3/V3_ARCHITECTURE_MASTER_GUIDE.md`
- Root `CLAUDE.md` - Database Migration Procedure section
