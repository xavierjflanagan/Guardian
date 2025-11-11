# Progressive Mode Schema Unification Plan
**Date:** 2025-11-11
**Decision:** Unify on camelCase to match v2.9 base prompt

## Current State Analysis

### Snake_case Fields (in prompts.ts)
- `temp_id` → should be `tempId`
- `encounter_type` → should be `encounterType`
- `encounter_start_date` → should be `encounterStartDate`
- `encounter_end_date` → should be `encounterEndDate`
- `encounter_timeframe_status` → should be `encounterTimeframeStatus`
- `date_source` → should be `dateSource`
- `provider_name` → should be `providerName`
- `page_ranges` → should be `pageRanges`
- `expected_continuation` → should be `expectedContinuation`
- `continuation_data` → should be `continuationData`
- `active_context` → should be `activeContext`
- `current_admission` → should be `currentAdmission`
- `active_providers` → should be `activeProviders`
- `recent_labs` → should be `recentLabs`
- `ongoing_issues` → should be `ongoingIssues`

### CamelCase Already Used (in v2.9 base)
- `encounterType`
- `dateRange` (with `start` and `end` properties)
- `provider`
- `facility`
- `confidence`
- `summary`
- `pageRanges`
- `spatialBounds`
- `isRealWorldVisit`

## Implementation Steps

### Step 1: Update Progressive Prompts (prompts.ts)
Change all example JSON in the prompt to use camelCase consistently:

```json
{
  "continuationData": {
    "tempId": "encounter_temp_001",
    "expectedType": "lab_results"
  },
  "encounters": [
    {
      "status": "complete",
      "tempId": "encounter_temp_001",
      "encounterType": "Emergency Department Visit",
      "encounterStartDate": "2024-03-15",
      "encounterEndDate": "2024-03-15",
      "encounterTimeframeStatus": "completed",
      "dateSource": "ai_extracted",
      "providerName": "Dr. Sarah Chen",
      "facility": "St Vincent's Hospital",
      "pageRanges": [[1, 5]],
      "confidence": 0.95,
      "summary": "Brief summary of encounter",
      "expectedContinuation": "lab_results"
    }
  ],
  "activeContext": {
    "currentAdmission": {
      "active": true,
      "startDate": "2024-03-15",
      "facility": "St Vincent's Hospital"
    },
    "activeProviders": ["Dr. Sarah Chen"],
    "recentLabs": ["CBC", "BMP"],
    "ongoingIssues": ["chest pain", "shortness of breath"]
  }
}
```

### Step 2: Update Parser (chunk-processor.ts)
Ensure parser reads camelCase consistently:

```typescript
// Remove snake_case field access
tempId: enc.tempId,  // NOT enc.encounter_id or enc.temp_id
encounterType: enc.encounterType,  // NOT enc.encounter_type
encounterStartDate: enc.encounterStartDate,  // NOT enc.encounter_start_date

// For page assignments
const pageAssignments = (parsed.pageAssignments || []).map(pa => ({
  page: pa.page,
  encounter_id: pa.encounterId,  // camelCase in response
  justification: pa.justification
}));
```

### Step 3: Update Handoff Builder
Ensure handoff packages use consistent camelCase:

```typescript
interface HandoffPackage {
  continuationData?: {
    tempId: string;
    expectedType: string;
    partialEncounter?: any;
  };
  activeContext?: {
    currentAdmission?: any;
    activeProviders: string[];
    recentLabs: string[];
    ongoingIssues: string[];
  };
}
```

### Step 4: Database Mapping Layer
Keep the mapping layer that converts camelCase to snake_case for database:

```typescript
// AI Response (camelCase) → Database (snake_case)
const dbRecord = {
  patient_id: params.patientId,
  primary_shell_file_id: params.shellFileId,
  encounter_type: enc.encounterType,  // camelCase source
  encounter_start_date: enc.encounterStartDate,  // camelCase source
  encounter_date_end: enc.encounterEndDate,  // camelCase source
  // ... etc
};
```

## Benefits of CamelCase Unification

1. **Consistency with v2.9** - Base prompt already uses camelCase
2. **TypeScript Native** - Matches TypeScript naming conventions
3. **Single Transformation Point** - Only transform at database boundary
4. **Reduced Errors** - No confusion about which casing to use where
5. **Better IDE Support** - Auto-completion works better with camelCase

## Testing Strategy

1. Create test JSON responses in camelCase format
2. Verify parser correctly extracts all fields
3. Confirm database mapping preserves all data
4. Test handoff package continuity between chunks
5. Validate reconciliation with consistent field names

## Rollback Plan

If issues arise, we can add a normalization layer:
```typescript
function normalizeToSnakeCase(obj: any): any {
  // Transform camelCase keys to snake_case
  // This would be a temporary bridge while fixing
}
```

But the goal is to avoid this complexity by using camelCase everywhere except the database.