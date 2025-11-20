# Changelog: v2.9 to v10.0

## Version 10.0 (2025-11-12)

### Breaking Changes
- **Prompt Architecture**: Complete redesign from compositional (base + addons) to universal prompt
- **encounterType Values**: Standardized to lowercase_underscore (breaking change for downstream systems expecting human-readable labels)
- **Progressive Fields**: Now always present in schema (status, tempId, expectedContinuation)

### Major Features
- **Universal Prompt**: Single prompt works for all document sizes
- **Post-Processor**: Automatic status inference from page boundaries
- **Native Progressive Support**: Handoff fields built into base schema

### Improvements from v2.9

#### Prompt Enhancements
- Added boundary detection priority rules
- Added confidence calibration bands (0.9-1.0, 0.7-0.9, 0.5-0.7, <0.5)
- Added citation requirement for page assignments
- Clarified single-day vs multi-day vs ongoing encounter date rules
- Distinguished encounter end date from chunk continuation status

#### Schema Changes
- `encounterType`: Now uses lowercase_underscore values
  - "Emergency Department Visit" → "emergency_department"
  - "Hospital Admission" → "hospital_admission"
  - "Surgical Procedure" → "surgical_procedure"
  - "Outpatient Consultation" → "outpatient_consultation"
  - "Diagnostic Imaging" → "diagnostic_imaging"
  - "Laboratory Test Collection" → "laboratory_test"
  - "Treatment Session" → "treatment_session"
  - "Vaccination/Immunization" → "vaccination"
  - "Telehealth Consultation" → "telehealth"
  - "Medication Review" → "medication_review"

#### New Required Fields (Progressive Mode)
- `status`: "complete" or "continuing"
- `tempId`: Required when status="continuing"
- `expectedContinuation`: Required when status="continuing"

#### Database Mapping Improvements
- Correct mapping to `encounter_date_end` (not encounter_end_date)
- Correct mapping to `pass_0_5_confidence` (not confidence)
- Maps providerRole → provider_type
- Maps department → specialty
- Stores extra clinical data in summary/clinical_impression

### Files Changed
- **Added**:
  - `aiPrompts.v10.ts` - Universal prompt implementation
  - `post-processor.ts` - Status inference and validation
- **Modified**:
  - `chunk-processor.ts` - Uses v10 prompt, integrates post-processor
  - `encounterDiscovery.ts` - Added v10 support with backward compatibility
- **Deleted**:
  - `progressive/addons.ts` - Obsolete compositional approach
  - `progressive/prompts.ts` - Superseded by v10

### Migration Notes
- Set `PASS_05_VERSION=v10` to enable
- v2.9 remains available for rollback (`PASS_05_VERSION=v2.9`)
- Downstream systems must handle new encounterType values
- Monitor handoff success rate during initial deployment

### Testing Results
- Tested with 142-page document
- Previous: 3 separate encounters (handoff failed)
- v10: (Pending test results)

### Known Issues
- AI models may still not provide status field (post-processor handles)
- Cannot detect mid-page encounter boundaries
- Directory structure not fully reorganized (progressive/ not renamed to progressive-v10/)