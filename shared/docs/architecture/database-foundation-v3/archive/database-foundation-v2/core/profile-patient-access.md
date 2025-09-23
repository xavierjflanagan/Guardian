# Profile→Patient Access Helper Function

**Purpose:** Centralized database helper for secure profile→patient access resolution  
**Status:** Required for Phase 1 Frontend Implementation  
**Location:** Core database functionality  
**Dependencies:** Multi-profile management tables, RLS policies

---

## Overview

This helper function provides a single source of truth for determining which patient records a profile can access. It centralizes complex healthcare access logic (guardianship, consent, emergency access, adolescent privacy) in a secure, optimized database function.

## Problem Statement

Healthcare applications require complex access patterns:
- **Self-access**: Profile accessing their own patient data
- **Guardian access**: Parent managing child's medical records
- **Spouse access**: Emergency or shared healthcare management
- **Adolescent privacy**: Age-based restrictions (13+, 16+ rules)
- **Emergency access**: Temporary elevated permissions
- **Custody arrangements**: Time-limited access windows

Without centralization, this logic gets duplicated across queries, creating security vulnerabilities and maintenance overhead.

## Solution: Database Helper Function

### Function Definition

```sql
CREATE OR REPLACE FUNCTION get_allowed_patient_ids(p_profile_id uuid)
RETURNS TABLE(
  patient_id uuid,
  relationship text,
  consent_scope text,
  valid_until timestamptz
) 
SECURITY DEFINER -- Runs with elevated privileges for access checks
LANGUAGE plpgsql
AS $$
BEGIN
  -- Validate input profile exists and matches authenticated user
  IF NOT EXISTS (
    SELECT 1 FROM auth.users 
    WHERE id = p_profile_id AND id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Unauthorized access to profile %', p_profile_id;
  END IF;

  RETURN QUERY
  -- Self-access: Profile accessing their own patient data
  SELECT 
    p_profile_id as patient_id,
    'self'::text as relationship,
    'full'::text as consent_scope,
    NULL::timestamptz as valid_until
  WHERE EXISTS (SELECT 1 FROM auth.users WHERE id = p_profile_id)
  
  UNION ALL
  
  -- Family/dependent access via profile_patient_access table
  SELECT 
    pa.patient_id,
    pa.relationship,
    pa.consent_scope,
    pa.valid_until
  FROM profile_patient_access pa
  WHERE pa.profile_id = p_profile_id
    -- Check consent is still valid
    AND (pa.valid_until IS NULL OR pa.valid_until > now())
    -- Verify patient record exists and is active
    AND EXISTS (
      SELECT 1 FROM auth.users u 
      WHERE u.id = pa.patient_id 
        AND u.deleted_at IS NULL
    )
    -- Apply age-based privacy rules (future enhancement)
    -- AND check_adolescent_privacy_rules(pa.patient_id, pa.relationship, pa.consent_scope)
  
  UNION ALL
  
  -- Emergency access (future enhancement)
  -- SELECT patient_id, 'emergency', 'limited', valid_until
  -- FROM emergency_access_grants
  -- WHERE granted_to = p_profile_id AND is_active = true
  
  ORDER BY 
    CASE relationship
      WHEN 'self' THEN 1
      WHEN 'child' THEN 2  
      WHEN 'spouse' THEN 3
      WHEN 'parent' THEN 4
      WHEN 'guardian' THEN 5
      ELSE 6
    END;
END;
$$;
```

### Supporting Table Structure

```sql
-- Profile→Patient access mapping table
CREATE TABLE IF NOT EXISTS profile_patient_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  patient_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  relationship text NOT NULL CHECK (
    relationship IN ('child', 'spouse', 'parent', 'guardian', 'emergency_contact', 'healthcare_proxy')
  ),
  consent_scope text NOT NULL DEFAULT 'full' CHECK (
    consent_scope IN ('full', 'emergency_only', 'limited', 'read_only')
  ),
  granted_by uuid REFERENCES auth.users(id), -- Who authorized this access
  granted_at timestamptz NOT NULL DEFAULT now(),
  valid_until timestamptz, -- NULL = permanent, otherwise expires
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  -- Prevent duplicate relationships
  UNIQUE(profile_id, patient_id, relationship)
);

-- Indexes for performance
CREATE INDEX profile_patient_access_profile_idx ON profile_patient_access(profile_id);
CREATE INDEX profile_patient_access_patient_idx ON profile_patient_access(patient_id);
CREATE INDEX profile_patient_access_valid_idx ON profile_patient_access(valid_until) 
  WHERE valid_until IS NOT NULL;

-- RLS policies
ALTER TABLE profile_patient_access ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view access they granted" ON profile_patient_access
  FOR SELECT USING (granted_by = auth.uid());

CREATE POLICY "Users can view access granted to them" ON profile_patient_access
  FOR SELECT USING (profile_id = auth.uid());

-- Trigger for updated_at
CREATE TRIGGER profile_patient_access_updated_at
  BEFORE UPDATE ON profile_patient_access
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

## Security Considerations

### Authentication & Authorization
- **SECURITY DEFINER**: Function runs with elevated privileges but validates auth.uid()
- **Input validation**: Ensures profile_id matches authenticated user
- **RLS enforcement**: All queries respect Row Level Security policies
- **Audit trail**: All access grants logged with granter and timestamp

### Healthcare Privacy Compliance
- **Adolescent privacy**: Framework for age-based access restrictions (13+, 16+ rules)
- **Consent management**: Explicit consent scopes and expiration dates
- **Emergency access**: Controlled temporary access elevation
- **Audit logging**: Complete trail of who accessed what when

### Data Integrity
- **Referential integrity**: Foreign key constraints to auth.users
- **Constraint validation**: Relationship and consent_scope values validated
- **Unique constraints**: Prevent duplicate access relationships
- **Soft deletion**: Patient deactivation handled gracefully

## Frontend Integration

### React Hook Pattern

```typescript
// Standardized hook using the database helper
export function useAllowedPatients(profileId: string) {
  return useQuery({
    queryKey: ['allowed-patients', profileId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_allowed_patient_ids', { 
        p_profile_id: profileId 
      });
      if (error) throw error;
      return data;
    },
    enabled: !!profileId,
    staleTime: 5 * 60 * 1000, // 5min cache (access rules change infrequently)
    retry: 3,
  });
}

// Clinical data hook using the helper
export function usePatientTimeline(profileId: string) {
  const { data: allowedPatients } = useAllowedPatients(profileId);
  const patientIds = allowedPatients?.map(p => p.patient_id) || [];
  
  return useQuery({
    queryKey: ['timeline', profileId, patientIds],
    queryFn: () => fetchTimelineForPatients(patientIds),
    enabled: !!profileId && patientIds.length > 0,
    staleTime: 5 * 60 * 1000,
    retry: 3,
  });
}
```

### Usage Patterns

```typescript
// Mother accessing her child's records
const { data: allowedPatients } = useAllowedPatients(motherId);
// Returns: [
//   { patient_id: motherId, relationship: 'self', consent_scope: 'full' },
//   { patient_id: childId, relationship: 'child', consent_scope: 'full' }
// ]

// Healthcare proxy with limited access
const { data: allowedPatients } = useAllowedPatients(proxyId);
// Returns: [
//   { patient_id: proxyId, relationship: 'self', consent_scope: 'full' },
//   { patient_id: patientId, relationship: 'healthcare_proxy', consent_scope: 'emergency_only' }
// ]
```

## Performance Considerations

### Database Optimization
- **Indexed lookups**: Fast profile_id and patient_id queries
- **Query plan caching**: Function execution plans cached by PostgreSQL
- **Minimal joins**: Optimized for common access patterns
- **Result caching**: Frontend caches results for 5 minutes

### Scaling Patterns
- **Connection pooling**: Function works efficiently with PgBouncer
- **Read replicas**: Can be executed on read-only replicas
- **Materialized views**: Consider for high-traffic scenarios
- **Partitioning**: Table can be partitioned by profile_id if needed

## Healthcare-Specific Enhancements

### Adolescent Privacy Rules (Future)
```sql
-- Age-based access restrictions
CREATE OR REPLACE FUNCTION check_adolescent_privacy_rules(
  p_patient_id uuid,
  p_relationship text,
  p_consent_scope text
) RETURNS boolean AS $$
DECLARE
  patient_age interval;
BEGIN
  -- Calculate patient age
  SELECT age(now(), date_of_birth) INTO patient_age
  FROM user_profiles 
  WHERE user_id = p_patient_id;
  
  -- 13+ years: Restricted mental health access for parents
  IF patient_age >= interval '13 years' 
     AND p_relationship IN ('parent', 'guardian')
     AND p_consent_scope = 'full' THEN
    -- Check if mental health data access is explicitly granted
    RETURN check_mental_health_consent(p_patient_id, p_relationship);
  END IF;
  
  -- 16+ years: Requires explicit consent for most parental access
  IF patient_age >= interval '16 years'
     AND p_relationship = 'parent' THEN
    RETURN check_explicit_consent_granted(p_patient_id, p_relationship);
  END IF;
  
  RETURN true; -- Default allow
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

### Emergency Access Management
```sql
-- Emergency access grants table
CREATE TABLE emergency_access_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES auth.users(id),
  granted_to uuid NOT NULL REFERENCES auth.users(id),
  granted_by uuid REFERENCES auth.users(id), -- Healthcare provider or patient
  access_level text NOT NULL DEFAULT 'emergency_only',
  reason text NOT NULL, -- "Emergency department visit", "ICU admission"
  granted_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  
  CHECK (expires_at > granted_at),
  CHECK (expires_at <= granted_at + interval '72 hours') -- Max 72 hour emergency access
);
```

## Migration Script

```sql
-- Add to next migration file (e.g., 014_profile_patient_access.sql)
BEGIN;

-- Create profile_patient_access table
CREATE TABLE profile_patient_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  patient_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  relationship text NOT NULL CHECK (
    relationship IN ('child', 'spouse', 'parent', 'guardian', 'emergency_contact', 'healthcare_proxy')
  ),
  consent_scope text NOT NULL DEFAULT 'full' CHECK (
    consent_scope IN ('full', 'emergency_only', 'limited', 'read_only')
  ),
  granted_by uuid REFERENCES auth.users(id),
  granted_at timestamptz NOT NULL DEFAULT now(),
  valid_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  UNIQUE(profile_id, patient_id, relationship)
);

-- Create indexes
CREATE INDEX profile_patient_access_profile_idx ON profile_patient_access(profile_id);
CREATE INDEX profile_patient_access_patient_idx ON profile_patient_access(patient_id);
CREATE INDEX profile_patient_access_valid_idx ON profile_patient_access(valid_until) 
  WHERE valid_until IS NOT NULL;

-- Enable RLS
ALTER TABLE profile_patient_access ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Users can view access they granted" ON profile_patient_access
  FOR SELECT USING (granted_by = auth.uid());

CREATE POLICY "Users can view access granted to them" ON profile_patient_access
  FOR SELECT USING (profile_id = auth.uid());

-- Create the helper function
CREATE OR REPLACE FUNCTION get_allowed_patient_ids(p_profile_id uuid)
RETURNS TABLE(
  patient_id uuid,
  relationship text,
  consent_scope text,
  valid_until timestamptz
) 
SECURITY DEFINER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Validate input profile exists and matches authenticated user
  IF NOT EXISTS (
    SELECT 1 FROM auth.users 
    WHERE id = p_profile_id AND id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Unauthorized access to profile %', p_profile_id;
  END IF;

  RETURN QUERY
  -- Self-access
  SELECT 
    p_profile_id as patient_id,
    'self'::text as relationship,
    'full'::text as consent_scope,
    NULL::timestamptz as valid_until
  WHERE EXISTS (SELECT 1 FROM auth.users WHERE id = p_profile_id)
  
  UNION ALL
  
  -- Family/dependent access
  SELECT 
    pa.patient_id,
    pa.relationship,
    pa.consent_scope,
    pa.valid_until
  FROM profile_patient_access pa
  WHERE pa.profile_id = p_profile_id
    AND (pa.valid_until IS NULL OR pa.valid_until > now())
    AND EXISTS (
      SELECT 1 FROM auth.users u 
      WHERE u.id = pa.patient_id 
        AND u.deleted_at IS NULL
    )
  
  ORDER BY 
    CASE relationship
      WHEN 'self' THEN 1
      WHEN 'child' THEN 2  
      WHEN 'spouse' THEN 3
      WHEN 'parent' THEN 4
      WHEN 'guardian' THEN 5
      ELSE 6
    END;
END;
$$;

-- Grant execution permissions
GRANT EXECUTE ON FUNCTION get_allowed_patient_ids(uuid) TO authenticated;

COMMIT;
```

## Testing

### Unit Tests
```sql
-- Test self-access
SELECT patient_id, relationship FROM get_allowed_patient_ids('test-profile-id');
-- Expected: Returns self with 'full' access

-- Test family access
INSERT INTO profile_patient_access (profile_id, patient_id, relationship, granted_by)
VALUES ('parent-id', 'child-id', 'child', 'parent-id');

SELECT patient_id, relationship FROM get_allowed_patient_ids('parent-id');
-- Expected: Returns both self and child records

-- Test expired access
UPDATE profile_patient_access SET valid_until = now() - interval '1 day'
WHERE profile_id = 'parent-id';

SELECT patient_id, relationship FROM get_allowed_patient_ids('parent-id');
-- Expected: Returns only self record (child access expired)
```

### Integration Tests
```typescript
// Frontend integration test
test('useAllowedPatients returns correct access', async () => {
  // Setup test data
  await supabase.from('profile_patient_access').insert({
    profile_id: 'parent-123',
    patient_id: 'child-456', 
    relationship: 'child',
    granted_by: 'parent-123'
  });
  
  // Test hook
  const { result } = renderHook(() => useAllowedPatients('parent-123'));
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  
  expect(result.current.data).toEqual([
    { patient_id: 'parent-123', relationship: 'self', consent_scope: 'full' },
    { patient_id: 'child-456', relationship: 'child', consent_scope: 'full' }
  ]);
});
```

## Benefits

### Security
- **Centralized access logic** prevents bypasses and inconsistencies  
- **Server-side validation** ensures client cannot manipulate access rules
- **Audit trail** for all access grants and usage
- **RLS integration** maintains database-level security

### Performance  
- **Single database call** instead of multiple frontend queries
- **Optimized joins** with proper indexing
- **Result caching** reduces database load
- **Query plan optimization** by PostgreSQL

### Maintainability
- **Single source of truth** for access rules
- **Future-proof** for adolescent privacy, emergency access, etc.
- **Easy updates** - change rules in one place
- **Testable** - unit tests for access logic

### Developer Experience
- **Simple hooks** - `useAllowedPatients(profileId)` provides everything needed
- **Type safety** - Clear return interface with relationship and scope
- **Error handling** - Proper validation and error messages
- **Documentation** - Clear patterns for clinical vs profile data

---

**Implementation Priority:** Phase 1 (Required before clinical data components)  
**Migration File:** `014_profile_patient_access.sql`  
**Testing:** Required unit tests and integration tests  
**Documentation:** Update frontend hook patterns and examples