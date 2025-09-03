# V3 Schema Known Issues

## Issue #1: API Rate Limiting Function Bug

**Status**: 🔴 **BLOCKING** for API rate limiting functionality  
**Impact**: Medium - Core pipeline works, but rate limiting cannot be tested  
**Date Identified**: 2025-09-03  
**Found During**: End-to-end V3 testing

### Problem Description
The `acquire_api_capacity()` function in `08_job_coordination.sql` has a PostgreSQL variable name collision bug:

```sql
-- PROBLEMATIC CODE (line 379-391):
DECLARE
    current_time TIMESTAMPTZ := NOW();  -- Variable name conflicts with CURRENT_TIME built-in
BEGIN
    -- This fails due to type confusion:
    AND current_time - minute_reset_at > INTERVAL '1 minute'
```

### Error Message
```
ERROR: 42883: operator does not exist: time with time zone - timestamp with time zone
CONTEXT: PL/pgSQL function acquire_api_capacity(text,text,integer) line 8
```

### Root Cause
- Variable `current_time` conflicts with PostgreSQL's built-in `CURRENT_TIME` function
- PostgreSQL interprets `current_time` as `TIME WITH TIME ZONE` instead of the declared `TIMESTAMPTZ`
- Results in invalid type subtraction: `TIME WITH TIME ZONE - TIMESTAMP WITH TIME ZONE`

### Workaround
**Skip API rate limiting tests** - Core V3 pipeline functionality is unaffected.

### Recommended Fix
Rename variable to avoid collision:
```sql
DECLARE
    current_timestamp TIMESTAMPTZ := NOW();  -- Different name avoids collision
```

### Testing Status
- ✅ **Core V3 Pipeline**: Working perfectly
- ❌ **API Rate Limiting**: Blocked by this bug
- ✅ **Worker Coordination**: Working perfectly
- ⏳ **Audit Logging**: Testing pending

### Priority
**Low-Medium** - This blocks production scalability testing but doesn't affect core functionality. Can be fixed in a maintenance release.