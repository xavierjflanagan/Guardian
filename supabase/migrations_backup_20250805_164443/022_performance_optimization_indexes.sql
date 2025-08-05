-- Performance Optimization: Critical Index Strategy for Guardian Healthcare Platform
-- Date: 2025-08-01
-- Author: Sergei - Infrastructure Specialist

-- =============================================================================
-- CRITICAL PERFORMANCE INDEXES - PHASE 1: Core Query Patterns
-- =============================================================================

-- Documents table optimization for main dashboard queries
-- Current query: SELECT * FROM documents WHERE user_id = ? ORDER BY created_at DESC
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_documents_user_created_desc 
    ON documents(user_id, created_at DESC);

-- Documents status filtering with user isolation
-- Query: SELECT * FROM documents WHERE user_id = ? AND status IN ('completed', 'processing')
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_documents_user_status_created 
    ON documents(user_id, status, created_at DESC);

-- Documents processing pipeline optimization
-- Query: SELECT * FROM documents WHERE status = 'uploaded' AND normalization_status = 'pending'
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_documents_processing_pipeline 
    ON documents(status, normalization_status, created_at) 
    WHERE status IN ('uploaded', 'processing') AND normalization_status = 'pending';

-- Medical data search optimization (JSONB GIN index already exists, but add specific extractions)
-- Query: SELECT * FROM documents WHERE medical_data->>'documentType' = 'Lab Results'
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_documents_medical_data_document_type 
    ON documents((medical_data->>'documentType'));

-- Patient name extraction for search
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_documents_medical_data_patient_name 
    ON documents((medical_data->'patientInfo'->>'name'));

-- =============================================================================
-- NORMALIZED MEDICAL TABLES - PHASE 2: Clinical Data Access Patterns
-- =============================================================================

-- Patient medications - dashboard "active medications" query
-- Query: SELECT * FROM patient_medications WHERE user_id = ? AND status = 'active' ORDER BY updated_at DESC
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_patient_medications_user_active_updated 
    ON patient_medications(user_id, updated_at DESC) 
    WHERE status = 'active';

-- Medication search and deduplication
-- Query: SELECT * FROM patient_medications WHERE user_id = ? AND normalized_name ILIKE '%name%'
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_patient_medications_normalized_search 
    ON patient_medications(user_id, normalized_name text_pattern_ops);

-- Patient allergies - critical safety queries
-- Query: SELECT * FROM patient_allergies WHERE user_id = ? AND status = 'active' AND severity = 'life-threatening'
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_patient_allergies_critical_safety 
    ON patient_allergies(user_id, status, severity) 
    WHERE status = 'active' AND severity IN ('severe', 'life-threatening');

-- Patient conditions - chronic disease management
-- Query: SELECT * FROM patient_conditions WHERE user_id = ? AND status IN ('active', 'chronic')
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_patient_conditions_active_chronic 
    ON patient_conditions(user_id, status, updated_at DESC) 
    WHERE status IN ('active', 'chronic');

-- Lab results trending - time series queries
-- Query: SELECT * FROM patient_lab_results WHERE user_id = ? AND normalized_test_name = ? ORDER BY test_date DESC
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_patient_lab_results_trending 
    ON patient_lab_results(user_id, normalized_test_name, test_date DESC);

-- Vital signs trending
-- Query: SELECT * FROM patient_vitals WHERE user_id = ? AND measurement_date >= ? ORDER BY measurement_date DESC
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_patient_vitals_recent_trend 
    ON patient_vitals(user_id, measurement_date DESC);

-- =============================================================================
-- DATA QUALITY SYSTEM - PHASE 3: Quality Guardian Performance
-- =============================================================================

-- Quality flags dashboard queries
-- Query: SELECT * FROM data_quality_flags WHERE profile_id IN (...) AND status = 'pending' ORDER BY severity, created_at
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_data_quality_flags_pending_priority 
    ON data_quality_flags(profile_id, status, severity, created_at DESC) 
    WHERE status = 'pending';

-- Document quality flag lookup
-- Query: SELECT * FROM data_quality_flags WHERE document_id = ? AND status = 'pending'
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_data_quality_flags_document_pending 
    ON data_quality_flags(document_id, status) 
    WHERE status = 'pending';

-- Critical flags notification system
-- Query: SELECT * FROM data_quality_flags WHERE profile_id = ? AND severity = 'critical' AND status = 'pending'
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_data_quality_flags_critical_alerts 
    ON data_quality_flags(profile_id, severity, status, created_at DESC) 
    WHERE severity = 'critical' AND status = 'pending';

-- Quality audit trail queries
-- Query: SELECT * FROM data_quality_audit WHERE user_id = ? ORDER BY created_at DESC LIMIT 50
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_data_quality_audit_user_timeline 
    ON data_quality_audit(user_id, created_at DESC);

-- =============================================================================
-- SOURCE TRACEABILITY - PHASE 4: Document-to-Clinical Data Relationships
-- =============================================================================

-- Document source tracking (array containment queries)
-- Query: SELECT * FROM patient_medications WHERE ? = ANY(source_document_ids)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_patient_medications_source_documents 
    ON patient_medications USING gin(source_document_ids);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_patient_allergies_source_documents 
    ON patient_allergies USING gin(source_document_ids);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_patient_conditions_source_documents 
    ON patient_conditions USING gin(source_document_ids);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_patient_providers_source_documents 
    ON patient_providers USING gin(source_document_ids);

-- =============================================================================
-- SOFT DELETE OPTIMIZATION - PHASE 5: Deleted Record Filtering
-- =============================================================================

-- Exclude soft-deleted records efficiently
-- Query: SELECT * FROM documents WHERE user_id = ? AND (is_deleted = false OR is_deleted IS NULL)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_documents_active_records 
    ON documents(user_id, created_at DESC) 
    WHERE (is_deleted = false OR is_deleted IS NULL);

-- Soft-deleted records management
-- Query: SELECT * FROM documents WHERE is_deleted = true AND deleted_at > ?
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_documents_deleted_recovery 
    ON documents(deleted_at DESC, deleted_by) 
    WHERE is_deleted = true;

-- =============================================================================
-- PERFORMANCE STATISTICS COLLECTION
-- =============================================================================

-- Enable query statistics collection for monitoring
-- This helps identify slow queries and optimization opportunities
DO $$
BEGIN
    -- Enable pg_stat_statements extension if available
    IF EXISTS (
        SELECT 1 FROM pg_available_extensions 
        WHERE name = 'pg_stat_statements' AND installed_version IS NULL
    ) THEN
        CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
    END IF;
END $$;

-- =============================================================================
-- INDEX MAINTENANCE FUNCTIONS
-- =============================================================================

-- Function to monitor index usage statistics
CREATE OR REPLACE FUNCTION get_index_usage_stats()
RETURNS TABLE (
    schemaname text,
    tablename text,
    indexname text,
    num_rows bigint,
    table_size text,
    index_size text,
    unique_indexes boolean,
    idx_scan bigint,
    idx_tup_read bigint,
    idx_tup_fetch bigint
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        s.schemaname::text,
        s.tablename::text,
        s.indexname::text,
        pg_class.reltuples::bigint as num_rows,
        pg_size_pretty(pg_total_relation_size(s.tablename::regclass))::text as table_size,
        pg_size_pretty(pg_total_relation_size(s.indexname::regclass))::text as index_size,
        i.indisunique as unique_indexes,
        stat.idx_scan,
        stat.idx_tup_read,
        stat.idx_tup_fetch
    FROM pg_stat_user_indexes stat
    JOIN pg_stat_user_tables s ON s.relid = stat.relid
    JOIN pg_class ON pg_class.oid = stat.relid
    JOIN pg_index i ON i.indexrelid = stat.indexrelid
    WHERE s.schemaname = 'public'
    ORDER BY stat.idx_scan DESC;
END;
$$ LANGUAGE plpgsql;

-- Function to identify unused indexes
CREATE OR REPLACE FUNCTION get_unused_indexes()
RETURNS TABLE (
    schemaname text,
    tablename text,
    indexname text,
    index_size text,
    idx_scan bigint
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        s.schemaname::text,
        s.tablename::text,
        s.indexname::text,
        pg_size_pretty(pg_total_relation_size(s.indexname::regclass))::text as index_size,
        stat.idx_scan
    FROM pg_stat_user_indexes stat
    JOIN pg_stat_user_tables s ON s.relid = stat.relid
    WHERE s.schemaname = 'public'
    AND stat.idx_scan < 10  -- Less than 10 scans since last stats reset
    ORDER BY pg_total_relation_size(s.indexname::regclass) DESC;
END;
$$ LANGUAGE plpgsql;

-- Grant permissions for monitoring functions
GRANT EXECUTE ON FUNCTION get_index_usage_stats() TO authenticated;
GRANT EXECUTE ON FUNCTION get_unused_indexes() TO authenticated;

-- Add monitoring comments
COMMENT ON FUNCTION get_index_usage_stats() IS 'Monitor index usage patterns for performance optimization';
COMMENT ON FUNCTION get_unused_indexes() IS 'Identify potentially unused indexes for cleanup';

-- Performance optimization complete - indexes created with CONCURRENTLY to avoid blocking
-- Monitor index usage with: SELECT * FROM get_index_usage_stats();
-- Check for unused indexes with: SELECT * FROM get_unused_indexes();