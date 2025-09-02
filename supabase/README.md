# Supabase Deployment Artifacts

**⚠️ IMPORTANT: This folder contains DEPLOYED ARTIFACTS, not source code!**

## Source of Truth Locations

- **Database Schema:** `shared/docs/architecture/database-foundation-v3/current_schema/`
- **Edge Functions:** `shared/docs/architecture/database-foundation-v3/current_functions/`
- **Worker Code:** `shared/docs/architecture/database-foundation-v3/current_workers/`

## Deployment Process

### Functions Deployment
```bash
# Copy from source to deployment location
cp -r shared/docs/architecture/database-foundation-v3/current_functions/* supabase/functions/

# Deploy to Supabase
supabase functions deploy shell-file-processor-v3
supabase functions deploy audit-logger-v3
```

### Database Deployment
```bash
# Copy from source to migrations
cp shared/docs/architecture/database-foundation-v3/current_schema/*.sql supabase/migrations/

# Deploy to Supabase
supabase db push
```

## Current Deployment Status

- **V3 Database Schema:** ✅ Deployed (Phase 3 complete)
- **V3 Edge Functions:** ⏳ Pending (Phase 4)
- **Legacy V2 Functions:** 🗂️ Archived in `legacy_v2_functions_archive/`

---

**Always modify source files first, then copy to deployment locations!**