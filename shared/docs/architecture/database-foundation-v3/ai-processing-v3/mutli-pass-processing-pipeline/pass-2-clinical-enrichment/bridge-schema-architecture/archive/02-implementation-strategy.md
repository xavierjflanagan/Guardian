# Phase 1: Bridge Schema System - Implementation Strategy

**Date:** 26 September 2025
**Status:** Implementation Strategy Definition
**Dependencies:** Phase 1.5 database cleanup completion
**Target:** 60 schema files + dynamic loading system

---

## 🏗️ **IMPLEMENTATION APPROACH**

### **Strategy 1: Database-First Schema Generation**

**Approach:** Extract field definitions directly from deployed V3 database schema files
**Benefits:** 100% accuracy with actual database structure
**Process:** Automated parsing of `current_schema/*.sql` files

#### **Source Tier Generation Process**
```bash
# Step 1: Parse actual database schema files
node scripts/extract-table-definitions.js current_schema/03_clinical_core.sql

# Step 2: Generate source tier schemas programmatically
node scripts/generate-source-schemas.js --tables patient_clinical_events,patient_observations

# Step 3: Validate against deployed database
node scripts/validate-schema-alignment.js --database production
```

#### **Source Schema Template**
```json
{
  "schema_version": "v3_source_1.0",
  "table_name": "patient_clinical_events",
  "database_source": "current_schema/03_clinical_core.sql:360-442",
  "last_validated": "2025-09-26",
  "fields": {
    "id": {
      "type": "UUID",
      "constraints": "PRIMARY KEY DEFAULT gen_random_uuid()",
      "required": true
    },
    "patient_id": {
      "type": "UUID",
      "constraints": "NOT NULL REFERENCES user_profiles(id)",
      "required": true,
      "rls_column": true
    },
    "activity_type": {
      "type": "VARCHAR(20)",
      "constraints": "NOT NULL CHECK (activity_type IN ('observation', 'intervention'))",
      "required": true
    }
    // ... exact field definitions from database
  },
  "constraints": [
    "CONSTRAINT valid_activity_type CHECK (activity_type IN ('observation', 'intervention'))",
    "CONSTRAINT valid_clinical_purposes CHECK (array_length(clinical_purposes, 1) >= 1)"
  ],
  "indexes": [
    "idx_clinical_events_patient_date",
    "idx_clinical_events_activity_type"
  ]
}
```

### **Strategy 2: Medical Context Enhancement**

**Approach:** Layer medical expertise onto source schemas for detailed tier
**Process:** Healthcare professional review + clinical decision support

#### **Detailed Tier Enhancement Process**
```json
{
  "schema_version": "v3_detailed_1.0",
  "extends": "v3_source_1.0",
  "table_name": "patient_clinical_events",
  "clinical_context": {
    "purpose": "Central hub for all clinical activity using O3 two-axis classification system",
    "clinical_significance": "Foundation for timeline, narratives, and clinical decision support",
    "safety_considerations": "Patient isolation via RLS, clinical event auditing required"
  },
  "field_enhancements": {
    "activity_type": {
      "clinical_guidance": "Fundamental distinction in healthcare: observations (what we see/measure) vs interventions (what we do)",
      "examples": {
        "observation": [
          "Blood pressure reading: 140/90 mmHg",
          "Lab result: Glucose 180 mg/dL",
          "Physical exam: Heart murmur detected"
        ],
        "intervention": [
          "Medication prescribed: Lisinopril 10mg daily",
          "Procedure performed: Cardiac catheterization",
          "Treatment given: IV fluid bolus 500mL"
        ]
      },
      "decision_logic": "Ask: Are we recording what we observed/measured (observation) or what we did/prescribed (intervention)?"
    },
    "clinical_purposes": {
      "clinical_guidance": "Multiple purposes can apply - captures clinical reasoning behind the activity",
      "purpose_definitions": {
        "screening": "Detecting conditions in asymptomatic patients",
        "diagnostic": "Confirming or ruling out suspected conditions",
        "therapeutic": "Treating confirmed conditions",
        "monitoring": "Tracking response to treatment or disease progression",
        "preventive": "Preventing future health problems"
      },
      "combination_examples": [
        "['screening', 'preventive'] - Annual colonoscopy",
        "['diagnostic', 'monitoring'] - Follow-up CT scan after treatment",
        "['therapeutic', 'monitoring'] - Medication adjustment with lab tracking"
      ]
    }
  }
}
```

### **Strategy 3: Token Optimization**

**Approach:** Identify essential-only fields for minimal tier
**Process:** Token usage analysis + field importance ranking

#### **Minimal Tier Generation Logic**
```typescript
interface MinimalSchemaGenerator {
  // Analyze token usage per field
  analyzeTokenUsage(detailedSchema: Schema): TokenAnalysis;

  // Rank field importance for AI processing
  rankFieldImportance(tableName: string): FieldImportance[];

  // Generate token-optimized schema
  generateMinimalSchema(
    sourceSchema: Schema,
    tokenBudget: number
  ): MinimalSchema;
}

const FIELD_IMPORTANCE_RANKING = {
  patient_clinical_events: [
    { field: 'patient_id', importance: 'critical', reason: 'RLS and data isolation' },
    { field: 'activity_type', importance: 'critical', reason: 'Core clinical classification' },
    { field: 'event_name', importance: 'critical', reason: 'Primary clinical content' },
    { field: 'event_date', importance: 'high', reason: 'Timeline context' },
    { field: 'clinical_purposes', importance: 'high', reason: 'Clinical reasoning' },
    { field: 'confidence_level', importance: 'medium', reason: 'Quality control' },
    { field: 'notes', importance: 'low', reason: 'Additional context only' }
  ]
};
```

---

## 🔧 **DYNAMIC LOADING SYSTEM IMPLEMENTATION**

### **V3BridgeSchemaLoader Class Structure**

```typescript
export class V3BridgeSchemaLoader {
  private schemaCache: Map<string, BridgeSchema> = new Map();
  private schemaBasePath: string;

  constructor(schemaBasePath: string) {
    this.schemaBasePath = schemaBasePath;
  }

  // Core loading methods
  async getSchemasForEntityCategories(
    categories: EntityCategory[]
  ): Promise<BridgeSchema[]> {
    const tableNames = this.mapCategoriesToTables(categories);
    const schemaVersion = this.determineOptimalVersion();

    return Promise.all(
      tableNames.map(table => this.loadSchemaWithCaching(table, schemaVersion))
    );
  }

  async loadSchemaWithCaching(
    tableName: string,
    version: SchemaVersion
  ): Promise<BridgeSchema> {
    const cacheKey = `${tableName}_${version}`;

    if (this.schemaCache.has(cacheKey)) {
      return this.schemaCache.get(cacheKey)!;
    }

    const schema = await this.loadSchemaFromFile(tableName, version);
    this.schemaCache.set(cacheKey, schema);
    return schema;
  }

  // Token budget management
  getOptimalSchemaVersion(
    entityCount: number,
    tokenBudget: number
  ): SchemaVersion {
    const estimatedTokens = this.estimateTokenUsage(entityCount);

    if (estimatedTokens.detailed < tokenBudget * 0.7) {
      return 'detailed';
    } else if (estimatedTokens.source < tokenBudget * 0.9) {
      return 'source';
    } else {
      return 'minimal';
    }
  }

  // Private helper methods
  private mapCategoriesToTables(categories: EntityCategory[]): string[] {
    return categories.flatMap(category =>
      ENTITY_TO_SCHEMA_MAPPING[category] || []
    );
  }

  private async loadSchemaFromFile(
    tableName: string,
    version: SchemaVersion
  ): Promise<BridgeSchema> {
    const filePath = `${this.schemaBasePath}/${tableName}_${version}.json`;
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content);
  }

  private estimateTokenUsage(entityCount: number): TokenEstimate {
    // Token estimation logic based on schema complexity
    const baseTokens = {
      minimal: 100,
      source: 300,
      detailed: 800
    };

    return {
      minimal: baseTokens.minimal * entityCount,
      source: baseTokens.source * entityCount,
      detailed: baseTokens.detailed * entityCount
    };
  }
}
```

### **Integration with Pass 1 → Pass 2 Workflow**

```typescript
// Pass 1 Output → Pass 2 Schema Loading
interface Pass1ToPass2Integration {
  // Pass 1 entity detection results
  pass1Results: {
    entities_by_category: {
      clinical_event: EntityDetectionResult[];
      healthcare_context: EntityDetectionResult[];
      document_structure: EntityDetectionResult[];
    };
  };

  // Pass 2 schema loading
  pass2SchemaLoading: {
    requiredSchemas: string[];
    selectedTier: 'minimal' | 'detailed' | 'source';
    tokenBudget: number;
    loadedSchemas: BridgeSchema[];
  };
}

async function loadSchemasForPass2(
  pass1Results: Pass1Results,
  tokenBudget: number
): Promise<BridgeSchema[]> {
  const loader = new V3BridgeSchemaLoader('./bridge-schemas');

  // Determine entity categories that need processing
  const activeCategories = Object.keys(pass1Results.entities_by_category)
    .filter(category => pass1Results.entities_by_category[category].length > 0);

  // Load appropriate schemas
  return await loader.getSchemasForEntityCategories(activeCategories);
}
```

---

## 📁 **FILE ORGANIZATION STRUCTURE**

### **Bridge Schema Directory Layout**
```
shared/docs/architecture/database-foundation-v3/bridge-schemas/
├── source/                              # Tier 1: Database-exact schemas
│   ├── patient_clinical_events.json
│   ├── patient_observations.json
│   ├── patient_interventions.json
│   └── ... (20 tables)
├── detailed/                            # Tier 2: Rich medical context
│   ├── patient_clinical_events.json
│   ├── patient_observations.json
│   ├── patient_interventions.json
│   └── ... (20 tables)
├── minimal/                             # Tier 3: Token-optimized
│   ├── patient_clinical_events.json
│   ├── patient_observations.json
│   ├── patient_interventions.json
│   └── ... (20 tables)
├── metadata/
│   ├── entity-to-table-mapping.json    # Pass 1 category → table mapping
│   ├── schema-validation-results.json  # Validation against database
│   └── token-usage-analysis.json       # Token optimization data
└── README.md                            # Schema system documentation
```

### **Schema Validation System**
```typescript
interface SchemaValidator {
  // Validate against actual database
  validateAgainstDatabase(
    schemaPath: string,
    databaseConnection: Database
  ): Promise<ValidationResult>;

  // Ensure schema completeness
  validateSchemaCompleteness(
    schemaDirectory: string
  ): Promise<CompletenessReport>;

  // Check tier consistency
  validateTierConsistency(
    minimal: Schema,
    detailed: Schema,
    source: Schema
  ): Promise<ConsistencyReport>;
}
```

---

## ⚡ **PERFORMANCE OPTIMIZATION**

### **Caching Strategy**
- **Memory Cache:** Recently loaded schemas cached in worker memory
- **File System Cache:** Pre-compiled schema bundles for common combinations
- **CDN Cache:** Schema files served via CDN for distributed workers

### **Loading Optimization**
- **Parallel Loading:** Load multiple schemas concurrently
- **Lazy Loading:** Load schemas only when needed for specific entity categories
- **Batch Loading:** Bundle related schemas for single file system access

### **Token Budget Management**
```typescript
interface TokenBudgetManager {
  // Estimate token usage for schema combination
  estimateTokenUsage(schemas: BridgeSchema[]): number;

  // Select optimal tier based on budget
  selectOptimalTier(
    availableBudget: number,
    requiredSchemas: string[]
  ): SchemaVersion;

  // Optimize schema combination for token efficiency
  optimizeSchemaSelection(
    entityCategories: EntityCategory[],
    tokenBudget: number
  ): OptimizedSchemaSet;
}
```

---

## 🧪 **TESTING STRATEGY**

### **Unit Tests**
- **Schema Loading:** Test individual schema file loading
- **Caching:** Validate cache hit/miss behavior
- **Token Estimation:** Verify token usage calculations
- **Version Selection:** Test tier selection logic

### **Integration Tests**
- **Pass 1 → Pass 2:** End-to-end entity category to schema loading
- **Database Validation:** Schemas match actual database structure
- **Performance:** Loading times meet <50ms requirements

### **Validation Tests**
- **Database Alignment:** Source schemas exactly match deployed database
- **Medical Accuracy:** Healthcare professional review of detailed schemas
- **Token Optimization:** Minimal schemas maintain clinical accuracy

---

## 📋 **IMPLEMENTATION CHECKLIST**

### **Week 1: Schema Content Creation**
- [ ] Parse V3 database schema files programmatically
- [ ] Generate 20 source tier schemas with exact field definitions
- [ ] Create detailed tier schemas with medical context enhancement
- [ ] Build minimal tier schemas with token optimization
- [ ] Validate schema accuracy against deployed database

### **Week 2: Dynamic Loading System**
- [ ] Implement V3BridgeSchemaLoader class
- [ ] Add memory and file system caching
- [ ] Build token budget management system
- [ ] Create entity category to table mapping
- [ ] Integration testing with Pass 1 → Pass 2 workflow

### **Validation & Testing**
- [ ] Unit tests for all loading system components
- [ ] Integration tests with actual worker environment
- [ ] Performance testing (<50ms loading requirement)
- [ ] Healthcare professional review of detailed schemas
- [ ] Database alignment validation

---

**Success Criteria:** 60 bridge schema files created, dynamic loading system operational, integration with Pass 1→Pass 2 workflow functional, all tests passing.