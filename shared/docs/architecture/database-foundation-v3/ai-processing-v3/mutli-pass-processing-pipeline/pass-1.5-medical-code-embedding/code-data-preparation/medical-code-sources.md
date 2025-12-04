# Medical Code Sources

**Purpose:** Data sources for medical code databases with brand name handling analysis

**Status:** Active - Research complete

**Created:** 2025-10-14  
**Updated:** 2025-10-16

---

## Brand Name Handling Research Summary

**Research Question:** How do universal and regional medical code libraries handle medication brand names?

**Key Findings (2025-10-16):**

### Universal Libraries

**RxNorm (USA):**
- ✅ **INCLUDES BRANDS** - Two distinct term types:
  - **SCD (Semantic Clinical Drug)**: ~18,604 generic medications
  - **SBD (Semantic Branded Drug)**: ~14,609 branded medications  
- Each brand gets **unique RXCUI** (different codes for generic vs branded)
- Example: "Atorvastatin 20 MG Tablet" vs "Lipitor 20 MG Tablet"

**SNOMED CT (International):**
- ❌ **NO BRANDS in international release**
- ✅ **BRANDS in national extensions** (country-specific)
- Rationale: "Brand names, formulations differ across countries"
- Australia could add brands via SNOMED CT Australian Extension

**LOINC (International):**
- ❌ **NOT APPLICABLE** - Laboratory/observation codes only
- No medication concepts (focuses on "what's being measured")

### Regional Libraries (Australia)

**PBS (Pharmaceutical Benefits Scheme):**
- ✅ **INCLUDES BRANDS** - Multiple brands per medication
- Structure: `li_item_id` (unique per brand) + `pbs_code` (grouping)
- Example: PBS code "10004M" has 2 brands (Sutent, Sunitinib Sandoz)

**MBS (Medicare Benefits Schedule):**
- ❌ **NOT APPLICABLE** - Procedure/service codes only
- No medication concepts (focuses on medical services)

**ICD-10-AM (Australian Modification):**
- ❌ **NOT APPLICABLE** - Diagnosis codes only
- No medication concepts (focuses on diseases/conditions)

## Universal vs Regional Pattern

| Type | Brand Handling | Example |
|------|----------------|---------|
| **Universal Libraries** | Mixed - RxNorm has brands, SNOMED/LOINC don't | RxNorm SBD vs SCD |
| **Regional Medication Libraries** | Always include brands | PBS li_item_id variants |
| **Procedure/Diagnosis Libraries** | Not applicable | MBS, ICD-10-AM |

---

## Data Sources and Access

**Universal Codes (Free via UMLS):**
- RxNorm (medications) - Monthly updates, RRF format, UMLS account required
- SNOMED-CT (conditions, procedures) - Bi-annual updates, RF2 format  
- LOINC (observations, labs) - Bi-annual updates, CSV format

**Regional Codes (Australia):**
- PBS (Pharmaceutical Benefits Scheme) - Monthly CSV API, Australian Government
- MBS (Medicare Benefits Schedule) - Quarterly CSV/Excel, Australian Government  
- ICD-10-AM (Australian modification) - Annual, paid license via ACCD

**Future Regional Codes:**
- NHS dm+d (UK medications)
- NDC (US medications) 
- PZN (German medications)
- Other international code systems

**Data Acquisition Strategy:**
- Licensing requirements vary by library
- Update frequency: Monthly (RxNorm, PBS) to Annual (ICD-10-AM)
- Data formats: RRF, RF2, CSV, XML depending on source
- Preprocessing needs: Entity classification, brand preservation, deduplication strategy

---

## Medical Importance of Brand Names

**Why Brand Preservation Matters:**
1. **Bioequivalence Variations**: Generic medications allowed ±20% variation (critical for warfarin, levothyroxine)
2. **Excipient Allergies**: Different fillers/dyes between brands can cause reactions  
3. **Biosimilar Distinctions**: Biologics not perfectly identical (Humira vs Amjevita)
4. **Patient Compliance**: Elderly patients may only recognize brand names
5. **Cost Tracking**: Insurance formulary changes, price monitoring over time
6. **Clinical Documentation**: Healthcare providers need exact medication tracking

**Architecture Decision:** Use most granular unique identifier available:
- RxNorm: RXCUI (already unique per SCD/SBD)
- PBS: `li_item_id` (unique per brand) + `pbs_code` (for grouping)
- SNOMED/LOINC/MBS/ICD-10-AM: Standard codes (brands not applicable)

---

**Reference:** See `../../V3_Features_and_Concepts/medical-code-resolution/australian-healthcare-codes.md` for multi-regional framework.

---

**Last Updated:** 2025-10-16
**Status:** Research complete - Ready for parser implementation