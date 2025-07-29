# Guardian v6 to v7 Migration Guide

**Migration Version:** v6 → v7  
**Date:** 2025-07-29  
**Estimated Duration:** 2-4 weeks  
**Risk Level:** Medium

---

## Overview

This guide provides step-by-step instructions for migrating from Guardian v6 to the new modular v7 architecture. The migration is designed to be backward compatible with minimal downtime.

**Key Changes in v7:**
- 🏗️ Modular documentation architecture
- 🏥 FHIR integration capabilities
- 🔒 Enhanced consent management
- 👤 Advanced user preferences
- 🚀 Real-time collaboration features

---

## 1. Pre-Migration Assessment

### 1.1. Current System Check

```sql
-- Check current Guardian v6 installation
CREATE OR REPLACE FUNCTION assess_v6_installation()
RETURNS TABLE (
    assessment_item TEXT,
    current_status TEXT,
    migration_readiness TEXT,
    action_required TEXT
) AS $$
BEGIN
    RETURN QUERY
    WITH assessment AS (
        SELECT 'Database Extensions' as item,
               CASE WHEN EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'uuid-ossp') 
                    THEN 'Installed' ELSE 'Missing' END as status,
               CASE WHEN EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'uuid-ossp') 
                    THEN 'Ready' ELSE 'Requires Installation' END as readiness,
               CASE WHEN EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'uuid-ossp') 
                    THEN 'None' ELSE 'Install required extensions' END as action
        
        UNION ALL
        
        SELECT 'Core Tables',
               CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'documents') 
                    THEN 'Present' ELSE 'Missing' END,
               CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'documents') 
                    THEN 'Ready' ELSE 'Core Migration Required' END,
               CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'documents') 
                    THEN 'None' ELSE 'Deploy core schema first' END
        
        UNION ALL
        
        SELECT 'User Data Count',
               (SELECT COUNT(*)::TEXT || ' users' FROM auth.users),
               CASE WHEN (SELECT COUNT(*) FROM auth.users) > 0 
                    THEN 'Data Present' ELSE 'No Data' END,
               CASE WHEN (SELECT COUNT(*) FROM auth.users) > 0 
                    THEN 'Plan user data migration' ELSE 'None' END
    )
    SELECT * FROM assessment;
END;
$$ LANGUAGE plpgsql;

-- Run assessment
SELECT * FROM assess_v6_installation();
```

### 1.2. Data Backup Verification

```bash
# Create complete backup before migration
pg_dump guardian_db > guardian_v6_backup_$(date +%Y%m%d_%H%M%S).sql

# Verify backup integrity
pg_restore --list guardian_v6_backup_*.sql | head -20

# Document current data volumes
psql -d guardian_db -c "
SELECT 
    schemaname,
    tablename,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size,
    pg_stat_get_tuples_returned(pg_class.oid) as row_count
FROM pg_tables 
JOIN pg_class ON pg_class.relname = pg_tables.tablename
WHERE schemaname NOT IN ('information_schema', 'pg_catalog')
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
"
```

---

## 2. Migration Timeline & Phases

### Phase 1: Infrastructure Preparation (Week 1)
- ✅ Documentation structure migration
- ✅ Feature flags deployment
- ✅ Testing environment setup
- ✅ Backup and rollback procedures

### Phase 2: Core Schema Enhancement (Week 2)
- 🔄 FHIR mapping tables
- 🔄 Enhanced consent management
- 🔄 User preferences system
- 🔄 Document processing queue

### Phase 3: Data Migration & Testing (Week 3)
- 🔄 Existing data migration
- 🔄 User preferences migration
- 🔄 Integration testing
- 🔄 Performance validation

### Phase 4: Production Deployment (Week 4)
- 🔄 Production deployment
- 🔄 User notification
- 🔄 Monitoring and support
- 🔄 Post-migration validation

---

## 3. Step-by-Step Migration Procedure

### 3.1. Phase 1: Infrastructure Setup

#### Step 1: Deploy Feature Flags System

```sql
-- Deploy feature flags infrastructure
\i migration-guides/sql-migrations/001_feature_flags.sql

-- Verify deployment
SELECT feature_name, enabled, rollout_percentage 
FROM feature_flags 
ORDER BY feature_name;
```

#### Step 2: Create Migration Tracking

```sql
-- Deploy migration tracking
\i migration-guides/sql-migrations/002_migration_tracking.sql

-- Initialize migration session
INSERT INTO migration_sessions (
    migration_type, 
    source_version, 
    target_version,
    initiated_by
) VALUES (
    'v6_to_v7',
    'v6.0',
    'v7.0',
    current_user
);
```

### 3.2. Phase 2: Schema Enhancements

#### Step 1: FHIR Integration Tables

```sql
-- Deploy FHIR integration schema
BEGIN;

-- Enable feature flag for testing
UPDATE feature_flags 
SET enabled = true, rollout_percentage = 0 
WHERE feature_name = 'fhir_integration';

-- Deploy FHIR tables
\i migration-guides/sql-migrations/003_fhir_integration.sql

-- Verify deployment
SELECT COUNT(*) as fhir_tables_created
FROM information_schema.tables 
WHERE table_name LIKE 'fhir_%';

COMMIT;
```

#### Step 2: Enhanced Consent Management

```sql
-- Deploy enhanced consent system
BEGIN;

-- Create new consent tables
\i migration-guides/sql-migrations/004_enhanced_consent.sql

-- Migrate existing consent data
INSERT INTO patient_consents (
    patient_id,
    consent_type,
    purpose,
    granted,
    valid_from,
    created_at
)
SELECT 
    user_id,
    'data_sharing',
    'healthcare_services',
    true, -- Assuming existing users consented
    created_at,
    created_at
FROM auth.users
WHERE created_at < NOW() - INTERVAL '1 day'; -- Existing users only

COMMIT;
```

#### Step 3: User Preferences System

```sql
-- Deploy user preferences
BEGIN;

\i migration-guides/sql-migrations/005_user_preferences.sql

-- Migrate basic preferences from existing user profiles
INSERT INTO user_preferences (
    user_id,
    language,
    timezone,
    notification_channels,
    updated_at
)
SELECT 
    up.user_id,
    COALESCE(up.language, 'en'),
    COALESCE(up.timezone, 'UTC'),
    '{"email": true, "sms": false, "push": true}',
    NOW()
FROM user_profiles up
ON CONFLICT (user_id) DO NOTHING;

COMMIT;
```

### 3.3. Phase 3: Data Quality & Testing

#### Data Validation Queries

```sql
-- Validate migration completeness
WITH migration_validation AS (
    SELECT 
        'Users' as entity,
        COUNT(*) as v6_count,
        (SELECT COUNT(*) FROM user_preferences) as v7_count
    FROM auth.users
    
    UNION ALL
    
    SELECT 
        'Documents',
        COUNT(*),
        (SELECT COUNT(*) FROM documents WHERE id IS NOT NULL)
    FROM documents
    
    UNION ALL
    
    SELECT 
        'Medications',
        COUNT(*),
        (SELECT COUNT(*) FROM patient_medications WHERE id IS NOT NULL)
    FROM patient_medications
)
SELECT 
    entity,
    v6_count,
    v7_count,
    CASE 
        WHEN v6_count = v7_count THEN '✅ Complete'
        WHEN v7_count > v6_count THEN '⚠️ Extra data'
        ELSE '❌ Data loss'
    END as migration_status
FROM migration_validation;
```

#### Performance Testing

```sql
-- Performance regression testing
CREATE OR REPLACE FUNCTION test_v7_performance()
RETURNS TABLE (
    test_name TEXT,
    execution_time_ms NUMERIC,
    baseline_ms NUMERIC,
    performance_impact TEXT
) AS $$
DECLARE
    start_time TIMESTAMPTZ;
    end_time TIMESTAMPTZ;
    duration_ms NUMERIC;
BEGIN
    -- Test 1: User authentication query
    start_time := clock_timestamp();
    PERFORM u.id FROM auth.users u WHERE u.email = 'test@example.com';
    end_time := clock_timestamp();
    duration_ms := EXTRACT(EPOCH FROM (end_time - start_time)) * 1000;
    
    RETURN QUERY SELECT 
        'User Authentication'::TEXT,
        duration_ms,
        5.0::NUMERIC, -- 5ms baseline
        CASE 
            WHEN duration_ms <= 10.0 THEN '✅ Good'
            WHEN duration_ms <= 20.0 THEN '⚠️ Acceptable'
            ELSE '❌ Poor'
        END::TEXT;
    
    -- Test 2: Document listing query
    start_time := clock_timestamp();
    PERFORM d.id FROM documents d WHERE d.user_id = 'test-user-id' LIMIT 50;
    end_time := clock_timestamp();
    duration_ms := EXTRACT(EPOCH FROM (end_time - start_time)) * 1000;
    
    RETURN QUERY SELECT 
        'Document Listing'::TEXT,
        duration_ms,
        15.0::NUMERIC, -- 15ms baseline
        CASE 
            WHEN duration_ms <= 30.0 THEN '✅ Good'
            WHEN duration_ms <= 50.0 THEN '⚠️ Acceptable'
            ELSE '❌ Poor'
        END::TEXT;
END;
$$ LANGUAGE plpgsql;

-- Run performance tests
SELECT * FROM test_v7_performance();
```

---

## 4. Rollback Procedures

### 4.1. Emergency Rollback

```sql
-- Emergency rollback function
CREATE OR REPLACE FUNCTION emergency_rollback_to_v6()
RETURNS TEXT AS $$
DECLARE
    rollback_id UUID;
BEGIN
    -- Disable all v7 features immediately
    UPDATE feature_flags SET enabled = false WHERE feature_name LIKE '%v7%' OR feature_name IN (
        'fhir_integration', 'enhanced_consent', 'user_preferences_v2', 
        'document_queue_v2', 'real_time_collaboration'
    );
    
    -- Log rollback
    INSERT INTO migration_sessions (migration_type, status, notes)
    VALUES ('v7_to_v6_rollback', 'emergency_rollback', 'Emergency rollback initiated')
    RETURNING id INTO rollback_id;
    
    RETURN 'Emergency rollback completed. Session ID: ' || rollback_id::TEXT;
END;
$$ LANGUAGE plpgsql;
```

### 4.2. Graceful Rollback

```bash
#!/bin/bash
# Graceful rollback script

echo "Starting graceful rollback to v6..."

# 1. Notify users of maintenance
psql -d guardian_db -c "
INSERT INTO notification_queue (user_id, notification_type, priority, title, body)
SELECT id, 'system_maintenance', 'high', 
       'System Maintenance', 
       'We are performing system maintenance. Some features may be temporarily unavailable.'
FROM auth.users WHERE role != 'admin';
"

# 2. Disable v7 features gradually
psql -d guardian_db -c "
UPDATE feature_flags 
SET rollout_percentage = 0 
WHERE feature_name IN ('fhir_integration', 'enhanced_consent');
"

# 3. Wait for active sessions to complete
sleep 30

# 4. Restore v6 configuration
psql -d guardian_db -f migration-guides/rollback-scripts/restore_v6_config.sql

# 5. Verify rollback
psql -d guardian_db -c "SELECT * FROM assess_v6_installation();"

echo "Graceful rollback completed."
```

---

## 5. User Communication Plan

### 5.1. Pre-Migration Notifications

```sql
-- Pre-migration user notification
INSERT INTO notification_queue (
    user_id, 
    notification_type, 
    priority, 
    title, 
    body,
    data,
    scheduled_for
)
SELECT 
    u.id,
    'system_upgrade',
    'normal',
    'Guardian v7 Upgrade Coming Soon',
    'We''re upgrading Guardian with exciting new features including better healthcare provider integration and enhanced privacy controls. The upgrade will happen on ' || to_char(NOW() + INTERVAL '3 days', 'Month DD, YYYY') || '.',
    jsonb_build_object(
        'upgrade_date', NOW() + INTERVAL '3 days',
        'expected_downtime', '2 hours',
        'new_features', '["FHIR Integration", "Enhanced Consent Management", "Improved Document Processing"]'
    ),
    NOW() + INTERVAL '1 hour'
FROM auth.users u
WHERE u.email IS NOT NULL;
```

### 5.2. Post-Migration Welcome

```sql
-- Post-migration welcome and feature introduction
INSERT INTO notification_queue (
    user_id, 
    notification_type, 
    priority, 
    title, 
    body,
    data
)
SELECT 
    u.id,
    'feature_introduction',
    'normal',
    'Welcome to Guardian v7!',
    'Your Guardian experience just got better! Explore new features: enhanced privacy controls, faster document processing, and better healthcare provider integration.',
    jsonb_build_object(
        'tour_available', true,
        'new_features_url', '/features/v7-overview',
        'support_url', '/support/v7-migration'
    )
FROM auth.users u
WHERE u.created_at < NOW() - INTERVAL '1 day'; -- Existing users only
```

---

## 6. Testing Checklist

### 6.1. Pre-Migration Testing

- [ ] **Backup Verification** - Restore test successful
- [ ] **Performance Baseline** - Current system benchmarks recorded
- [ ] **Data Integrity Check** - All critical data validated
- [ ] **User Access Test** - Authentication and authorization working
- [ ] **API Functionality** - All endpoints responding correctly

### 6.2. During Migration Testing

- [ ] **Schema Migration** - All tables created successfully
- [ ] **Data Migration** - No data loss detected
- [ ] **Index Performance** - Query performance maintained
- [ ] **RLS Policies** - Security policies functioning
- [ ] **Feature Flags** - Progressive rollout working

### 6.3. Post-Migration Validation

- [ ] **End-to-End Workflows** - User journeys complete successfully
- [ ] **FHIR Integration** - External system connectivity
- [ ] **Consent Management** - User consent flows working
- [ ] **Document Processing** - Upload and processing pipeline
- [ ] **Performance Validation** - No significant regressions
- [ ] **Security Audit** - All security controls operational
- [ ] **User Acceptance** - Sample user testing successful

---

## 7. Support & Troubleshooting

### 7.1. Common Issues & Solutions

#### Issue: Feature Flag Not Working
```sql
-- Check feature flag status
SELECT feature_name, enabled, rollout_percentage, enabled_for_users
FROM feature_flags 
WHERE feature_name = 'problematic_feature';

-- Reset feature flag
UPDATE feature_flags 
SET enabled = false, rollout_percentage = 0, enabled_for_users = '{}'
WHERE feature_name = 'problematic_feature';
```

#### Issue: Performance Degradation
```sql
-- Check slow queries
SELECT query, calls, mean_exec_time, rows
FROM pg_stat_statements 
ORDER BY mean_exec_time DESC 
LIMIT 10;

-- Reindex if necessary
REINDEX TABLE problematic_table;
```

#### Issue: Data Migration Incomplete
```sql
-- Check migration status
SELECT 
    migration_type,
    status,
    records_processed,
    records_failed,
    error_summary
FROM migration_sessions 
WHERE migration_type = 'v6_to_v7'
ORDER BY created_at DESC 
LIMIT 1;
```

### 7.2. Emergency Contacts

| Role | Contact | Availability |
|------|---------|--------------|
| Technical Lead | tech-lead@guardian.health | 24/7 during migration |
| Database Admin | dba@guardian.health | 24/7 during migration |
| Security Officer | security@guardian.health | Business hours |
| Product Manager | product@guardian.health | Business hours |

---

## 8. Success Criteria

### Migration Complete When:
- [ ] All v7 modules deployed successfully
- [ ] Data migration 100% complete with validation
- [ ] Performance within 10% of v6 baseline
- [ ] All security controls operational
- [ ] User acceptance testing passed
- [ ] Documentation updated
- [ ] Support team trained

### Rollback Criteria:
- Data loss > 0.1%
- Performance degradation > 25%
- Security vulnerability discovered
- Critical functionality broken
- User experience severely impacted

---

**Migration Status:** Ready for Execution  
**Next Steps:** Begin Phase 1 infrastructure preparation upon approval