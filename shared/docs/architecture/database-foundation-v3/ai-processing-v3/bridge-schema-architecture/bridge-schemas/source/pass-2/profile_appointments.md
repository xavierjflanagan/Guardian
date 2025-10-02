# profile_appointments Bridge Schema (Source) - Pass 2

**Status:** ✅ Created from Database Schema
**Database Source:** /current_schema/02_profiles.sql (lines 288-318)
**Last Updated:** 1 October 2025
**Priority:** HIGH - Appointment scheduling and visit tracking

## Database Table Structure

```sql
-- Profile appointments and healthcare visit scheduling
CREATE TABLE profile_appointments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id UUID NOT NULL REFERENCES user_profiles(id),
    account_owner_id UUID NOT NULL REFERENCES auth.users(id), -- Denormalized for performance

    -- Appointment details
    appointment_date TIMESTAMPTZ NOT NULL,
    appointment_type TEXT NOT NULL,
    provider_name TEXT,
    facility_name TEXT,
    appointment_duration_minutes INTEGER,

    -- Status tracking
    status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'confirmed', 'completed', 'cancelled', 'no_show')),

    -- Appointment details
    chief_complaint TEXT,
    appointment_notes TEXT,
    reminder_preferences JSONB DEFAULT '{}',

    -- Visibility settings
    visible_to_primary_account BOOLEAN DEFAULT TRUE,
    requires_guardian_consent BOOLEAN DEFAULT FALSE,

    -- Integration
    calendar_event_id TEXT, -- External calendar integration
    provider_system_id TEXT, -- Provider's appointment system ID

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

## AI Extraction Requirements for Pass 2

Extract appointment and healthcare visit scheduling information from medical documents including appointment dates, providers, facilities, and visit types.

### Required Fields

```typescript
interface ProfileAppointmentsExtraction {
  // REQUIRED FIELDS
  profile_id: string;                      // UUID - from processing context
  account_owner_id: string;                // UUID - from authentication context (denormalized)
  appointment_date: string;                // ISO 8601 TIMESTAMPTZ format
  appointment_type: string;                // Type of appointment

  // APPOINTMENT DETAILS (OPTIONAL)
  provider_name?: string;                  // Healthcare provider name
  facility_name?: string;                  // Healthcare facility name
  appointment_duration_minutes?: number;   // Duration in minutes

  // STATUS TRACKING (OPTIONAL)
  status?: 'scheduled' | 'confirmed' | 'completed' | 'cancelled' | 'no_show'; // Default: 'scheduled'

  // APPOINTMENT CONTEXT (OPTIONAL)
  chief_complaint?: string;                // Reason for appointment
  appointment_notes?: string;              // Additional appointment notes
  reminder_preferences?: object;           // JSONB object for reminder settings, default: {}

  // VISIBILITY SETTINGS (OPTIONAL)
  visible_to_primary_account?: boolean;    // Default: true
  requires_guardian_consent?: boolean;     // Default: false

  // INTEGRATION (OPTIONAL)
  calendar_event_id?: string;              // External calendar system ID
  provider_system_id?: string;             // Provider's appointment system ID
}
```

## Appointment Status Values

- **scheduled**: Appointment scheduled but not yet confirmed
- **confirmed**: Appointment confirmed by provider or patient
- **completed**: Appointment completed
- **cancelled**: Appointment cancelled
- **no_show**: Patient did not show up for appointment

## Example Extractions

### Example 1: Scheduled Medical Appointment
```json
{
  "profile_id": "uuid-from-context",
  "account_owner_id": "uuid-from-auth-context",
  "appointment_date": "2025-10-15T14:30:00Z",
  "appointment_type": "General Checkup",
  "provider_name": "Dr. Sarah Johnson",
  "facility_name": "City Medical Center",
  "appointment_duration_minutes": 30,
  "status": "scheduled",
  "chief_complaint": "Annual physical examination",
  "visible_to_primary_account": true,
  "requires_guardian_consent": false
}
```

### Example 2: Specialist Appointment
```json
{
  "profile_id": "uuid-from-context",
  "account_owner_id": "uuid-from-auth-context",
  "appointment_date": "2025-10-20T10:00:00Z",
  "appointment_type": "Cardiology Consultation",
  "provider_name": "Dr. Michael Chen, Cardiologist",
  "facility_name": "Heart Health Specialists",
  "appointment_duration_minutes": 60,
  "status": "confirmed",
  "chief_complaint": "Follow-up for hypertension management",
  "appointment_notes": "Bring recent blood pressure readings",
  "visible_to_primary_account": true
}
```

### Example 3: Pediatric Appointment
```json
{
  "profile_id": "uuid-from-context",
  "account_owner_id": "uuid-from-auth-context",
  "appointment_date": "2025-10-25T09:00:00Z",
  "appointment_type": "Pediatric Vaccination",
  "provider_name": "Dr. Emily Williams, Pediatrician",
  "facility_name": "Children's Health Clinic",
  "appointment_duration_minutes": 15,
  "status": "scheduled",
  "chief_complaint": "18-month vaccination",
  "visible_to_primary_account": true,
  "requires_guardian_consent": true
}
```

## Critical Notes

1. **NO patient_id or event_id**: This table uses `profile_id`, NOT patient_id. It references user_profiles(id) directly.

2. **Denormalized account_owner_id**: The `account_owner_id` is denormalized for performance (noted in database comment). Both profile_id and account_owner_id are NOT NULL.

3. **Required Fields**: Only 4 NOT NULL fields without defaults: profile_id, account_owner_id, appointment_date, appointment_type. Status has default 'scheduled'.

4. **Status CHECK Constraint**: Database enforces 5 status values: 'scheduled', 'confirmed', 'completed', 'cancelled', 'no_show'.

5. **TIMESTAMPTZ Field**: `appointment_date` is TIMESTAMPTZ (includes date, time, and timezone). This is NOT a DATE field.

6. **JSONB Field**: `reminder_preferences` is JSONB object with default empty object {}.

7. **Integer Duration**: `appointment_duration_minutes` is INTEGER type, representing duration in minutes.

8. **Boolean Defaults**:
   - `visible_to_primary_account` defaults to TRUE
   - `requires_guardian_consent` defaults to FALSE

9. **Integration Fields**: `calendar_event_id` and `provider_system_id` support external system integration.

10. **NOT Typically AI-Extracted**: This table is primarily populated through appointment scheduling workflows, NOT from AI document extraction. However, appointment information may be extracted from medical documents (e.g., referral letters, appointment confirmations) and used to create/update appointment records.

11. **Chief Complaint vs Appointment Notes**:
    - `chief_complaint`: Primary reason for appointment (clinical)
    - `appointment_notes`: General notes about the appointment (administrative)

## Schema Validation Checklist

- [ ] `profile_id` is a valid UUID (from context, NOT NULL)
- [ ] `account_owner_id` is a valid UUID (from auth context, NOT NULL)
- [ ] `appointment_date` is valid ISO 8601 TIMESTAMPTZ format (NOT NULL)
- [ ] `appointment_type` is provided (NOT NULL)
- [ ] `status` (if provided) is one of: 'scheduled', 'confirmed', 'completed', 'cancelled', 'no_show'
- [ ] `appointment_duration_minutes` (if provided) is a valid integer
- [ ] `reminder_preferences` (if provided) is valid JSONB object
- [ ] Boolean fields use true/false (not 1/0 or other values)
- [ ] For child/dependent appointments: Consider setting `requires_guardian_consent=true`

## Database Constraint Notes

- **NO patient_id or event_id**: Uses profile_id to reference user_profiles(id)
- **Denormalized FK**: Both profile_id and account_owner_id are NOT NULL FKs (performance optimization)
- **status CHECK constraint**: Database enforces 5 specific values with default 'scheduled'
- **NOT NULL constraints**: profile_id, account_owner_id, appointment_date, appointment_type, status (with default), created_at, updated_at
- **JSONB default**: reminder_preferences defaults to {}
- **Boolean defaults**: visible_to_primary_account defaults to TRUE, requires_guardian_consent defaults to FALSE
- **FK references**: profile_id → user_profiles(id), account_owner_id → auth.users(id)
- **TIMESTAMPTZ fields**: appointment_date, created_at, updated_at all include timezone information
