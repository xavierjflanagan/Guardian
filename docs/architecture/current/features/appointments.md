# Appointments & Scheduling Module (Guardian v7)

**Status:** Draft  
**Last updated:** 2025-07-30

> **Purpose** – Record appointments that patients or documents indicate have already been organised elsewhere. The module is *not* a live booking engine.

## 1. Overview

Guardian already stores what *actually happened* (clinical events and encounters). This module stores what is *planned* to happen so the Healthcare-Journey timeline can:

* show upcoming visits,
* send reminders, and
* later link the appointment to the encounter that realises it.

The same table supports three creation sources:

1. Document extraction (letters, discharge summaries, etc.)  
2. Patient manual entry ("Add upcoming appointment")  
3. Staff or API import

---

## 2. Core Tables

### 2.1 `user_appointments`

```sql
CREATE TABLE user_appointments (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id          UUID NOT NULL REFERENCES auth.users(id),
    facility_id         UUID REFERENCES healthcare_facilities(id),

    -- Time and zone
    scheduled_start     TIMESTAMPTZ NOT NULL,
    scheduled_end       TIMESTAMPTZ,        -- optional
    timezone            TEXT,               -- IANA zone of the facility
    scheduled_range     tstzrange GENERATED ALWAYS AS
                         (tstzrange(scheduled_start,
                                    COALESCE(scheduled_end, scheduled_start + INTERVAL '1 hour'),
                                    '[)')) STORED,

    -- Classification
    appointment_type    TEXT,               -- 'telehealth','in_person','home_visit','pickup', …
    service_category    TEXT,               -- 'primary_care','physiotherapy','lab_test', …
    purpose             TEXT,               -- free-text reason
    
    -- Provider Information
    provider_name       TEXT,               -- 'Dr. Sarah Johnson', 'Heart Care Center'
    specialty           TEXT,               -- 'Cardiology', 'Family Medicine'
    facility_name       TEXT,               -- 'Boston Medical Center'

    -- Life-cycle
    status              TEXT NOT NULL CHECK (status IN
                         ('logged','confirmed','checked_in','completed','no_show','cancelled')),

    -- Evidence strength
    verification_level  TEXT NOT NULL DEFAULT 'unverified' CHECK (verification_level IN
                         ('unverified','user_confirmed','user_modified','doc_linked','encounter_linked')),

    -- Provenance
    origin              TEXT NOT NULL DEFAULT 'extracted',   -- 'extracted','user','staff','api'
    source_document_id  UUID REFERENCES documents(id),
    extraction_confidence NUMERIC(4,3),
    extracted_by_model  TEXT,

    -- Creation context
    created_by          UUID REFERENCES auth.users(id),
    created_channel     TEXT,               -- 'mobile_app','web','import', …

    -- Encounter linkage
    encounter_id        UUID REFERENCES healthcare_encounters(id),

    -- Patient Experience Features
    patient_notes       TEXT,               -- Personal appointment notes and preparation
    preparation_instructions TEXT,          -- What patient needs to do beforehand
    importance_level    TEXT DEFAULT 'normal' CHECK (importance_level IN 
                         ('low','normal','high','urgent')),
    
    -- Location and Contact Details
    location_address    TEXT,               -- Full address for appointment
    location_notes      TEXT,               -- Parking, entrance, room number details
    contact_phone       TEXT,               -- Phone for rescheduling/questions
    contact_email       TEXT,               -- Email for appointment updates
    
    -- Reminder Preferences
    reminder_settings   JSONB DEFAULT '{"email": true, "sms": false, "push": true, "hours_before": [24, 2]}'::jsonb,
    last_reminder_sent  TIMESTAMPTZ,        -- Track reminder delivery
    
    -- Historical Linkage & AI Inference
    requires_user_confirmation BOOLEAN DEFAULT FALSE,  -- AI-inferred details need user verification
    historical_template_id UUID REFERENCES user_appointments(id),  -- Source appointment for inferred details
    inferred_details    JSONB,              -- Track which fields were AI-inferred vs extracted
    confidence_breakdown JSONB,             -- Per-field confidence scores
    
    -- Conflict flag
    has_conflict        BOOLEAN NOT NULL DEFAULT FALSE,

    -- Audit
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**Indexes**

```sql
CREATE INDEX idx_user_appt_patient    ON user_appointments(patient_id);
CREATE INDEX idx_user_appt_facility  ON user_appointments(facility_id);
CREATE INDEX idx_user_appt_start     ON user_appointments(scheduled_start);
CREATE INDEX idx_user_appt_status    ON user_appointments(status);
CREATE INDEX idx_user_appt_timeline  ON user_appointments(patient_id, scheduled_start)
    WHERE status IN ('logged','confirmed','checked_in');
CREATE INDEX idx_user_appt_importance ON user_appointments(patient_id, importance_level, scheduled_start)
    WHERE importance_level IN ('high','urgent');
CREATE INDEX idx_user_appt_reminders  ON user_appointments(scheduled_start, last_reminder_sent)
    WHERE status IN ('logged','confirmed') AND reminder_settings IS NOT NULL;
CREATE INDEX idx_user_appt_confirmation ON user_appointments(patient_id, requires_user_confirmation)
    WHERE requires_user_confirmation = TRUE;
CREATE INDEX idx_user_appt_historical ON user_appointments(historical_template_id)
    WHERE historical_template_id IS NOT NULL;
```

### 2.2 `healthcare_providers` (Search Support)

*Provider directory for search functionality and data consistency*

```sql
CREATE TABLE healthcare_providers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Provider Identity
    full_name TEXT NOT NULL,
    title TEXT, -- 'Dr.', 'NP', 'PA'
    specialty TEXT, -- 'Cardiology', 'Family Medicine'
    subspecialty TEXT, -- 'Interventional Cardiology', 'Sports Medicine'
    
    -- Contact Information
    primary_phone TEXT,
    email TEXT,
    
    -- Search Optimization
    search_terms TEXT[], -- Alternative names, nicknames
    npi_number TEXT, -- National Provider Identifier
    
    -- Status
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Full-text search index for provider lookup
CREATE INDEX idx_healthcare_providers_search 
ON healthcare_providers USING GIN(to_tsvector('english', full_name || ' ' || COALESCE(specialty, '') || ' ' || array_to_string(search_terms, ' ')))
WHERE is_active = TRUE;

CREATE INDEX idx_healthcare_providers_specialty ON healthcare_providers(specialty) WHERE is_active = TRUE;
```

### 2.3 `healthcare_facilities` (Search Support)

```sql
CREATE TABLE healthcare_facilities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Facility Identity
    facility_name TEXT NOT NULL,
    facility_type TEXT, -- 'hospital', 'clinic', 'urgent_care', 'lab'
    parent_organization TEXT, -- 'Mayo Clinic', 'Kaiser Permanente'
    
    -- Location Details
    address TEXT NOT NULL,
    city TEXT NOT NULL,
    state TEXT NOT NULL,
    zip_code TEXT,
    country TEXT DEFAULT 'US',
    
    -- Contact Information
    main_phone TEXT,
    appointment_phone TEXT,
    website TEXT,
    
    -- Additional Details
    parking_info TEXT,
    public_transport_notes TEXT,
    accessibility_notes TEXT,
    
    -- Search Optimization
    search_terms TEXT[], -- Alternative names
    
    -- Status
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Geographic and search indexes
CREATE INDEX idx_healthcare_facilities_location ON healthcare_facilities(city, state) WHERE is_active = TRUE;
CREATE INDEX idx_healthcare_facilities_search 
ON healthcare_facilities USING GIN(to_tsvector('english', facility_name || ' ' || address || ' ' || array_to_string(search_terms, ' ')))
WHERE is_active = TRUE;
```

### 2.4 `provider_facility_affiliations`

*Links providers to their practice locations*

```sql
CREATE TABLE provider_facility_affiliations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_id UUID NOT NULL REFERENCES healthcare_providers(id),
    facility_id UUID NOT NULL REFERENCES healthcare_facilities(id),
    
    -- Affiliation Details
    is_primary_location BOOLEAN DEFAULT FALSE,
    department TEXT, -- 'Cardiology Department', 'Emergency Medicine'
    office_hours TEXT, -- 'Mon-Fri 9AM-5PM'
    appointment_phone TEXT, -- Direct booking line
    
    -- Status
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    UNIQUE(provider_id, facility_id)
);

CREATE INDEX idx_provider_affiliations_provider ON provider_facility_affiliations(provider_id) WHERE is_active = TRUE;
CREATE INDEX idx_provider_affiliations_facility ON provider_facility_affiliations(facility_id) WHERE is_active = TRUE;
```

### 2.5 `appointment_participants` (optional)

```sql
CREATE TABLE appointment_participants (
    appointment_id      UUID NOT NULL REFERENCES user_appointments(id) ON DELETE CASCADE,
    user_id             UUID NOT NULL REFERENCES auth.users(id),
    participant_role    TEXT,     -- 'patient','gp','specialist','nurse','caregiver', …
    PRIMARY KEY (appointment_id, user_id)
);
```

### 2.3 `appointment_status_history` (optional)

Stores each status transition for analytics and audit.

---

## 3. Workflow Touch-points

### 3.1 Document-Driven Extraction

1. **AI Vision Analysis**: Ingestion pipeline detects appointment information from various document types:
   - Discharge summaries: "Follow-up with cardiology in 2 weeks"
   - Appointment cards: Full details including address, phone, preparation
   - Referral letters: Provider details, specialties, contact information
   - Test requisitions: "Return for results on Friday at 2pm"

2. **Enhanced Extraction Service** returns comprehensive appointment data:
   ```json
   {
     "basic_details": {
       "date": "2025-10-12", "time": "10:00", "timezone": "America/New_York",
       "purpose": "Cardiology follow-up", "appointment_type": "in_person"
     },
     "provider_info": {
       "provider_name": "Dr. Sarah Johnson", "specialty": "Cardiology",
       "facility_name": "Heart Care Center"
     },
     "location_details": {
       "address": "123 Medical Plaza, Suite 400, Boston MA 02101",
       "phone": "(617) 555-0123", "parking": "Validated parking available"
     },
     "preparation": {
       "instructions": "Bring current medications list, fast for 4 hours",
       "forms_needed": ["Insurance card", "Photo ID"]
     },
     "confidence": 0.89
   }
   ```

3. **Smart Field Mapping**: AI extraction populates all available fields:
   * Basic appointment details → core appointment fields
   * **Location info** → `location_address`, `location_notes`, `contact_phone`
   * **Preparation** → `preparation_instructions` 
   * **Provider details** → `provider_name`, `specialty`, `facility_name`

4. **Intelligent Historical Linkage**: AI performs smart appointment pattern matching:

   **Example Scenario**: GP letter states "yearly cardiology appointment on March 15, 2026"
   
   ```sql
   -- AI queries for historical cardiology appointments
   SELECT ua.*, hf.address, hf.main_phone, hp.full_name
   FROM user_appointments ua
   LEFT JOIN healthcare_facilities hf ON ua.facility_id = hf.id
   LEFT JOIN healthcare_providers hp ON ua.provider_name = hp.full_name
   WHERE ua.patient_id = $1
   AND (ua.specialty ILIKE '%cardiology%' OR ua.service_category ILIKE '%cardiology%')
   AND ua.status = 'completed'
   ORDER BY ua.scheduled_start DESC
   LIMIT 3;  -- Get 3 most recent cardiology appointments
   ```

   **AI Processing Logic**:
   - ✅ **Pattern Detection**: Recognizes "yearly cardiology appointment" = recurring pattern
   - ✅ **Historical Analysis**: Finds previous cardiology appointments with same provider/facility
   - ✅ **Smart Pre-filling**: Uses most recent cardiology appointment details as template
   - ✅ **Confidence Assessment**: Flags for user confirmation if details are inferred

   **Appointment Creation**:
   ```sql
   INSERT INTO user_appointments (
       user_id, scheduled_start, purpose, appointment_type,
       provider_name, specialty, facility_name,
       location_address, contact_phone, 
       -- Pre-filled from historical data
       origin, extraction_confidence, requires_user_confirmation,
       historical_template_id, inferred_details
   ) VALUES (
       $patient_id, '2026-03-15 10:00:00', 'Yearly cardiology follow-up', 'in_person',
       'Dr. Sarah Johnson', 'Cardiology', 'Heart Care Center',
       '123 Medical Plaza, Boston MA', '(617) 555-0123',
       'extracted', 0.75, TRUE,  -- Lower confidence = user confirmation needed
       $previous_cardiology_appointment_id,
       '{"provider": "inferred_from_history", "address": "inferred_from_history"}'::jsonb
   );
   ```

5. **User Confirmation Workflow**: System prompts user to verify inferred details:
   - Shows extracted appointment with highlighted inferred fields
   - Displays historical appointment for comparison
   - User can confirm, modify, or reject the pre-filled information

6. **Quality Control**: Low-confidence extractions (< 0.90) go to review queue
7. **Verification Workflow**: When matching documents/encounters appear, `verification_level` promotes to `doc_linked` or `encounter_linked`

### 3.2 Patient-Added Logging

**Smart Provider/Facility Search Workflow:**

1. **Provider Search**: Patient types "Dr. John Smith" or "cardiology"
   ```sql
   -- Provider search query
   SELECT p.id, p.full_name, p.specialty, p.title,
          f.facility_name, f.address, f.main_phone
   FROM healthcare_providers p
   JOIN provider_facility_affiliations pfa ON p.id = pfa.provider_id
   JOIN healthcare_facilities f ON pfa.facility_id = f.id
   WHERE to_tsvector('english', p.full_name || ' ' || COALESCE(p.specialty, '')) 
         @@ plainto_tsquery('english', 'john smith cardiology')
   AND p.is_active = TRUE AND f.is_active = TRUE AND pfa.is_active = TRUE
   ORDER BY ts_rank_cd(to_tsvector('english', p.full_name), plainto_tsquery('john smith')) DESC;
   ```

2. **Facility Search**: Patient searches "Heart Center Boston" or by address
   ```sql
   -- Facility search query  
   SELECT f.id, f.facility_name, f.address, f.main_phone, f.parking_info,
          COUNT(p.id) as provider_count
   FROM healthcare_facilities f
   LEFT JOIN provider_facility_affiliations pfa ON f.id = pfa.facility_id
   LEFT JOIN healthcare_providers p ON pfa.provider_id = p.id AND p.is_active = TRUE
   WHERE to_tsvector('english', f.facility_name || ' ' || f.address) 
         @@ plainto_tsquery('english', 'heart center boston')
   AND f.is_active = TRUE
   GROUP BY f.id, f.facility_name, f.address, f.main_phone, f.parking_info
   ORDER BY ts_rank_cd(to_tsvector('english', f.facility_name), plainto_tsquery('heart center')) DESC;
   ```

3. **Auto-populate from Selection**: When patient selects provider/facility:
   * **Provider selection** → Auto-fills `provider_name`, `specialty`, shows all their locations to choose from
   * **Facility selection** → Auto-fills `location_address`, `contact_phone`, `parking_info`
   * **Manual entry option** → Always available as fallback

4. **Appointment Creation**:
   * Patient completes form with personal notes, importance level, reminder preferences
   * System calls `check_appointment_conflict` RPC (section 5)
   * Creates appointment with `origin = 'user'`, `verification_level = 'unverified'`

**Search Features:**
- 🔍 **Smart Autocomplete**: Real-time suggestions as patient types
- 📍 **Location-based**: "Show providers within 20 miles"  
- 🏥 **Specialty Filtering**: "Cardiologists near me"
- 📋 **Recent Providers**: Show patient's previous providers first
- ✏️ **Manual Override**: Always option to enter details manually

### 3.3 Staff / API Import

Rows inserted with `origin = 'staff'` or `origin = 'api'` follow the same life-cycle.

---

## 4. User Confirmation Workflow for AI-Inferred Appointments

### 4.1 Confirmation UI Flow

When AI creates an appointment with inferred details, the system presents a confirmation interface:

```sql
-- Query for appointments requiring user confirmation
SELECT 
    ua.id, ua.scheduled_start, ua.purpose, ua.provider_name, ua.facility_name,
    ua.location_address, ua.contact_phone, ua.inferred_details, ua.confidence_breakdown,
    
    -- Historical template data for comparison
    template.scheduled_start as last_appointment_date,
    template.provider_name as last_provider,
    template.location_address as last_address,
    template.contact_phone as last_phone,
    
    -- Source document context
    d.filename as source_document,
    cfs.source_text as extracted_text
FROM user_appointments ua
LEFT JOIN user_appointments template ON ua.historical_template_id = template.id
LEFT JOIN documents d ON ua.source_document_id = d.id
LEFT JOIN clinical_fact_sources cfs ON cfs.document_id = d.id
WHERE ua.patient_id = $1 AND ua.requires_user_confirmation = TRUE
ORDER BY ua.created_at DESC;
```

**Confirmation Interface Example:**
```
┌─ Confirm Appointment Details ─────────────────┐
│ 📄 Found in: GP Letter (July 28, 2025)       │
│ 💬 "yearly cardiology appointment March 15"  │
│                                              │
│ 🤖 AI Suggestion (75% confidence):           │
│ ┌──────────────────────────────────────────┐ │
│ │ 📅 March 15, 2026 (time unknown)        │ │
│ │ 👨‍⚕️ Dr. Sarah Johnson - Cardiology      │ │
│ │ 🏥 Heart Care Center                     │ │
│ │ 📍 123 Medical Plaza, Boston MA         │ │
│ │ 📞 (617) 555-0123                       │ │
│ └──────────────────────────────────────────┘ │
│                                              │
│ 🕐 Based on your last cardiology visit:      │
│ ┌──────────────────────────────────────────┐ │
│ │ 📅 March 18, 2025 - 2:00 PM             │ │
│ │ 👨‍⚕️ Dr. Sarah Johnson - Cardiology      │ │
│ │ 🏥 Heart Care Center                     │ │
│ │ 📍 123 Medical Plaza, Boston MA         │ │
│ └──────────────────────────────────────────┘ │
│                                              │
│ [✅ Confirm] [✏️ Edit Details] [❌ Reject]    │
└──────────────────────────────────────────────┘
```

### 4.2 Confirmation Actions

```sql
-- User confirms AI suggestion
UPDATE user_appointments 
SET requires_user_confirmation = FALSE,
    verification_level = 'user_confirmed',
    confidence_score = 0.95  -- Boost confidence after user confirmation
WHERE id = $appointment_id AND patient_id = $patient_id;

-- User modifies details before confirming
UPDATE user_appointments 
SET provider_name = $new_provider,
    contact_phone = $new_phone,
    requires_user_confirmation = FALSE,
    verification_level = 'user_modified',
    confidence_score = 1.0,  -- Perfect confidence for user-entered data
    inferred_details = jsonb_set(inferred_details, '{user_modifications}', 'true')
WHERE id = $appointment_id AND patient_id = $patient_id;

-- User rejects AI suggestion
UPDATE user_appointments 
SET archived = TRUE,
    archived_reason = 'rejected_by_user',
    archived_at = NOW()
WHERE id = $appointment_id AND patient_id = $patient_id;
```

## 5. Verification Level and Timeline Display

| verification_level | Icon suggestion | Meaning |
|--------------------|-----------------|---------|
| `unverified`       | hollow circle   | Evidence pending |
| `user_confirmed`   | checkmark circle| User confirmed AI-inferred appointment |
| `user_modified`    | edit circle     | User modified AI suggestion before confirming |
| `doc_linked`       | half-filled     | Document mentions the appointment |
| `encounter_linked` | solid circle    | Appointment realised in an encounter |

**Smart Appointment Indicators:**
- 🤖 **AI Inferred**: Shows when details were inferred from historical appointments
- ⚠️ **Needs Confirmation**: Prominent indicator for appointments requiring user verification
- ✅ **User Verified**: Clear indication that user has confirmed AI suggestions
- 📄 **Document Linked**: Shows source document when available

The Healthcare-Journey timeline queries `user_appointments` (statuses `logged`, `confirmed`, `checked_in`) and `patient_clinical_events`, ordering by `scheduled_start` and `event_date`.

---

## 5. Conflict Detection

Generated column `scheduled_range` enables efficient overlap checks.

### 5.1 RPC helper

```sql
CREATE OR REPLACE FUNCTION check_appointment_conflict(
    _user_id uuid,
    _new_start  timestamptz,
    _new_end    timestamptz)
RETURNS integer AS $$
SELECT COUNT(*) FROM user_appointments
 WHERE user_id = _user_id
   AND tstzrange(_new_start, _new_end, '[)') && scheduled_range
   AND status IN ('logged','confirmed','checked_in');
$$ LANGUAGE sql STABLE;
```

### 5.2 Conflict flag trigger

```sql
CREATE OR REPLACE FUNCTION flag_conflict() RETURNS trigger AS $$
BEGIN
    NEW.has_conflict := EXISTS (
        SELECT 1 FROM user_appointments
         WHERE user_id = NEW.user_id
           AND scheduled_range && NEW.scheduled_range
           AND id <> NEW.id
           AND status IN ('logged','confirmed','checked_in'));
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_flag_conflict
BEFORE INSERT OR UPDATE ON user_appointments
FOR EACH ROW EXECUTE FUNCTION flag_conflict();
```

The client displays a gentle banner if `check_appointment_conflict` returns a non-zero count and shows a warning badge when `has_conflict = TRUE`.

---

## 6. Timeline Integration

### 6.1 Healthcare Journey Timeline Events

**Unified Timeline Approach**: Appointments integrate into the **same master `healthcare_timeline_events` table** used for all healthcare events. This creates a single, chronological healthcare journey with smart filtering capabilities.

**Timeline Filtering Strategy:**
- **Default View**: Shows all events (past + future) chronologically
- **"Upcoming Events" Section**: Collapsible section at top showing `event_date > NOW()`
- **Filter Options**: 
  - "Show only past events" (historical timeline)
  - "Show only future events" (upcoming appointments)
  - "Show all" (complete healthcare journey)

**Appointment Timeline Generation**:

```sql
-- Trigger to create timeline events for appointments
CREATE OR REPLACE FUNCTION generate_timeline_event_for_appointment()
RETURNS TRIGGER AS $$
DECLARE
    timeline_title TEXT;
    timeline_category TEXT := 'appointment';
    timeline_icon TEXT;
BEGIN
    -- Generate appropriate title based on appointment type
    timeline_title := COALESCE(NEW.purpose, 'Healthcare Appointment');
    
    -- Choose appropriate icon
    timeline_icon := CASE NEW.appointment_type
        WHEN 'telehealth' THEN 'video'
        WHEN 'in_person' THEN 'hospital'
        WHEN 'home_visit' THEN 'home'
        ELSE 'calendar'
    END;
    
    -- Insert into MAIN healthcare timeline (same table as all other events)
    INSERT INTO healthcare_timeline_events (
        patient_id,
        display_category,           -- 'appointment' (integrates with existing categories)
        display_subcategory,        -- 'upcoming', 'telehealth', 'in_person'
        title,
        summary,
        icon,
        color_code,
        event_date,                 -- Future dates for upcoming appointments
        is_major_event,            -- True for urgent appointments
        display_priority,          -- Lower numbers = higher priority (urgent = 10)
        searchable_content,
        event_tags                 -- ['appointment', 'upcoming', 'priority'] for filtering
    ) VALUES (
        NEW.patient_id,
        'appointment',              -- New category in main timeline
        NEW.appointment_type,
        timeline_title,
        COALESCE(NEW.patient_notes, 'Upcoming appointment'),
        timeline_icon,
        CASE NEW.importance_level
            WHEN 'urgent' THEN '#dc2626'     -- Red for urgent
            WHEN 'high' THEN '#ea580c'       -- Orange for high priority
            ELSE '#2563eb'                   -- Blue for normal
        END,
        NEW.scheduled_start,        -- Future timestamp
        CASE NEW.importance_level WHEN 'urgent' THEN TRUE ELSE FALSE END,
        CASE NEW.importance_level
            WHEN 'urgent' THEN 10    -- Highest priority (shows at top)
            WHEN 'high' THEN 25      -- High priority
            ELSE 75                  -- Normal priority
        END,
        CONCAT_WS(' ', NEW.purpose, NEW.patient_notes, NEW.service_category),
        ARRAY['appointment', 'upcoming']::TEXT[] || 
        CASE WHEN NEW.importance_level IN ('high', 'urgent') THEN ARRAY['priority'] ELSE ARRAY[]::TEXT[] END
    );
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_appointment_timeline_event
AFTER INSERT ON user_appointments
FOR EACH ROW 
WHEN (NEW.status IN ('logged', 'confirmed', 'checked_in'))
EXECUTE FUNCTION generate_timeline_event_for_appointment();
```

### 6.2 Timeline UI Integration

**Frontend Timeline Display Strategy:**

```sql
-- Main timeline query (past + future in one stream)
SELECT 
    id, title, summary, icon, color_code, event_date, 
    display_category, display_subcategory, event_tags,
    CASE WHEN event_date > NOW() THEN 'upcoming' ELSE 'past' END as time_period
FROM healthcare_timeline_events 
WHERE patient_id = $1 AND archived = FALSE
ORDER BY 
    CASE WHEN event_date > NOW() THEN event_date END ASC,    -- Future events: earliest first
    CASE WHEN event_date <= NOW() THEN event_date END DESC   -- Past events: most recent first
LIMIT 100;

-- Filter for "Upcoming Events" collapsible section
SELECT * FROM healthcare_timeline_events 
WHERE patient_id = $1 AND event_date > NOW() AND archived = FALSE
AND event_tags && ARRAY['appointment']  -- Only appointments
ORDER BY display_priority ASC, event_date ASC;  -- Urgent first, then chronological
```

**Timeline View UI Example:**
```
┌─ Healthcare Journey Timeline ─────────────────┐
│ ▼ Upcoming Events (3)                        │
│   🚨 Urgent: Cardiology Follow-up (Tomorrow) │
│   📅 Dermatology Checkup (Next Week)         │
│   📅 Annual Physical (Next Month)            │
│                                              │
│ ── Today ─────────────────────────────────── │
│                                              │
│ 📊 Lab Results: Cholesterol (Yesterday)      │
│ 💊 Started: Atorvastatin 20mg (Last Week)    │
│ 🏥 Emergency Visit: Chest Pain (Last Month)  │
└──────────────────────────────────────────────┘
```

### 6.3 Dedicated Appointments Tab

**Standalone Appointments View**: While appointments integrate into the main timeline, users need quick access to appointment-specific features through a dedicated tab/page.

```sql
-- Dedicated Appointments Tab Query
SELECT 
    ua.id, ua.scheduled_start, ua.scheduled_end, ua.purpose,
    ua.provider_name, ua.facility_name, ua.appointment_type,
    ua.status, ua.importance_level, ua.patient_notes,
    ua.location_address, ua.contact_phone, ua.preparation_instructions,
    ua.reminder_settings, ua.has_conflict,
    
    -- Days until appointment for sorting
    EXTRACT(epoch FROM (ua.scheduled_start - NOW())) / 86400 as days_until,
    
    -- Timeline event for status indicator (match by patient and date)
    hte.color_code, hte.icon
FROM user_appointments ua
LEFT JOIN healthcare_timeline_events hte ON hte.patient_id = ua.patient_id 
    AND hte.event_date = ua.scheduled_start
    AND hte.display_category = 'appointment'
WHERE ua.patient_id = $1 
AND ua.status IN ('logged', 'confirmed', 'checked_in')
AND ua.scheduled_start > NOW() - INTERVAL '1 day'  -- Include today + future
ORDER BY ua.scheduled_start ASC;
```

**Appointments Tab Features:**
- **📅 Calendar View**: Month/week/day views of upcoming appointments
- **📋 List View**: Detailed appointment cards with all information
- **⚡ Quick Actions**: 
  - Add appointment (with provider search)
  - Edit appointment details and notes
  - Set/modify reminders
  - View preparation instructions
- **🔍 Search & Filter**: 
  - Filter by provider, importance, appointment type
  - Search notes and preparation instructions
- **🚨 Conflict Alerts**: Visual indicators for scheduling conflicts
- **📞 Quick Contact**: One-tap calling/messaging appointment locations

**App Navigation Structure:**
```
Bottom Tab Bar:
┌─────────┬─────────┬─────────┬─────────┐
│ 🏠 Home │ 📅 Appts│ 📊 Timeline │ ⚙️ More │
└─────────┴─────────┴─────────┴─────────┘

Home Tab: Dashboard with recent activity + upcoming appointments preview
Appointments Tab: Dedicated appointment management (calendar + list views)  
Timeline Tab: Full healthcare journey timeline (past + future events)
More Tab: Settings, documents, reports, etc.
```

**Appointments Tab UI Layout:**
```
┌─ Appointments ────────────────────────────────┐
│ 📅 Calendar | 📋 List    [+ Add Appointment] │
│                                              │
│ 🚨 Tomorrow - 2:00 PM                       │
│ Dr. Sarah Johnson - Cardiology Follow-up     │
│ Heart Care Center, Suite 400                 │
│ 📝 "Ask about chest pain frequency"          │
│ 📞 (617) 555-0123  📍 View Directions       │
│                                              │
│ 📅 Next Week - 10:00 AM                     │
│ Dr. Michael Chen - Dermatology Checkup       │
│ Skin Health Clinic                           │
│ 📝 "Annual mole check - no preparation"      │
│ 📞 (617) 555-0456  📍 View Directions       │
└──────────────────────────────────────────────┘
```

## 7. Future Extensions

* **Smart Reminders**: Automated reminder system with multiple notification channels
* **Calendar Integration**: Two-way sync with Google Calendar, Apple Calendar, Outlook
* **Recurring appointments** (`recurrence_rule TEXT`, RFC 5545)  
* **Provider Directory**: Integration with healthcare provider databases
* **Telehealth Integration**: Meeting link generation and video call embedding
* **Wait Time Prediction**: Historical data analysis for better scheduling
* **Transportation Integration**: Ride-sharing and public transit integration
* **Health Insurance Integration**: Automatic benefit verification and copay estimation

---

## Documentation Link

Add the following bullet under **Core Foundation** in `v7/README.md`:

```
- **[Appointments & Scheduling](./appointments.md)** – planned visits logging, verification, conflicts
```

## 8. Row Level Security (RLS) Policies

### 8.1 Enable RLS on All Tables

```sql
-- Enable RLS on appointments tables
ALTER TABLE user_appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE healthcare_providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE healthcare_facilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_facility_affiliations ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointment_participants ENABLE ROW LEVEL SECURITY;
```

### 8.2 User Data Isolation Policies

```sql
-- Appointments: Users can only access their own appointments
CREATE POLICY user_appointments_isolation ON user_appointments
    FOR ALL USING (auth.uid() = patient_id);

-- Providers: All users can read provider directory (for search)
CREATE POLICY healthcare_providers_read_all ON healthcare_providers
    FOR SELECT USING (is_active = TRUE);

-- Facilities: All users can read facility directory (for search)  
CREATE POLICY healthcare_facilities_read_all ON healthcare_facilities
    FOR SELECT USING (is_active = TRUE);

-- Provider-Facility Links: All users can read active affiliations
CREATE POLICY provider_affiliations_read_all ON provider_facility_affiliations
    FOR SELECT USING (is_active = TRUE);

-- Appointment Participants: Users can only see participants for their appointments
CREATE POLICY appointment_participants_isolation ON appointment_participants
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM user_appointments ua 
            WHERE ua.id = appointment_participants.appointment_id 
            AND ua.patient_id = auth.uid()
        )
    );
```

### 8.3 Admin Policies (Service Role)

```sql
-- Allow service role to manage provider/facility data
CREATE POLICY healthcare_providers_service_role ON healthcare_providers
    FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY healthcare_facilities_service_role ON healthcare_facilities
    FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY provider_affiliations_service_role ON provider_facility_affiliations
    FOR ALL USING (auth.role() = 'service_role');
```

## 9. Triggers and Constraints

### 9.1 Updated At Triggers

```sql
-- Apply updated_at trigger to all appointment tables
CREATE TRIGGER update_user_appointments_updated_at
    BEFORE UPDATE ON user_appointments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_healthcare_providers_updated_at
    BEFORE UPDATE ON healthcare_providers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_healthcare_facilities_updated_at
    BEFORE UPDATE ON healthcare_facilities
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

### 9.2 Data Validation Functions

```sql
-- Validate appointment time is in the future (for new appointments)
CREATE OR REPLACE FUNCTION validate_future_appointment()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.origin = 'user' AND NEW.scheduled_start <= NOW() THEN
        RAISE EXCEPTION 'Cannot schedule appointments in the past';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER validate_appointment_time
    BEFORE INSERT ON user_appointments
    FOR EACH ROW EXECUTE FUNCTION validate_future_appointment();
```

This completes the initial specification. 