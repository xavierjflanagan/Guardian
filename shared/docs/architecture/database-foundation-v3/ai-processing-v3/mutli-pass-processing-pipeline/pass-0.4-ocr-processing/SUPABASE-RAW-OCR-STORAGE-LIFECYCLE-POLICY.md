# Supabase Storage Lifecycle Policy Configuration

**Purpose:** Automatically delete raw Google Cloud Vision responses after 30 days to manage storage costs

**Related:** Phase 4 - Raw GCV Storage (Optional)

---

## Overview

Raw Google Cloud Vision responses are large (~2-5MB per page) and primarily useful for debugging. To manage storage costs, these files should be automatically deleted after 30 days using Supabase Storage lifecycle policies.

**Files Affected:**
- `{patient_id}/{shell_file_id}-ocr/raw-gcv.json`

**Files NOT Affected:**
- `{patient_id}/{shell_file_id}-ocr/enhanced-ocr.txt` - **PERMANENT** (small, critical for all passes)
- `{patient_id}/{shell_file_id}-ocr/page-N.json` - **PERMANENT** (coordinate reference data)
- `{patient_id}/{shell_file_id}-ocr/manifest.json` - **PERMANENT** (metadata)

---

## Configuration Steps

### Option 1: Supabase Dashboard (Recommended)

1. **Navigate to Storage Settings**
   - Log in to Supabase Dashboard: https://app.supabase.com
   - Select your project
   - Go to "Storage" → "Policies" → "medical-docs" bucket

2. **Create Lifecycle Rule**
   - Click "Add lifecycle policy"
   - **Name:** `Delete raw GCV responses after 30 days`
   - **Path pattern:** `*/*/ocr/raw-gcv.json`
   - **Action:** Delete
   - **Age:** 30 days
   - Click "Save"

3. **Verify Rule**
   - Check that the rule appears in the lifecycle policies list
   - Pattern should match: `{patient_id}/{shell_file_id}-ocr/raw-gcv.json`

### Option 2: Supabase CLI (Alternative)

```bash
# Note: Lifecycle policies via CLI may not be fully supported yet
# Check Supabase documentation for latest CLI capabilities
# Prefer Dashboard configuration (Option 1)
```

### Option 3: SQL Policy (NOT RECOMMENDED)

**Warning:** Supabase Storage lifecycle policies should be configured via Dashboard, not SQL. SQL-based Row Level Security (RLS) policies control *access*, not *retention*.

---

## Verification

### Test Lifecycle Policy

1. **Upload a test raw-gcv.json file**
   ```typescript
   await supabase.storage
     .from('medical-docs')
     .upload('test-patient/test-shell-ocr/raw-gcv.json', JSON.stringify({ test: true }));
   ```

2. **Check file metadata**
   ```typescript
   const { data } = await supabase.storage
     .from('medical-docs')
     .list('test-patient/test-shell-ocr');

   console.log(data); // Should show raw-gcv.json with created_at timestamp
   ```

3. **Verify deletion after 30 days**
   - Lifecycle policies run daily at approximately 00:00 UTC
   - Files older than 30 days will be automatically deleted
   - Check logs in Supabase Dashboard → Storage → Lifecycle Logs

### Monitor Storage Usage

**Query storage size by file type:**
```sql
-- View storage breakdown (Supabase Dashboard → Database → SQL Editor)
SELECT
  CASE
    WHEN name LIKE '%/raw-gcv.json' THEN 'Raw GCV (temp)'
    WHEN name LIKE '%/enhanced-ocr.txt' THEN 'Enhanced OCR (permanent)'
    WHEN name LIKE '%/page-%.json' THEN 'Page JSON (permanent)'
    ELSE 'Other'
  END as file_type,
  COUNT(*) as file_count,
  SUM(metadata->>'size')::bigint / 1024 / 1024 as total_mb
FROM storage.objects
WHERE bucket_id = 'medical-docs'
GROUP BY file_type
ORDER BY total_mb DESC;
```

**Expected results:**
- Raw GCV files should be < 1% of total storage (due to 30-day deletion)
- Enhanced OCR and page JSON files persist permanently

---

## Cost Analysis

### Without Lifecycle Policy
**100-page document:**
- Raw GCV: ~250MB (NEVER deleted)
- Enhanced OCR: ~500KB
- Page JSON: ~5MB
- **Total:** ~255.5MB per document

**1,000 documents:**
- Total: ~255GB
- Monthly cost: $5.36/month (at $0.021/GB/month)

### With 30-Day Lifecycle Policy
**100-page document:**
- Raw GCV: ~250MB (deleted after 30 days)
- Enhanced OCR: ~500KB (permanent)
- Page JSON: ~5MB (permanent)
- **Total:** ~5.5MB per document (after 30 days)

**1,000 documents (processed over 6 months):**
- Active raw GCV (last 30 days): ~166 docs × 250MB = ~41.5GB
- Historical permanent data: 1,000 docs × 5.5MB = ~5.5GB
- **Total:** ~47GB
- **Monthly cost:** $0.99/month (at $0.021/GB/month)
- **Savings:** $4.37/month (82% reduction)

---

## Troubleshooting

### Files not being deleted

**Check lifecycle policy status:**
1. Go to Supabase Dashboard → Storage → Policies
2. Verify policy is "Active"
3. Check path pattern matches your file structure

**Common issues:**
- **Pattern mismatch:** Ensure pattern is `*/*/ocr/raw-gcv.json` (matches `{patient_id}/{shell_file_id}-ocr/raw-gcv.json`)
- **Policy disabled:** Re-enable in Dashboard
- **Timing:** Lifecycle jobs run daily at ~00:00 UTC, may take 24-48 hours to see results

### Files deleted too early

**Verify policy age setting:**
- Should be set to 30 days minimum
- Check Dashboard → Storage → Policies → Edit policy

### Storage costs still high

**Audit file retention:**
```sql
-- Find old raw-gcv.json files that should have been deleted
SELECT
  name,
  created_at,
  metadata->>'size' as size_bytes,
  EXTRACT(DAY FROM NOW() - created_at) as age_days
FROM storage.objects
WHERE bucket_id = 'medical-docs'
  AND name LIKE '%/raw-gcv.json'
  AND created_at < NOW() - INTERVAL '30 days'
ORDER BY created_at DESC
LIMIT 100;
```

**If old files exist:**
1. Check lifecycle policy is active
2. Wait 24-48 hours for next lifecycle job run
3. If still present, contact Supabase support

---

## Environment Variable

**Enable raw GCV storage:**
```bash
# Render.com Environment Variables
STORE_RAW_GCV=true

# Local development (.env)
STORE_RAW_GCV=true
```

**Disable raw GCV storage (default):**
```bash
# Omit variable or set to false
STORE_RAW_GCV=false
```

**When to enable:**
- Debugging OCR quality issues
- Investigating specific document processing failures
- Building new metadata extraction features
- Short-term troubleshooting (enable, debug, disable)

**When to disable (default):**
- Production normal operation
- Storage cost optimization
- Pre-launch testing (unless specifically debugging OCR)

---

## Rollback Plan

**To disable Phase 4 entirely:**

1. **Remove environment variable**
   ```bash
   # Render.com → Environment → Delete STORE_RAW_GCV
   # Or set to: STORE_RAW_GCV=false
   ```

2. **Delete existing raw GCV files (optional)**
   ```typescript
   // Run cleanup script to free storage immediately
   const { data: files } = await supabase.storage
     .from('medical-docs')
     .list('', { limit: 1000, search: 'raw-gcv.json' });

   for (const file of files || []) {
     await supabase.storage
       .from('medical-docs')
       .remove([file.name]);
   }
   ```

3. **Keep lifecycle policy active**
   - Even if disabled, policy ensures any leftover files are cleaned up
   - No harm in keeping policy active

---

## References

- **Supabase Storage Lifecycle Policies:** https://supabase.com/docs/guides/storage/lifecycle
- **Implementation Plan:** OCR-UNIFIED-ARCHITECTURE-IMPLEMENTATION-PLAN.md (Phase 4)
- **Worker Configuration:** apps/render-worker/src/worker.ts (config.ocr.storeRawGCV)
- **Storage Function:** apps/render-worker/src/utils/ocr-persistence.ts (storeRawGCV)
