# Small File Prompt Optimization

**Status**: Deferred until Pass 1/2 stress testing
**Priority**: Cost optimization
**Created**: 2025-11-27

## Problem

Safe split point extraction adds token cost for files that don't need it:
- Input tokens: Instructions for safe split detection in prompt
- Output tokens: `safe_split_points` array in AI response

Small files/encounters don't need intra-encounter batching, making this extraction wasteful.

## Proposed Solution

Threshold-based prompt selection:
- **Full prompt**: Files >= X pages (includes safe split extraction)
- **Lite prompt**: Files < X pages (encounters only, no safe splits)

## Implementation

```
if (totalPages < SAFE_SPLIT_THRESHOLD) {
  // Use lite prompt - skip safe split instructions
} else {
  // Use full prompt - include safe split extraction
}
```

Fork decision in chunk-processor before AI call.

## Unknown

Threshold value (X) - must be determined by Pass 1/2 stress testing:
- At what encounter size does batching become necessary?
- Could be 10, 15, or 20 pages - depends on downstream limits

## Action

Revisit after Pass 1/2 implementation provides real data on batching requirements.
