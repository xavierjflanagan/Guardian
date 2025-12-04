# patient_advance_directives Bridge Schema (Source) - Pass 2

**Triage Status:** DONE
**Step A Decision:** NEW - Tier 2 priority table
**Step A Rationale:** Legal documents requiring specific tracking (living will, healthcare proxy, DNR). Unique structure not fitting other categories.
**Step B Sync:** NEW TABLE - To be created via migration
**Step C Columns:** Complete - see Pass 2 AI Output Schema below
**Step D Temporal:** RANGE-BASED - Directive effective from date until revoked/expired
**Last Triage Update:** 2025-12-04
**Original Created:** 2025-12-04

---

## Table Purpose

Stores advance directive documents - legal healthcare instructions that apply when patient cannot make decisions. Includes living wills, healthcare proxies, DNR/DNI orders, POLST forms. Critical for emergency care and end-of-life planning.

---

## Pass 2 AI Output Schema

```typescript
interface Pass2AdvanceDirectivesOutput {
  // REQUIRED - Source identification
  source_text_verbatim: string;         // Full verbatim directive text

  // REQUIRED - Spatial reference
  y_anchor_start: number;
  y_anchor_end?: number;

  // REQUIRED - Directive type
  directive_type: 'living_will' | 'healthcare_proxy' | 'dnr' | 'dni' | 'polst' |
                  'power_of_attorney' | 'organ_donation' | 'other';

  // OPTIONAL - Status
  directive_status?: 'active' | 'revoked' | 'expired' | 'superseded';

  // OPTIONAL - Dates
  effective_date?: string;              // ISO date when directive takes effect
  expiration_date?: string;             // ISO date when directive expires (if any)
  signed_date?: string;                 // When patient signed

  // OPTIONAL - Healthcare proxy/agent
  proxy_name?: string;                  // Designated healthcare agent name
  proxy_relationship?: string;          // Relationship to patient
  proxy_contact?: string;               // Phone/address if stated

  // OPTIONAL - Alternate agent
  alternate_proxy_name?: string;
  alternate_proxy_relationship?: string;

  // OPTIONAL - Specific instructions
  instructions_verbatim?: string;       // Specific wishes as stated
  resuscitation_preference?: 'full_code' | 'dnr' | 'dni' | 'dnr_dni' | 'comfort_only';
  ventilator_preference?: 'yes' | 'no' | 'trial_period' | 'not_specified';
  artificial_nutrition_preference?: 'yes' | 'no' | 'trial_period' | 'not_specified';

  // OPTIONAL - Witnesses/notarization
  witness_names?: string[];
  notarized?: boolean;
  notary_date?: string;

  // OPTIONAL - Document reference
  document_location?: string;           // Where original is filed
}
```

---

## Example Extractions

### Example 1: DNR Order
Document text: "DNR order signed 03/15/2024, patient wishes no resuscitation attempts"

```json
{
  "source_text_verbatim": "DNR order signed 03/15/2024, patient wishes no resuscitation attempts",
  "y_anchor_start": 234,
  "directive_type": "dnr",
  "directive_status": "active",
  "signed_date": "2024-03-15",
  "resuscitation_preference": "dnr",
  "instructions_verbatim": "patient wishes no resuscitation attempts"
}
```

### Example 2: Healthcare Proxy
Document text: "Healthcare Proxy: Jane Smith (daughter) designated as healthcare agent, alternate: John Smith (son)"

```json
{
  "source_text_verbatim": "Healthcare Proxy: Jane Smith (daughter) designated as healthcare agent, alternate: John Smith (son)",
  "y_anchor_start": 250,
  "directive_type": "healthcare_proxy",
  "directive_status": "active",
  "proxy_name": "Jane Smith",
  "proxy_relationship": "daughter",
  "alternate_proxy_name": "John Smith",
  "alternate_proxy_relationship": "son"
}
```

### Example 3: POLST Form
Document text: "POLST completed 01/10/2024: Comfort measures only, no CPR, no intubation, no artificial nutrition"

```json
{
  "source_text_verbatim": "POLST completed 01/10/2024: Comfort measures only, no CPR, no intubation, no artificial nutrition",
  "y_anchor_start": 266,
  "directive_type": "polst",
  "directive_status": "active",
  "signed_date": "2024-01-10",
  "resuscitation_preference": "comfort_only",
  "ventilator_preference": "no",
  "artificial_nutrition_preference": "no",
  "instructions_verbatim": "Comfort measures only, no CPR, no intubation, no artificial nutrition"
}
```

### Example 4: Living Will with Specific Instructions
Document text: "Living Will dated 2022: If terminal condition or permanent unconsciousness, no life-prolonging procedures. Signed and notarized."

```json
{
  "source_text_verbatim": "Living Will dated 2022: If terminal condition or permanent unconsciousness, no life-prolonging procedures. Signed and notarized.",
  "y_anchor_start": 282,
  "directive_type": "living_will",
  "directive_status": "active",
  "signed_date": "2022",
  "notarized": true,
  "instructions_verbatim": "If terminal condition or permanent unconsciousness, no life-prolonging procedures"
}
```

---

## Directive Type Reference

| Type | Description |
|------|-------------|
| `living_will` | Written instructions for end-of-life care |
| `healthcare_proxy` | Designates agent to make decisions |
| `dnr` | Do Not Resuscitate order |
| `dni` | Do Not Intubate order |
| `polst` | Physician Orders for Life-Sustaining Treatment |
| `power_of_attorney` | Legal authority for healthcare decisions |
| `organ_donation` | Organ/tissue donation wishes |
| `other` | Other advance directive types |

---

## What Server Adds

| Field | Source |
|-------|--------|
| `id` | gen_random_uuid() |
| `patient_id` | From encounter context |
| `event_id` | From hub record just created |
| `verbatim_text_vertices` | Post-Pass 2 algorithm |
| `created_at` | NOW() |

---

## Database Schema (Target)

```sql
CREATE TABLE patient_advance_directives (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL,
    patient_id UUID NOT NULL,

    -- Directive type and status
    directive_type TEXT NOT NULL CHECK (directive_type IN (
        'living_will', 'healthcare_proxy', 'dnr', 'dni', 'polst',
        'power_of_attorney', 'organ_donation', 'other'
    )),
    directive_status TEXT CHECK (directive_status IN ('active', 'revoked', 'expired', 'superseded')),

    -- Dates
    effective_date DATE,
    expiration_date DATE,
    signed_date DATE,

    -- Healthcare proxy
    proxy_name TEXT,
    proxy_relationship TEXT,
    proxy_contact TEXT,
    alternate_proxy_name TEXT,
    alternate_proxy_relationship TEXT,

    -- Instructions
    instructions_verbatim TEXT,
    resuscitation_preference TEXT CHECK (resuscitation_preference IN (
        'full_code', 'dnr', 'dni', 'dnr_dni', 'comfort_only'
    )),
    ventilator_preference TEXT CHECK (ventilator_preference IN (
        'yes', 'no', 'trial_period', 'not_specified'
    )),
    artificial_nutrition_preference TEXT CHECK (artificial_nutrition_preference IN (
        'yes', 'no', 'trial_period', 'not_specified'
    )),

    -- Witnesses/notarization
    witness_names TEXT[],
    notarized BOOLEAN,
    notary_date DATE,

    -- Document reference
    document_location TEXT,

    -- Spatial
    y_anchor_start INTEGER NOT NULL,
    y_anchor_end INTEGER,
    verbatim_text_vertices JSONB,

    -- Audit
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Constraints
    CONSTRAINT fk_advance_directives_event FOREIGN KEY (event_id, patient_id)
        REFERENCES patient_clinical_events(id, patient_id) ON DELETE CASCADE
);
```

---

## Notes

- **Critical for emergencies:** Advance directives must be easily accessible and clearly marked
- **Legal documents:** Preserve exact language - legal validity depends on precise wording
- **Supersession tracking:** When new directive created, mark old as 'superseded'
- **Proxy contact info:** Include if stated - critical for emergency situations
- **Notarization matters:** Some jurisdictions require notarization for validity

---

## Related Documentation

- **Hub-and-Spoke Pattern:** `04-HUB-AND-SPOKE-DATABASE-PATTERN.md`
- **Spoke Table Architecture:** `07-SPOKE-TABLE-EVOLUTION-ROADMAP.md`
- **Pass 2 Master:** `PASS2-STRATEGY-A-MASTER.md`
