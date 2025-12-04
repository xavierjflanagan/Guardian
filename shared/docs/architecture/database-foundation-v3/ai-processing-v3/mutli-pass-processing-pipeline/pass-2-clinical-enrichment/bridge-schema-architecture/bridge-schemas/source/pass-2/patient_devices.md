# patient_devices Bridge Schema (Source) - Pass 2

**Triage Status:** DONE
**Step A Decision:** NEW - Tier 3 priority table
**Step A Rationale:** Medical devices (pacemakers, implants, prosthetics, DME) with unique tracking needs (serial numbers, implant dates, MRI safety).
**Step B Sync:** NEW TABLE - To be created via migration
**Step C Columns:** Complete - see Pass 2 AI Output Schema below
**Step D Temporal:** RANGE-BASED - Device has implant/start date and may have removal/end date
**Last Triage Update:** 2025-12-04
**Original Created:** 2025-12-04

---

## Table Purpose

Stores medical devices - implanted devices (pacemakers, defibrillators, joint replacements), durable medical equipment (CPAP, oxygen, wheelchairs), and prosthetics. Critical for MRI safety, device recalls, and care coordination.

---

## Pass 2 AI Output Schema

```typescript
interface Pass2DevicesOutput {
  // REQUIRED - Source identification
  source_text_verbatim: string;         // Full verbatim device text

  // REQUIRED - Spatial reference
  y_anchor_start: number;
  y_anchor_end?: number;

  // REQUIRED - Device identification
  device_name_verbatim: string;         // Exactly as stated
  device_type?: 'pacemaker' | 'icd' | 'crt' | 'joint_implant' | 'spinal_hardware' |
                'vascular_stent' | 'heart_valve' | 'cochlear_implant' | 'insulin_pump' |
                'cgm' | 'cpap' | 'oxygen' | 'wheelchair' | 'prosthetic' | 'hearing_aid' |
                'feeding_tube' | 'catheter' | 'port' | 'shunt' | 'other';

  // OPTIONAL - Device details
  manufacturer?: string;                // Device manufacturer
  model?: string;                       // Device model
  serial_number?: string;               // Device serial number

  // OPTIONAL - Location
  body_site?: string;                   // Where implanted/used
  laterality?: 'left' | 'right' | 'bilateral';

  // OPTIONAL - Dates
  implant_date?: string;                // When implanted/started
  removal_date?: string;                // When removed (if applicable)
  last_check_date?: string;             // Last device check/interrogation
  next_check_date?: string;             // Next scheduled check

  // OPTIONAL - Status
  device_status?: 'active' | 'inactive' | 'removed' | 'replaced' | 'malfunctioning';

  // OPTIONAL - Safety
  mri_conditional?: boolean;            // MRI conditional status
  mri_safety_notes?: string;            // Specific MRI precautions

  // OPTIONAL - Settings (for programmable devices)
  device_settings?: string;             // Current settings if stated

  // OPTIONAL - Provider
  implanting_provider?: string;         // Who implanted (if applicable)
  managing_provider?: string;           // Who manages/follows
}
```

---

## Example Extractions

### Example 1: Pacemaker
Document text: "Dual chamber pacemaker (Medtronic Azure), implanted 06/2023, MRI conditional"

```json
{
  "source_text_verbatim": "Dual chamber pacemaker (Medtronic Azure), implanted 06/2023, MRI conditional",
  "y_anchor_start": 823,
  "device_name_verbatim": "Dual chamber pacemaker",
  "device_type": "pacemaker",
  "manufacturer": "Medtronic",
  "model": "Azure",
  "implant_date": "2023-06",
  "device_status": "active",
  "mri_conditional": true
}
```

### Example 2: Joint Replacement
Document text: "Left TKA 2019, Smith & Nephew Legion, no complications"

```json
{
  "source_text_verbatim": "Left TKA 2019, Smith & Nephew Legion, no complications",
  "y_anchor_start": 839,
  "device_name_verbatim": "Left TKA",
  "device_type": "joint_implant",
  "manufacturer": "Smith & Nephew",
  "model": "Legion",
  "body_site": "knee",
  "laterality": "left",
  "implant_date": "2019",
  "device_status": "active"
}
```

### Example 3: ICD with Interrogation
Document text: "ICD (Boston Scientific), last interrogation 10/2024 - no events, battery 5 years"

```json
{
  "source_text_verbatim": "ICD (Boston Scientific), last interrogation 10/2024 - no events, battery 5 years",
  "y_anchor_start": 855,
  "device_name_verbatim": "ICD",
  "device_type": "icd",
  "manufacturer": "Boston Scientific",
  "last_check_date": "2024-10",
  "device_status": "active",
  "device_settings": "no events, battery 5 years"
}
```

### Example 4: CPAP
Document text: "CPAP: ResMed AirSense 11, settings 10cm H2O, compliance 85%"

```json
{
  "source_text_verbatim": "CPAP: ResMed AirSense 11, settings 10cm H2O, compliance 85%",
  "y_anchor_start": 871,
  "device_name_verbatim": "CPAP",
  "device_type": "cpap",
  "manufacturer": "ResMed",
  "model": "AirSense 11",
  "device_status": "active",
  "device_settings": "10cm H2O, compliance 85%"
}
```

### Example 5: Insulin Pump with CGM
Document text: "Tandem t:slim X2 insulin pump with Dexcom G6 CGM, basal rate 0.8 units/hr"

```json
[
  {
    "source_text_verbatim": "Tandem t:slim X2 insulin pump",
    "y_anchor_start": 887,
    "device_name_verbatim": "Tandem t:slim X2 insulin pump",
    "device_type": "insulin_pump",
    "manufacturer": "Tandem",
    "model": "t:slim X2",
    "device_status": "active",
    "device_settings": "basal rate 0.8 units/hr"
  },
  {
    "source_text_verbatim": "Dexcom G6 CGM",
    "y_anchor_start": 887,
    "device_name_verbatim": "Dexcom G6 CGM",
    "device_type": "cgm",
    "manufacturer": "Dexcom",
    "model": "G6",
    "device_status": "active"
  }
]
```

### Example 6: Coronary Stent
Document text: "DES x2 to LAD (2021), on dual antiplatelet therapy"

```json
{
  "source_text_verbatim": "DES x2 to LAD (2021), on dual antiplatelet therapy",
  "y_anchor_start": 903,
  "device_name_verbatim": "DES x2 to LAD",
  "device_type": "vascular_stent",
  "body_site": "LAD",
  "implant_date": "2021",
  "device_status": "active"
}
```

---

## Device Type Reference

| Type | Examples |
|------|----------|
| `pacemaker` | Single/dual chamber pacemaker |
| `icd` | Implantable cardioverter-defibrillator |
| `crt` | Cardiac resynchronization therapy device |
| `joint_implant` | Hip, knee, shoulder replacements |
| `spinal_hardware` | Rods, screws, fusion hardware |
| `vascular_stent` | Coronary stents, peripheral stents |
| `heart_valve` | Mechanical/bioprosthetic valves |
| `cochlear_implant` | Cochlear implant devices |
| `insulin_pump` | Insulin delivery systems |
| `cgm` | Continuous glucose monitors |
| `cpap` | CPAP/BiPAP machines |
| `oxygen` | Home oxygen equipment |
| `wheelchair` | Manual/power wheelchairs |
| `prosthetic` | Limb prosthetics |
| `feeding_tube` | G-tube, J-tube, PEG |
| `catheter` | Indwelling catheters |
| `port` | Port-a-cath, PICC lines |
| `shunt` | VP shunt, peritoneal shunts |

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
CREATE TABLE patient_devices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL,
    patient_id UUID NOT NULL,

    -- Device identification
    device_name_verbatim TEXT NOT NULL,
    device_type TEXT CHECK (device_type IN (
        'pacemaker', 'icd', 'crt', 'joint_implant', 'spinal_hardware',
        'vascular_stent', 'heart_valve', 'cochlear_implant', 'insulin_pump',
        'cgm', 'cpap', 'oxygen', 'wheelchair', 'prosthetic', 'hearing_aid',
        'feeding_tube', 'catheter', 'port', 'shunt', 'other'
    )),

    -- Device details
    manufacturer TEXT,
    model TEXT,
    serial_number TEXT,

    -- Location
    body_site TEXT,
    laterality TEXT CHECK (laterality IN ('left', 'right', 'bilateral')),

    -- Dates
    implant_date DATE,
    removal_date DATE,
    last_check_date DATE,
    next_check_date DATE,

    -- Status
    device_status TEXT CHECK (device_status IN (
        'active', 'inactive', 'removed', 'replaced', 'malfunctioning'
    )),

    -- Safety
    mri_conditional BOOLEAN,
    mri_safety_notes TEXT,

    -- Settings
    device_settings TEXT,

    -- Providers
    implanting_provider TEXT,
    managing_provider TEXT,

    -- Spatial
    y_anchor_start INTEGER NOT NULL,
    y_anchor_end INTEGER,
    verbatim_text_vertices JSONB,

    -- Audit
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Constraints
    CONSTRAINT fk_devices_event FOREIGN KEY (event_id, patient_id)
        REFERENCES patient_clinical_events(id, patient_id) ON DELETE CASCADE
);
```

---

## Device Safety Critical Fields

| Field | Importance |
|-------|------------|
| `mri_conditional` | Critical - determines MRI safety |
| `serial_number` | Recall tracking, device identification |
| `device_status` | Active/removed affects clinical decisions |
| `device_settings` | Critical for device management |

---

## Notes

- **MRI safety is critical:** Always capture MRI conditional status when stated
- **Serial numbers:** Important for recall tracking - extract when visible in document
- **Multiple devices:** Patient may have multiple devices - create separate rows
- **Device vs Procedure:** Joint replacement surgery = procedure; the implant itself = device
- **DME tracking:** Include durable medical equipment (CPAP, oxygen, wheelchairs)
- **Settings matter:** For programmable devices, capture current settings

---

## Related Documentation

- **Hub-and-Spoke Pattern:** `04-HUB-AND-SPOKE-DATABASE-PATTERN.md`
- **Spoke Table Architecture:** `07-SPOKE-TABLE-EVOLUTION-ROADMAP.md`
- **Procedures (related):** `patient_procedures.md`
- **Pass 2 Master:** `PASS2-STRATEGY-A-MASTER.md`
