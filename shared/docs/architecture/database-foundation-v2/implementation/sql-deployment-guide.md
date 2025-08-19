# SQL Deployment Guide

**Purpose:** Step-by-step database deployment for Guardian's clinical architecture  
**Target:** Fresh Guardian deployment with integrated multi-profile support  
**Reference:** [SQL Implementation Files](../../database-foundation/implementation/sql/)

---

## Quick Start

```bash
# Clone repository and navigate to SQL directory
cd /path/to/guardian/shared/docs/architecture/database-foundation/implementation/sql/

# Execute SQL files in order (critical for dependencies)
psql -h your-supabase-host -U postgres -d your-database < 000_system_infrastructure.sql
psql -h your-supabase-host -U postgres -d your-database < 001_extensions.sql
# ... continue with remaining files in order
```

**⚠️ CRITICAL:** Files must be executed in the exact order listed below due to foreign key dependencies.

---

## Deployment Order and Dependencies

### Phase 1: System Foundation
```yaml
001_system_infrastructure:
  purpose: "Core system infrastructure and extensions"
  dependencies: []
  contains: ["PostGIS setup", "UUID generation", "Basic system functions"]
  ai_impact: "Enables spatial data for clinical_fact_sources (Phase 2+)"
  
002_extensions:
  purpose: "Additional PostgreSQL extensions"
  dependencies: ["001_system_infrastructure"]
  contains: ["Additional data types", "Search extensions", "Performance extensions"]
  ai_impact: "GIN indexes for array searches, full-text search capabilities"
  
003_feature_flags:
  purpose: "Feature flag system for gradual rollouts"
  dependencies: ["002_extensions"]
  contains: ["Feature toggles", "A/B testing infrastructure"]
  ai_impact: "Enables staged rollout of AI processing features"
```

### Phase 2: Core User Architecture
```yaml
004_multi_profile_management:
  purpose: "Multi-profile user management system"
  dependencies: ["003_feature_flags"]
  contains: ["user_profiles table", "Profile access control", "Profile contamination prevention"]
  ai_impact: "CRITICAL - profile-classifier AI component populates user_profiles"
  tables_created:
    - user_profiles (self/child/adult_dependent/pet)
    - profile_access_permissions
    - profile_audit_logs
```

### Phase 3: Clinical Data Foundation
```yaml
005_core_clinical_tables:
  purpose: "Basic clinical data storage tables"
  dependencies: ["004_multi_profile_management"]
  contains: ["Clinical conditions", "Allergies", "Basic clinical data"]
  ai_impact: "condition-extractor, allergy-extractor AI components"
  tables_created:
    - patient_conditions
    - patient_allergies
    - medical_data_relationships
    
006_clinical_events_core:
  purpose: "O3's two-axis clinical events architecture"
  dependencies: ["005_core_clinical_tables"]
  contains: ["patient_clinical_events", "patient_observations", "patient_interventions"]
  ai_impact: "CRITICAL - o3-classifier, observation-extractor, intervention-extractor"
  tables_created:
    - patient_clinical_events (core O3 classification)
    - patient_observations (lab results, vitals, assessments)
    - patient_interventions (medications, procedures, treatments)
```

### Phase 4: Healthcare Experience Layer
```yaml
007_healthcare_journey:
  purpose: "Patient timeline and healthcare journey"
  dependencies: ["006_clinical_events_core"]
  contains: ["Timeline events", "Healthcare encounters", "Journey visualization"]
  ai_impact: "timeline-generator AI component populates healthcare_timeline_events"
  tables_created:
    - healthcare_timeline_events
    - healthcare_encounters
    - healthcare_journey_milestones
    
008_smart_features:
  purpose: "Smart health features and context detection"
  dependencies: ["007_healthcare_journey"]
  contains: ["Smart feature activation", "Context-sensitive UI features"]
  ai_impact: "smart-feature-detector AI component"
  tables_created:
    - smart_health_features
    - feature_activation_logs
```

### Phase 5: Provider Integration
```yaml
009_provider_registry:
  purpose: "Healthcare provider management"
  dependencies: ["008_smart_features"]
  contains: ["Provider registry", "Provider-patient relationships"]
  ai_impact: "provider-extractor AI component (future)"
  tables_created:
    - healthcare_providers
    - provider_patient_relationships
    - provider_access_permissions
    
010_patient_provider_access:
  purpose: "Provider portal access control"
  dependencies: ["009_provider_registry"]
  contains: ["Provider access permissions", "Sharing controls"]
  ai_impact: "None (access control only)"
```

### Phase 6: Advanced Features
```yaml
011_clinical_decision_support:
  purpose: "Advanced clinical analytics and decision support"
  dependencies: ["010_patient_provider_access"]
  contains: ["Clinical rules", "Decision support algorithms", "Analytics views"]
  ai_impact: "AI-powered clinical insights and recommendations"
  
012_job_queue:
  purpose: "Background job processing system"
  dependencies: ["011_clinical_decision_support"]
  contains: ["Job queue", "Background processing", "AI processing queue"]
  ai_impact: "CRITICAL - Manages AI processing jobs and document processing pipeline"
```

### Phase 7: Security and Finalization
```yaml
013_final_policies_and_triggers:
  purpose: "Row Level Security policies and database triggers"
  dependencies: ["012_job_queue"]
  contains: ["RLS policies", "Audit triggers", "Data integrity constraints"]
  ai_impact: "Profile isolation, contamination prevention, audit logging"
  
014_enhanced_consent:
  purpose: "Advanced consent management system"
  dependencies: ["013_final_policies_and_triggers"]
  contains: ["Granular consent", "GDPR compliance", "Data sharing permissions"]
  ai_impact: "Consent tracking for AI processing and data analysis"
```

---

## AI Processing Integration Points

### Critical Tables for AI Components

```yaml
ai_component_dependencies:
  profile_classifier:
    required_tables: ["user_profiles"]
    deployment_phase: "Phase 2"
    blocking_dependencies: ["004_multi_profile_management.sql"]
    
  o3_classifier:
    required_tables: ["patient_clinical_events"]
    deployment_phase: "Phase 3"
    blocking_dependencies: ["006_clinical_events_core.sql"]
    
  observation_extractor:
    required_tables: ["patient_clinical_events", "patient_observations"]
    deployment_phase: "Phase 3"
    blocking_dependencies: ["006_clinical_events_core.sql"]
    
  intervention_extractor:
    required_tables: ["patient_clinical_events", "patient_interventions"]
    deployment_phase: "Phase 3"
    blocking_dependencies: ["006_clinical_events_core.sql"]
    
  timeline_generator:
    required_tables: ["healthcare_timeline_events", "patient_clinical_events"]
    deployment_phase: "Phase 4"
    blocking_dependencies: ["007_healthcare_journey.sql"]
    
  smart_feature_detector:
    required_tables: ["smart_health_features", "user_profiles"]
    deployment_phase: "Phase 4"
    blocking_dependencies: ["008_smart_features.sql"]
```

### Minimal AI Processing Deployment

For development/testing with core AI processing:

```bash
# Minimal deployment for AI processing testing
psql < 000_system_infrastructure.sql  # System foundation
psql < 001_extensions.sql             # Required extensions
psql < 002_feature_flags.sql          # Feature management
psql < 003_multi_profile_management.sql  # Profiles (CRITICAL)
psql < 004_core_clinical_tables.sql   # Basic clinical data
psql < 005_clinical_events_core.sql   # O3 events (CRITICAL)
psql < 006_healthcare_journey.sql     # Timeline (CRITICAL)
psql < 012_final_policies_and_triggers.sql  # Security (CRITICAL)

# This enables: profile-classifier, o3-classifier, timeline-generator
```

---

## Deployment Commands

### Production Deployment

```bash
#!/bin/bash
# production-deploy.sh

set -e  # Exit on any error

DB_HOST="your-supabase-host"
DB_USER="postgres"
DB_NAME="your-database"
SQL_DIR="/path/to/sql/files"

echo "Starting Guardian Database Foundation deployment..."

# Array of SQL files in correct order
SQL_FILES=(
  "000_system_infrastructure.sql"
  "001_extensions.sql"
  "002_feature_flags.sql"
  "003_multi_profile_management.sql"
  "004_core_clinical_tables.sql"
  "005_clinical_events_core.sql"
  "006_healthcare_journey.sql"
  "007_smart_features.sql"
  "008_provider_registry.sql"
  "009_patient_provider_access.sql"
  "010_clinical_decision_support.sql"
  "011_job_queue.sql"
  "012_final_policies_and_triggers.sql"
  "013_enhanced_consent.sql"
)

# Execute each SQL file
for sql_file in "${SQL_FILES[@]}"; do
  echo "Executing ${sql_file}..."
  
  if psql -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" -f "${SQL_DIR}/${sql_file}"; then
    echo "✅ ${sql_file} completed successfully"
  else
    echo "❌ ${sql_file} failed - stopping deployment"
    exit 1
  fi
done

echo "🎉 Guardian Database Foundation deployment completed successfully!"
```

### Development Deployment

```bash
#!/bin/bash
# dev-deploy.sh - Minimal deployment for AI processing development

set -e

DB_CONNECTION="postgresql://postgres:password@localhost:54322/postgres"
SQL_DIR="/path/to/sql/files"

echo "Starting minimal Guardian deployment for AI development..."

# Core files needed for AI processing
CORE_FILES=(
  "000_system_infrastructure.sql"
  "001_extensions.sql"
  "002_feature_flags.sql"
  "003_multi_profile_management.sql"    # Enables profile-classifier
  "004_core_clinical_tables.sql"
  "005_clinical_events_core.sql"        # Enables o3-classifier
  "006_healthcare_journey.sql"          # Enables timeline-generator
  "012_final_policies_and_triggers.sql" # Enables security
)

for sql_file in "${CORE_FILES[@]}"; do
  echo "Executing ${sql_file}..."
  psql "$DB_CONNECTION" -f "${SQL_DIR}/${sql_file}"
  echo "✅ ${sql_file} completed"
done

echo "🎉 Minimal Guardian deployment completed - AI processing ready!"
```

---

## Deployment Verification

### Post-Deployment Checks

```sql
-- Verify core tables exist and have correct structure
DO $$
DECLARE
    tables_to_check TEXT[] := ARRAY[
        'user_profiles',
        'patient_clinical_events', 
        'patient_observations',
        'patient_interventions',
        'healthcare_timeline_events',
        'smart_health_features'
    ];
    table_name TEXT;
    table_count INTEGER;
BEGIN
    FOREACH table_name IN ARRAY tables_to_check LOOP
        SELECT COUNT(*) INTO table_count 
        FROM information_schema.tables 
        WHERE table_name = table_name AND table_schema = 'public';
        
        IF table_count = 0 THEN
            RAISE EXCEPTION 'Critical table % is missing', table_name;
        ELSE
            RAISE NOTICE '✅ Table % exists', table_name;
        END IF;
    END LOOP;
    
    RAISE NOTICE '🎉 All critical tables verified successfully';
END $$;
```

### AI Processing Readiness Check

```sql
-- Test AI component table access
DO $$
BEGIN
    -- Test profile creation (profile-classifier)
    INSERT INTO user_profiles (account_owner_id, profile_type, display_name)
    VALUES (gen_random_uuid(), 'self', 'Test User')
    ON CONFLICT DO NOTHING;
    
    -- Test clinical event creation (o3-classifier)
    INSERT INTO patient_clinical_events (
        patient_id, activity_type, clinical_purposes, event_name, confidence_score
    ) VALUES (
        gen_random_uuid(), 'observation', ARRAY['diagnostic'], 'Test Event', 0.9
    );
    
    -- Test timeline creation (timeline-generator)
    INSERT INTO healthcare_timeline_events (
        patient_id, display_category, title, clinical_event_ids
    ) VALUES (
        gen_random_uuid(), 'test_result', 'Test Timeline', ARRAY[gen_random_uuid()]
    );
    
    RAISE NOTICE '🎉 AI processing tables are ready for integration';
    
    -- Clean up test data
    DELETE FROM healthcare_timeline_events WHERE title = 'Test Timeline';
    DELETE FROM patient_clinical_events WHERE event_name = 'Test Event';
    DELETE FROM user_profiles WHERE display_name = 'Test User';
END $$;
```

### Performance Optimization Check

```sql
-- Verify indexes exist for AI processing queries
SELECT 
    schemaname,
    tablename,
    indexname,
    indexdef
FROM pg_indexes 
WHERE tablename IN (
    'user_profiles',
    'patient_clinical_events', 
    'healthcare_timeline_events',
    'smart_health_features'
)
ORDER BY tablename, indexname;

-- Check table statistics for query planning
ANALYZE user_profiles;
ANALYZE patient_clinical_events;
ANALYZE healthcare_timeline_events;
ANALYZE smart_health_features;
```

---

## Rollback and Recovery

### Emergency Rollback Script

```bash
#!/bin/bash
# rollback.sh - Emergency database rollback

DB_CONNECTION="your-connection-string"

echo "⚠️  Starting emergency rollback..."

# Drop tables in reverse dependency order
ROLLBACK_STATEMENTS=(
  "DROP TABLE IF EXISTS enhanced_consent CASCADE;"
  "DROP TABLE IF EXISTS job_queue CASCADE;"
  "DROP TABLE IF EXISTS clinical_decision_support CASCADE;"
  "DROP TABLE IF EXISTS provider_access_permissions CASCADE;"
  "DROP TABLE IF EXISTS healthcare_providers CASCADE;"
  "DROP TABLE IF EXISTS smart_health_features CASCADE;"
  "DROP TABLE IF EXISTS healthcare_timeline_events CASCADE;"
  "DROP TABLE IF EXISTS patient_interventions CASCADE;"
  "DROP TABLE IF EXISTS patient_observations CASCADE;"
  "DROP TABLE IF EXISTS patient_clinical_events CASCADE;"
  "DROP TABLE IF EXISTS patient_conditions CASCADE;"
  "DROP TABLE IF EXISTS user_profiles CASCADE;"
)

for statement in "${ROLLBACK_STATEMENTS[@]}"; do
  echo "Executing: $statement"
  psql "$DB_CONNECTION" -c "$statement"
done

echo "🚨 Rollback completed - database reset to minimal state"
```

### Backup Before Deployment

```bash
# Create backup before deployment
pg_dump -h your-host -U postgres your-database > guardian-backup-$(date +%Y%m%d-%H%M%S).sql

# Restore from backup if needed
psql -h your-host -U postgres your-database < guardian-backup-20240819-143022.sql
```

---

## Troubleshooting Common Issues

### Foreign Key Constraint Errors

```sql
-- Check for missing foreign key dependencies
SELECT 
    tc.table_name, 
    kcu.column_name,
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name 
FROM information_schema.table_constraints AS tc 
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_name IN ('patient_clinical_events', 'healthcare_timeline_events');
```

### Permission Issues

```sql
-- Grant necessary permissions for AI processing
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO your_ai_user;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO your_ai_user;
```

### Index Missing Issues

```sql
-- Recreate critical indexes if missing
CREATE INDEX CONCURRENTLY idx_user_profiles_account_owner 
ON user_profiles(account_owner_id) WHERE active = true;

CREATE INDEX CONCURRENTLY idx_clinical_events_patient 
ON patient_clinical_events(patient_id) WHERE archived = false;

CREATE INDEX CONCURRENTLY idx_timeline_events_patient_date 
ON healthcare_timeline_events(patient_id, event_date DESC);
```

---

*This deployment guide ensures proper database foundation setup with correct dependency order and AI processing readiness validation.*