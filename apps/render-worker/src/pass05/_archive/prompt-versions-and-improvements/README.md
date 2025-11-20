# Pass 0.5 Prompt Versions and Improvements

This directory contains documentation for all versions of the Pass 0.5 encounter discovery AI prompt.

**Current Production Version:** v2.9 (see `CURRENT_VERSION` file)

## Directory Structure

```
prompt-versions-and-improvements/
├── README.md                          (this file)
├── CURRENT_VERSION                    (programmatic version identifier)
│
├── production/                        (current and previous production versions)
│   ├── v2.9-current/                 (CURRENT PRODUCTION - validated 2025-11-06)
│   │   ├── IMPLEMENTATION_SUMMARY.md (deployment status and validation results)
│   │   ├── VALIDATION_REPORT.md     (production test results)
│   │   ├── INTEGRATION_GUIDE.md     (deployment and integration instructions)
│   │   ├── CHANGELOG.md             (changes from v2.8 to v2.9)
│   │   └── SPECIFICATION.md         (design specification)
│   │
│   └── v2.8-previous/                (previous production version)
│       ├── VALIDATION_REPORT.md
│       ├── INTEGRATION_GUIDE.md
│       └── CHANGELOG.md
│
├── historical/                        (pre-production versions for reference)
│   └── v2.4-to-v2.7/
│       ├── changelogs/              (version-to-version changelogs)
│       ├── validation_reports/      (testing documentation)
│       └── other/                   (specifications, plans, etc.)
│
└── _archive_for_deletion/            (staged for deletion - review before removing)
    ├── duplicate_prompts/           (duplicate .ts files - actual code is in parent pass05/)
    └── obsolete/                    (obsolete versions and one-off documents)
```

## Important Notes

### Prompt File Locations

**CRITICAL:** The actual TypeScript prompt files are located in the parent `pass05/` directory:
- **Current Runtime:** `../aiPrompts.v2.9.ts` (used by production worker)
- **Previous Runtime:** `../aiPrompts.v2.8.ts`
- **Historical:** `../aiPrompts.v2.7.ts`

**This directory contains DOCUMENTATION ONLY**, not the runtime prompt files.

The `PROMPT_vX.X_OPTIMIZED.ts` files previously in this folder were duplicates and have been moved to `_archive_for_deletion/duplicate_prompts/` for review before deletion.

## Version History

| Version | Status | Date | Key Changes |
|---------|--------|------|-------------|
| **v2.9** | **CURRENT PRODUCTION** | 2025-11-06 | Multi-day encounter support, date quality tracking (Migration 42) |
| v2.8 | Previous Production | 2025-11-05 | Boundary detection improvements, Frankenstein file handling |
| v2.7 | Historical | 2025-11-05 | Page-by-page assignment optimization |
| v2.6 | Historical | 2025-11-05 | Corrections and refinements |
| v2.5 | Historical | 2025-11-05 | Initial optimizations |
| v2.4 | Archived | 2025-11-05 | Analysis phase |

## How to Navigate

### For Current Production Information
```bash
cd production/v2.9-current/
```

**Key Files:**
- `IMPLEMENTATION_SUMMARY.md` - Deployment status, validation results, next steps
- `VALIDATION_REPORT.md` - Complete test results and validation queries
- `INTEGRATION_GUIDE.md` - How to deploy and integrate v2.9

### For Historical Reference
```bash
cd historical/v2.4-to-v2.7/
```

### For Previous Production Version
```bash
cd production/v2.8-previous/
```

## Version Upgrade Process

When a new version (e.g., v3.0) is deployed:

1. Move `production/v2.9-current/` to `production/v2.9-previous/`
2. Move `production/v2.8-previous/` to `historical/v2.8/`
3. Create `production/v3.0-current/` with new documentation
4. Update `CURRENT_VERSION` file to "v3.0"
5. Update this README's version table

## Related Files

### Database Migrations
See: `shared/docs/architecture/database-foundation-v3/migration_history/`

### Test Results
See: `shared/docs/architecture/database-foundation-v3/ai-processing-v3/implementation-planning/pass-0.5-encounter-discovery/pass05-hypothesis-tests-results/`

### Worker Code
See: `apps/render-worker/src/pass05/`

## Files Staged for Deletion

The `_archive_for_deletion/` folder contains:

### Duplicate Prompt Files (5 files)
These are documentation copies that duplicate the actual runtime files in `../`:
- `PROMPT_v2.5_OPTIMIZED.ts`
- `PROMPT_v2.6_OPTIMIZED.ts`
- `PROMPT_v2.7_OPTIMIZED.ts`
- `PROMPT_v2.8_OPTIMIZED.ts`
- `PROMPT_v2.9_OPTIMIZED.ts`

**Recommendation:** DELETE - The source of truth is in the parent `pass05/` directory.

### Obsolete Files (7 files)
Old versions and one-off documents with no future value:
- `aiPrompts.v1.ts` (ancient version)
- `aiPrompts.v2.1.ts` (early iteration)
- `aiPrompts.v2.2.ts` (early iteration)
- `PROMPT_ANALYSIS_v2.4.md` (one-off analysis)
- `gpt5-review-v2.4.md` (one-off review)
- `OPTIMIZATION_CHANGELOG_v2.5.md` (superseded by later changelogs)
- `PLAN_v2.6_CORRECTIONS.md` (completed planning document)

**Recommendation:** DELETE - These are 4-5 versions old and unlikely to be referenced.

**To permanently delete:**
```bash
rm -rf _archive_for_deletion/
```

## Contact

For questions about prompt versions or documentation structure, see:
- Migration 42 documentation: `migration_history/2025-11-06_42_healthcare_encounters_timeframe_redesign.sql`
- Worker architecture: `shared/docs/architecture/database-foundation-v3/current_workers/WORKER_ARCHITECTURE.md`

---

**Last Updated:** 2025-11-06
**Current Version:** v2.9
**Organization:** Reorganized for clarity and maintainability
