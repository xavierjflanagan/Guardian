# user_profiles Bridge Schema (Source) - Pass 2

**Status:** ✅ Created from Database Schema
**Database Source:** /current_schema/02_profiles.sql (lines 57-120)
**Last Updated:** 1 October 2025
**Priority:** CRITICAL - User profile and demographic data foundation

## Database Table Structure

```sql
-- User profiles with multi-profile support (self, child, pet, dependent)
CREATE TABLE user_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_owner_id UUID NOT NULL REFERENCES auth.users(id), -- The primary account holder

    -- Profile Identity
    profile_type TEXT NOT NULL CHECK (profile_type IN ('self', 'child', 'pet', 'dependent')),
    profile_status TEXT NOT NULL DEFAULT 'active' CHECK (profile_status IN ('active', 'inactive', 'pending_transfer')),

    -- Profile Details
    display_name TEXT NOT NULL,
    full_name TEXT,
    date_of_birth DATE,
    species TEXT, -- For pets: 'dog', 'cat', 'bird', etc.
    breed TEXT, -- For pets

    -- Relationship to Account Owner
    relationship profile_relationship_type, -- Strong typed relationship (replaces TEXT)
    legal_status TEXT CHECK (legal_status IN ('guardian', 'parent', 'caregiver', 'self', 'owner')),

    -- Profile Customization
    theme_color TEXT DEFAULT '#2563eb',
    avatar_url TEXT,
    custom_theme JSONB DEFAULT '{}', -- Extended theme customization
    profile_icon TEXT, -- Icon identifier for quick visual recognition

    -- Authentication Level
    auth_level access_level_type NOT NULL DEFAULT 'read_write', -- Strong typed access level
    auth_verified_at TIMESTAMPTZ,
    auth_verification_status verification_status_type DEFAULT 'unverified', -- Strong typed verification
    auth_method TEXT, -- 'file_extraction', 'manual_entry', 'id_verification', 'bank_verification'

    -- Profile Lifecycle
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    transferred_from UUID REFERENCES user_profiles(id) ON DELETE SET NULL, -- For profile transfers
    transferred_to UUID REFERENCES user_profiles(id) ON DELETE SET NULL,

    -- Enhanced Archival System (GPT-5 & Gemini recommended)
    archived BOOLEAN NOT NULL DEFAULT FALSE, -- Legacy compatibility
    archived_at TIMESTAMPTZ, -- When archival occurred
    archived_by UUID REFERENCES auth.users(id) ON DELETE SET NULL, -- Who initiated archival
    archival_reason TEXT, -- User-provided deletion reason
    recovery_expires_at TIMESTAMPTZ, -- 30-day recovery window
    processing_restricted_at TIMESTAMPTZ, -- GDPR Article 18 compliance
    legal_hold BOOLEAN DEFAULT FALSE, -- Prevents any purge during litigation
    erasure_performed_at TIMESTAMPTZ, -- When PII was purged
    erasure_scope TEXT, -- 'pii_only', 'analytics_only', 'full_restriction'
    region_of_record TEXT, -- 'AU', 'US', 'EU' for jurisdiction-specific handling

    -- Universal Date Format Management (From Migration 01)
    date_preferences JSONB DEFAULT '{
        "preferred_format": "DD/MM/YYYY",
        "home_country": "AU",
        "timezone": "Australia/Sydney",
        "show_confidence_badges": true,
        "format_switching_enabled": true,
        "confidence_threshold_for_badges": 0.7
    }'::jsonb,

    -- Pregnancy Feature Support
    is_pregnancy_profile BOOLEAN DEFAULT FALSE,
    expected_due_date DATE,
    transitioned_to_child_profile_id UUID REFERENCES user_profiles(id)
);
```

## AI Extraction Requirements for Pass 2

Extract user profile and demographic information from medical documents including patient identity, date of birth, and profile characteristics.

### Required Fields

```typescript
interface UserProfilesExtraction {
  // REQUIRED FIELDS
  account_owner_id: string;                // UUID - from authentication context (NOT extracted from document)
  profile_type: 'self' | 'child' | 'pet' | 'dependent';
  display_name: string;                    // Name displayed in UI

  // PROFILE IDENTITY (OPTIONAL)
  profile_status?: 'active' | 'inactive' | 'pending_transfer'; // Default: 'active'
  full_name?: string;                      // Complete legal name
  date_of_birth?: string;                  // ISO 8601 DATE format
  species?: string;                        // For pet profiles only
  breed?: string;                          // For pet profiles only

  // RELATIONSHIP (OPTIONAL)
  relationship?: string;                   // Uses profile_relationship_type enum (custom type)
  legal_status?: 'guardian' | 'parent' | 'caregiver' | 'self' | 'owner';

  // PROFILE CUSTOMIZATION (OPTIONAL)
  theme_color?: string;                    // Default: '#2563eb'
  avatar_url?: string;                     // URL to profile image
  custom_theme?: object;                   // JSONB object, default: {}
  profile_icon?: string;                   // Icon identifier

  // AUTHENTICATION LEVEL (OPTIONAL)
  auth_level?: string;                     // Uses access_level_type enum, default: 'read_write'
  auth_verified_at?: string;               // ISO 8601 TIMESTAMPTZ
  auth_verification_status?: string;       // Uses verification_status_type enum, default: 'unverified'
  auth_method?: string;                    // 'file_extraction', 'manual_entry', 'id_verification', 'bank_verification'

  // PROFILE TRANSFER (OPTIONAL)
  transferred_from?: string;               // UUID of source profile
  transferred_to?: string;                 // UUID of destination profile

  // ARCHIVAL SYSTEM (OPTIONAL)
  archived?: boolean;                      // Default: false
  archived_at?: string;                    // ISO 8601 TIMESTAMPTZ
  archived_by?: string;                    // UUID - auth.users reference
  archival_reason?: string;                // User-provided reason
  recovery_expires_at?: string;            // ISO 8601 TIMESTAMPTZ (30-day window)
  processing_restricted_at?: string;       // ISO 8601 TIMESTAMPTZ (GDPR Article 18)
  legal_hold?: boolean;                    // Default: false
  erasure_performed_at?: string;           // ISO 8601 TIMESTAMPTZ
  erasure_scope?: string;                  // 'pii_only', 'analytics_only', 'full_restriction'
  region_of_record?: string;               // 'AU', 'US', 'EU'

  // DATE PREFERENCES (OPTIONAL)
  date_preferences?: {                     // JSONB object with defaults
    preferred_format?: string;             // Default: 'DD/MM/YYYY'
    home_country?: string;                 // Default: 'AU'
    timezone?: string;                     // Default: 'Australia/Sydney'
    show_confidence_badges?: boolean;      // Default: true
    format_switching_enabled?: boolean;    // Default: true
    confidence_threshold_for_badges?: number; // Default: 0.7
  };

  // PREGNANCY FEATURE (OPTIONAL)
  is_pregnancy_profile?: boolean;          // Default: false
  expected_due_date?: string;              // ISO 8601 DATE
  transitioned_to_child_profile_id?: string; // UUID reference
}
```

## Profile Type Values

- **self**: Primary account owner's own profile
- **child**: Child or minor dependent profile
- **pet**: Pet or animal profile
- **dependent**: Other dependent (elderly parent, etc.)

## Profile Status Values

- **active**: Currently active profile (default)
- **inactive**: Profile deactivated but retained
- **pending_transfer**: Profile in process of being transferred to another account

## Legal Status Values

- **guardian**: Legal guardian of the profile subject
- **parent**: Biological or adoptive parent
- **caregiver**: Designated caregiver
- **self**: Profile is for oneself
- **owner**: Owner (for pet profiles)

## Example Extractions

### Example 1: Self Profile from Medical Document
```json
{
  "account_owner_id": "uuid-from-auth-context",
  "profile_type": "self",
  "display_name": "Sarah Johnson",
  "full_name": "Sarah Marie Johnson",
  "date_of_birth": "1985-03-15",
  "legal_status": "self",
  "profile_status": "active",
  "region_of_record": "AU",
  "date_preferences": {
    "preferred_format": "DD/MM/YYYY",
    "home_country": "AU",
    "timezone": "Australia/Sydney"
  }
}
```

### Example 2: Child Profile from Medical Document
```json
{
  "account_owner_id": "uuid-from-auth-context",
  "profile_type": "child",
  "display_name": "Emma Johnson",
  "full_name": "Emma Grace Johnson",
  "date_of_birth": "2018-07-22",
  "legal_status": "parent",
  "profile_status": "active",
  "region_of_record": "AU"
}
```

### Example 3: Pet Profile from Veterinary Document
```json
{
  "account_owner_id": "uuid-from-auth-context",
  "profile_type": "pet",
  "display_name": "Max",
  "full_name": "Max Johnson",
  "date_of_birth": "2020-05-10",
  "species": "dog",
  "breed": "Golden Retriever",
  "legal_status": "owner",
  "profile_status": "active"
}
```

## Critical Notes

1. **NO patient_id Column**: This table is `user_profiles`, NOT a clinical detail table. It uses `id` as primary key and does NOT have patient_id or event_id columns.

2. **Custom Enum Types**: Several fields use PostgreSQL custom enum types (profile_relationship_type, access_level_type, verification_status_type) which are defined elsewhere in the schema. For AI extraction, treat these as text strings.

3. **Required Fields**: Only 3 NOT NULL fields without defaults: account_owner_id, profile_type, display_name. Profile_status has default 'active'.

4. **JSONB Fields**:
   - `custom_theme`: Default empty object {}
   - `date_preferences`: Default comprehensive object with Australian locale settings

5. **Date vs TIMESTAMPTZ**:
   - `date_of_birth` and `expected_due_date` are DATE (no time)
   - All other temporal fields are TIMESTAMPTZ (with timezone)

6. **Self-Referential FKs**: transferred_from, transferred_to, and transitioned_to_child_profile_id reference user_profiles(id)

7. **Enhanced Archival System**: Complex GDPR-compliant archival with recovery windows, legal holds, and erasure tracking. Most fields optional and context-dependent.

8. **Pet-Specific Fields**: `species` and `breed` only apply when profile_type='pet'

9. **Pregnancy Feature**: `is_pregnancy_profile`, `expected_due_date`, and `transitioned_to_child_profile_id` support pregnancy tracking with profile transition to child profile after birth.

10. **Region Tracking**: `region_of_record` tracks jurisdiction ('AU', 'US', 'EU') for compliance and legal requirements.

11. **NOT an AI Processing Table**: This table is primarily populated through user registration and profile creation, NOT typically from AI document extraction. However, demographic data (name, DOB) may be extracted and used to verify/update profile information.

## Schema Validation Checklist

- [ ] `account_owner_id` is a valid UUID (from auth context, NOT extracted)
- [ ] `profile_type` is one of: 'self', 'child', 'pet', 'dependent' (NOT NULL)
- [ ] `display_name` is provided (NOT NULL)
- [ ] `profile_status` (if provided) is one of: 'active', 'inactive', 'pending_transfer'
- [ ] `legal_status` (if provided) is one of: 'guardian', 'parent', 'caregiver', 'self', 'owner'
- [ ] `date_of_birth` (if provided) is valid ISO 8601 DATE format
- [ ] `date_preferences` (if provided) is valid JSONB object
- [ ] `custom_theme` (if provided) is valid JSONB object
- [ ] For pet profiles: `species` and/or `breed` populated appropriately
- [ ] For pregnancy profiles: `is_pregnancy_profile=true` with `expected_due_date`
- [ ] All TIMESTAMPTZ fields use ISO 8601 format with timezone
- [ ] Self-referential UUIDs reference valid user_profiles records

## Database Constraint Notes

- **NO patient_id or event_id**: This is NOT a clinical detail table
- **profile_type CHECK constraint**: Database enforces 4 specific values
- **profile_status CHECK constraint**: Database enforces 3 specific values with default 'active'
- **legal_status CHECK constraint**: Database enforces 5 specific values
- **NOT NULL constraints**: account_owner_id, profile_type, display_name, profile_status (with default), archived (with default), created_at, updated_at, auth_level (with default)
- **JSONB defaults**: custom_theme defaults to {}, date_preferences has comprehensive default object
- **Self-referential FKs**: transferred_from, transferred_to, transitioned_to_child_profile_id all ON DELETE SET NULL
- **FK to auth.users**: account_owner_id and archived_by reference auth.users(id)
- **Boolean defaults**: archived defaults to FALSE, legal_hold defaults to FALSE, is_pregnancy_profile defaults to FALSE
