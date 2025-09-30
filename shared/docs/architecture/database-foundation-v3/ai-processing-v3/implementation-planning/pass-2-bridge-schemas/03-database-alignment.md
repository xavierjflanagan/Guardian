# Phase 1: Bridge Schema System - Database Alignment

**Date:** 26 September 2025
**Status:** Database Alignment Specification
**Purpose:** Ensure bridge schemas exactly match deployed V3 database structure
**Critical Success Factor:** 100% accuracy with actual deployed tables

---

## 🎯 **DATABASE ALIGNMENT REQUIREMENTS**

### **Source of Truth: Deployed V3 Schema Files**

**Authoritative References:**
```
shared/docs/architecture/database-foundation-v3/current_schema/
├── 01_foundations.sql              # System tables (audit_log, notifications)
├── 02_profiles.sql                 # User management (user_profiles, permissions)
├── 03_clinical_core.sql           # Clinical data (patient_*, healthcare_*, clinical_narratives)
├── 04_ai_processing.sql           # AI infrastructure (entity_processing_audit_v2)
├── 05_healthcare_journey.sql      # Provider management (provider_*, clinical_alert_rules)
├── 06_security.sql                # Consent management (patient_consents)
├── 07_optimization.sql            # System optimization (job_queue)
└── 08_job_coordination.sql        # Usage tracking (user_usage_tracking, subscription_plans)
```

### **Field-Level Accuracy Requirements**

**Critical Alignment Points:**
1. **Exact Field Names:** Must match database column names precisely
2. **Data Types:** PostgreSQL types must be exactly represented
3. **Constraints:** NOT NULL, CHECK constraints, foreign keys
4. **Default Values:** Database defaults must be captured
5. **Indexes:** Performance-critical indexes documented

---

## 📊 **TABLE-BY-TABLE ALIGNMENT GUIDE**

### **Core Clinical Tables (Primary AI Targets)**

#### **1. patient_clinical_events** (Source: 03_clinical_core.sql:360-442)
```json
{
  "table_name": "patient_clinical_events",
  "source_file": "03_clinical_core.sql",
  "lines": "360-442",
  "last_verified": "2025-09-26",
  "fields": {
    "id": {
      "type": "UUID",
      "constraints": "PRIMARY KEY DEFAULT gen_random_uuid()",
      "nullable": false
    },
    "patient_id": {
      "type": "UUID",
      "constraints": "NOT NULL REFERENCES user_profiles(id)",
      "nullable": false,
      "rls_critical": true
    },
    "activity_type": {
      "type": "VARCHAR(20)",
      "constraints": "NOT NULL CHECK (activity_type IN ('observation', 'intervention'))",
      "nullable": false
    },
    "clinical_purposes": {
      "type": "TEXT[]",
      "constraints": "NOT NULL CHECK (array_length(clinical_purposes, 1) >= 1)",
      "nullable": false
    },
    "event_name": {
      "type": "TEXT",
      "constraints": "NOT NULL",
      "nullable": false
    },
    "event_date": {
      "type": "DATE",
      "constraints": "NOT NULL",
      "nullable": false
    },
    "shell_file_id": {
      "type": "UUID",
      "constraints": "REFERENCES shell_files(id)",
      "nullable": true
    },
    "clinical_event_id": {
      "type": "UUID",
      "constraints": "REFERENCES patient_clinical_events(id)",
      "nullable": true,
      "note": "Self-referencing for temporal data management"
    },
    "primary_narrative_id": {
      "type": "UUID",
      "constraints": "REFERENCES clinical_narratives(id)",
      "nullable": true
    },
    "snomed_code": {
      "type": "VARCHAR(20)",
      "nullable": true
    },
    "loinc_code": {
      "type": "VARCHAR(20)",
      "nullable": true
    },
    "icd10_code": {
      "type": "VARCHAR(20)",
      "nullable": true
    },
    "cpt_code": {
      "type": "VARCHAR(20)",
      "nullable": true
    },
    "ai_confidence": {
      "type": "DECIMAL(3,2)",
      "constraints": "CHECK (ai_confidence >= 0 AND ai_confidence <= 1)",
      "nullable": true
    },
    "ai_extracted": {
      "type": "BOOLEAN",
      "default": "TRUE",
      "nullable": false
    },
    "ai_model_version": {
      "type": "VARCHAR(50)",
      "nullable": true
    },
    "created_at": {
      "type": "TIMESTAMPTZ",
      "default": "NOW()",
      "nullable": false
    },
    "updated_at": {
      "type": "TIMESTAMPTZ",
      "default": "NOW()",
      "nullable": false
    }
  },
  "indexes": [
    "idx_clinical_events_patient_date",
    "idx_clinical_events_activity_type",
    "idx_clinical_events_shell_file"
  ],
  "rls_enabled": true,
  "rls_policy": "Users can only access their own clinical events"
}
```

#### **2. patient_observations** (Source: 03_clinical_core.sql:443-477)
```json
{
  "table_name": "patient_observations",
  "source_file": "03_clinical_core.sql",
  "lines": "443-477",
  "fields": {
    "id": {
      "type": "UUID",
      "constraints": "PRIMARY KEY DEFAULT gen_random_uuid()",
      "nullable": false
    },
    "patient_id": {
      "type": "UUID",
      "constraints": "NOT NULL REFERENCES user_profiles(id)",
      "nullable": false,
      "rls_critical": true
    },
    "event_id": {
      "type": "UUID",
      "constraints": "REFERENCES patient_clinical_events(id)",
      "nullable": true
    },
    "observation_type": {
      "type": "VARCHAR(50)",
      "constraints": "NOT NULL",
      "nullable": false
    },
    "value_text": {
      "type": "TEXT",
      "nullable": true
    },
    "value_numeric": {
      "type": "DECIMAL(10,3)",
      "nullable": true
    },
    "unit": {
      "type": "VARCHAR(20)",
      "nullable": true
    },
    "reference_range": {
      "type": "TEXT",
      "nullable": true
    },
    "interpretation": {
      "type": "VARCHAR(50)",
      "nullable": true
    },
    "observation_date": {
      "type": "DATE",
      "nullable": true
    },
    "created_at": {
      "type": "TIMESTAMPTZ",
      "default": "NOW()",
      "nullable": false
    },
    "updated_at": {
      "type": "TIMESTAMPTZ",
      "default": "NOW()",
      "nullable": false
    }
  }
}
```

#### **3. patient_interventions** (Source: 03_clinical_core.sql:478-514)
```json
{
  "table_name": "patient_interventions",
  "source_file": "03_clinical_core.sql",
  "lines": "478-514",
  "fields": {
    "id": {
      "type": "UUID",
      "constraints": "PRIMARY KEY DEFAULT gen_random_uuid()",
      "nullable": false
    },
    "patient_id": {
      "type": "UUID",
      "constraints": "NOT NULL REFERENCES user_profiles(id)",
      "nullable": false,
      "rls_critical": true
    },
    "event_id": {
      "type": "UUID",
      "constraints": "REFERENCES patient_clinical_events(id)",
      "nullable": true
    },
    "intervention_type": {
      "type": "VARCHAR(50)",
      "constraints": "NOT NULL",
      "nullable": false
    },
    "substance_name": {
      "type": "TEXT",
      "nullable": true
    },
    "dose_amount": {
      "type": "VARCHAR(50)",
      "nullable": true
    },
    "dose_unit": {
      "type": "VARCHAR(20)",
      "nullable": true
    },
    "frequency": {
      "type": "TEXT",
      "nullable": true
    },
    "route": {
      "type": "VARCHAR(50)",
      "nullable": true
    },
    "technique": {
      "type": "TEXT",
      "nullable": true
    },
    "immediate_outcome": {
      "type": "TEXT",
      "nullable": true
    },
    "intervention_date": {
      "type": "DATE",
      "nullable": true
    },
    "created_at": {
      "type": "TIMESTAMPTZ",
      "default": "NOW()",
      "nullable": false
    },
    "updated_at": {
      "type": "TIMESTAMPTZ",
      "default": "NOW()",
      "nullable": false
    }
  }
}
```

---

## 🔍 **CRITICAL VERIFICATION POINTS**

### **1. Temporal Data Management Columns**

**Verify ALL tables have temporal columns from migration 02:**
```sql
-- These columns should exist in ALL clinical tables
clinical_event_id UUID REFERENCES patient_clinical_events(id)
primary_narrative_id UUID REFERENCES clinical_narratives(id)
valid_from TIMESTAMPTZ NOT NULL DEFAULT NOW()
valid_to TIMESTAMPTZ NULL
superseded_by_record_id UUID
is_current BOOLEAN GENERATED ALWAYS AS (valid_to IS NULL) STORED
clinical_effective_date DATE
date_confidence TEXT CHECK (date_confidence IN ('high', 'medium', 'low', 'conflicted'))
clinical_identity_key TEXT
```

### **2. Medical Code Resolution Integration**

**Verify medical code tables match migration 04:**
```sql
-- universal_medical_codes fields
id, code_system, code_value, display_name, search_text,
embedding VECTOR(1536), entity_type, usage_frequency, active, last_updated

-- regional_medical_codes fields
id, code_system, code_value, display_name, search_text,
embedding VECTOR(1536), entity_type, country_code, authority_required,
usage_frequency, active, last_updated

-- medical_code_assignments fields
id, entity_table, entity_id, patient_id, universal_code_system, universal_code,
universal_display, universal_confidence, regional_code_system, regional_code,
regional_display, regional_confidence, regional_country_code, assigned_at,
assigned_by_system, requires_review, fallback_identifier
```

### **3. Narrative Architecture Columns**

**Verify clinical_narratives enhancements from migration 03:**
```sql
-- Added in migration 03
narrative_embedding VECTOR(1536)
is_current BOOLEAN DEFAULT TRUE
supersedes_id UUID REFERENCES clinical_narratives(id)
content_fingerprint TEXT
semantic_tags TEXT[]
narrative_purpose TEXT
clinical_classification TEXT
```

---

## 🛠️ **ALIGNMENT VALIDATION PROCESS**

### **Automated Schema Extraction**

```bash
#!/bin/bash
# Extract table definitions from deployed schema files

echo "Extracting table definitions from current_schema files..."

for schema_file in shared/docs/architecture/database-foundation-v3/current_schema/*.sql; do
    echo "Processing $schema_file..."

    # Extract CREATE TABLE statements
    grep -A 50 "CREATE TABLE" "$schema_file" | \
    grep -B 50 ";" | \
    python scripts/parse-table-definitions.py >> extracted_schemas.json
done

echo "Schema extraction complete. Validating against bridge schemas..."
node scripts/validate-bridge-alignment.js
```

### **Field-Level Validation Script**

```python
# scripts/parse-table-definitions.py
import re
import json
import sys

def extract_table_definition(sql_content):
    """Extract table name and field definitions from CREATE TABLE statement"""

    # Parse table name
    table_match = re.search(r'CREATE TABLE\s+(?:IF NOT EXISTS\s+)?(\w+)', sql_content)
    if not table_match:
        return None

    table_name = table_match.group(1)

    # Parse field definitions
    fields = {}
    field_lines = re.findall(r'(\w+)\s+([^,\n]+)(?:,|\n)', sql_content)

    for field_name, field_definition in field_lines:
        # Parse field type and constraints
        type_match = re.search(r'^(\w+(?:\(\d+(?:,\d+)?\))?)', field_definition)
        field_type = type_match.group(1) if type_match else field_definition.strip()

        # Extract constraints
        constraints = []
        if 'NOT NULL' in field_definition:
            constraints.append('NOT NULL')
        if 'PRIMARY KEY' in field_definition:
            constraints.append('PRIMARY KEY')
        if 'REFERENCES' in field_definition:
            ref_match = re.search(r'REFERENCES\s+(\w+\(\w+\))', field_definition)
            if ref_match:
                constraints.append(f'REFERENCES {ref_match.group(1)}')

        fields[field_name] = {
            'type': field_type,
            'constraints': ' '.join(constraints) if constraints else None,
            'nullable': 'NOT NULL' not in field_definition
        }

    return {
        'table_name': table_name,
        'fields': fields
    }
```

### **Bridge Schema Validation**

```typescript
// scripts/validate-bridge-alignment.js
interface ValidationResult {
  table_name: string;
  aligned: boolean;
  mismatches: FieldMismatch[];
  missing_fields: string[];
  extra_fields: string[];
}

class BridgeSchemaValidator {
  async validateAlignment(
    extractedSchema: ExtractedSchema,
    bridgeSchemaPath: string
  ): Promise<ValidationResult> {
    const bridgeSchema = await this.loadBridgeSchema(bridgeSchemaPath);

    return {
      table_name: extractedSchema.table_name,
      aligned: this.checkAlignment(extractedSchema, bridgeSchema),
      mismatches: this.findFieldMismatches(extractedSchema, bridgeSchema),
      missing_fields: this.findMissingFields(extractedSchema, bridgeSchema),
      extra_fields: this.findExtraFields(extractedSchema, bridgeSchema)
    };
  }

  private checkAlignment(
    extracted: ExtractedSchema,
    bridge: BridgeSchema
  ): boolean {
    // Validate field names match exactly
    const extractedFields = Object.keys(extracted.fields);
    const bridgeFields = Object.keys(bridge.fields);

    return (
      extractedFields.length === bridgeFields.length &&
      extractedFields.every(field => bridgeFields.includes(field))
    );
  }
}
```

---

## 📋 **MANUAL VERIFICATION CHECKLIST**

### **For Each Bridge Schema File:**

#### **Source Tier Validation**
- [ ] Table name exactly matches database table name
- [ ] All field names exactly match database column names
- [ ] Data types are PostgreSQL-accurate (not generic types)
- [ ] Constraints include NOT NULL, CHECK, REFERENCES exactly as in database
- [ ] Default values match database defaults exactly
- [ ] No missing fields from database table
- [ ] No extra fields not in database table

#### **Detailed Tier Validation**
- [ ] Extends source tier accurately (all fields present)
- [ ] Medical context is clinically accurate
- [ ] Examples are realistic and helpful for AI processing
- [ ] Clinical guidance supports correct AI decision-making
- [ ] No medical errors or dangerous advice

#### **Minimal Tier Validation**
- [ ] Contains essential fields for basic AI processing
- [ ] Maintains referential integrity (patient_id, foreign keys)
- [ ] Preserves RLS-critical fields
- [ ] Token count significantly reduced vs detailed tier
- [ ] Still enables basic clinical data extraction

---

## 🚨 **CRITICAL SUCCESS CRITERIA**

### **Database Alignment Requirements**
1. **100% Field Accuracy:** Every bridge schema field exactly matches database
2. **Constraint Completeness:** All database constraints captured in source tier
3. **Type Precision:** PostgreSQL-specific types, not generic database types
4. **Reference Integrity:** All foreign key relationships accurately represented
5. **RLS Compliance:** Patient isolation fields correctly identified

### **Validation Requirements**
1. **Automated Validation:** Scripts confirm alignment without manual checking
2. **Regression Testing:** Changes to database schema trigger bridge schema updates
3. **Version Control:** Bridge schemas tagged with database schema version
4. **Documentation:** Any deviations from database documented with reasoning

### **Performance Requirements**
1. **Loading Speed:** Schema loading <50ms per table
2. **Memory Efficiency:** Cached schemas don't exceed memory limits
3. **Token Optimization:** Minimal tier achieves >50% token reduction
4. **Batch Processing:** Multiple schemas loadable concurrently

---

**Next Steps:** Complete automated schema extraction, validate against all 20 core processing tables, ensure 100% alignment before proceeding to implementation phase.