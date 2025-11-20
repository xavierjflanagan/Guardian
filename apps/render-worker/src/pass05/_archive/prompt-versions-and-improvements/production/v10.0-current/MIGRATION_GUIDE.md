# Migration Guide: v2.9 to v10.0

## Overview

This guide helps you migrate from Pass 0.5 v2.9 (with failed addon approach) to v10.0 universal prompt.

## Pre-Migration Checklist

- [ ] Verify current version: `PASS_05_VERSION` environment variable
- [ ] Review downstream systems that consume encounterType values
- [ ] Backup database (healthcare_encounters table)
- [ ] Monitor current error rates for baseline

## Migration Steps

### Step 1: Deploy Code

The v10 code is backward compatible. Deploy includes:
- New `aiPrompts.v10.ts` file
- Updated `chunk-processor.ts`
- New `post-processor.ts`
- v2.9 files remain for rollback

### Step 2: Enable v10 (Gradual Rollout)

```bash
# Start with 10% of traffic
PASS_05_VERSION=v10  # For selected workers

# Monitor for 24 hours, then increase
PASS_05_VERSION=v10  # 50% of workers

# Full deployment
PASS_05_VERSION=v10  # All workers
```

### Step 3: Update Downstream Systems

#### encounterType Value Mapping

If your system expects human-readable encounter types, add mapping:

```typescript
const encounterTypeMap = {
  'emergency_department': 'Emergency Department Visit',
  'hospital_admission': 'Hospital Admission',
  'surgical_procedure': 'Surgical Procedure',
  'outpatient_consultation': 'Outpatient Consultation',
  'diagnostic_imaging': 'Diagnostic Imaging',
  'laboratory_test': 'Laboratory Test Collection',
  'treatment_session': 'Treatment Session',
  'vaccination': 'Vaccination/Immunization',
  'telehealth': 'Telehealth Consultation',
  'medication_review': 'Medication Review'
};
```

### Step 4: Monitor Key Metrics

#### Success Indicators
- **Handoff Success Rate**: Should be >95% for multi-chunk documents
- **Duplicate Encounters**: Should decrease significantly
- **Confidence Scores**: Should average >0.75
- **Processing Time**: Similar to v2.9 (5-10 seconds per chunk)

#### SQL Monitoring Queries

```sql
-- Check handoff success rate
SELECT
  COUNT(*) FILTER (WHERE handoff_generated->>'pendingEncounter' IS NOT NULL) as has_handoff,
  COUNT(*) as total_chunks
FROM pass05_chunk_results
WHERE created_at > NOW() - INTERVAL '1 hour'
  AND chunk_number < (
    SELECT MAX(chunk_number)
    FROM pass05_chunk_results c2
    WHERE c2.session_id = pass05_chunk_results.session_id
  );

-- Check for duplicate encounters
SELECT
  patient_id,
  encounter_type,
  encounter_start_date,
  COUNT(*) as duplicates
FROM healthcare_encounters
WHERE created_at > NOW() - INTERVAL '1 hour'
GROUP BY patient_id, encounter_type, encounter_start_date
HAVING COUNT(*) > 1;

-- Monitor confidence scores
SELECT
  AVG(pass_0_5_confidence) as avg_confidence,
  MIN(pass_0_5_confidence) as min_confidence,
  COUNT(*) FILTER (WHERE pass_0_5_confidence < 0.5) as low_confidence_count
FROM healthcare_encounters
WHERE identified_in_pass = 'pass_0_5'
  AND created_at > NOW() - INTERVAL '1 hour';
```

### Step 5: Rollback Plan (If Needed)

If issues arise:

```bash
# Immediate rollback
PASS_05_VERSION=v2.9

# No code changes needed - v2.9 files still present
```

## Common Issues and Solutions

### Issue: Downstream system breaks on new encounterType values
**Solution**: Add mapping layer (see Step 3) or update downstream to handle new values

### Issue: AI not providing status field
**Solution**: Post-processor handles this automatically - no action needed

### Issue: Lower confidence scores than expected
**Solution**: Check if AI model changed; v10 has stricter confidence bands

### Issue: Page assignments missing key phrases
**Solution**: Normal - v10 requires citations; improves accuracy

## Post-Migration Cleanup

After successful migration (1 week stable):

1. Remove v2.9 imports from codebase
2. Archive v2.9 prompt files
3. Update documentation to reference v10
4. Remove `PASS_05_VERSION` checks (make v10 default)

## Support

For issues during migration:
- Check logs: `pass05_chunk_results.error_message`
- Review: `/docs/architecture/pass-0.5-encounter-discovery/`
- Rollback if critical issues: `PASS_05_VERSION=v2.9`