-- Connection Pooling & Database Monitoring Configuration for Guardian Healthcare Platform
-- Date: 2025-08-01
-- Author: Sergei - Infrastructure Specialist
-- Purpose: Setup database monitoring, alerting, and connection optimization

-- =============================================================================
-- DATABASE CONFIGURATION OPTIMIZATION
-- =============================================================================

-- These settings optimize PostgreSQL for the Guardian healthcare workload
-- Note: Some settings require superuser privileges and may need to be applied via Supabase dashboard

-- Connection and memory settings (to be applied via Supabase configuration)
/*
Recommended Supabase Configuration Settings:
- max_connections: 100-200 (depending on plan)
- shared_buffers: 25% of available RAM
- effective_cache_size: 75% of available RAM
- work_mem: 4MB-16MB (depending on concurrent users)
- maintenance_work_mem: 256MB-1GB
- checkpoint_timeout: 10min-15min
- checkpoint_completion_target: 0.9
- wal_buffers: 16MB
- default_statistics_target: 100-500 (for healthcare data analysis)
*/

-- =============================================================================
-- PERFORMANCE MONITORING VIEWS
-- =============================================================================

-- Create comprehensive monitoring views for database performance
CREATE OR REPLACE VIEW db_performance_overview AS
SELECT 
    -- Connection statistics
    (SELECT count(*) FROM pg_stat_activity WHERE state = 'active') as active_connections,
    (SELECT count(*) FROM pg_stat_activity WHERE state = 'idle') as idle_connections,
    (SELECT count(*) FROM pg_stat_activity WHERE state = 'idle in transaction') as idle_in_transaction,
    
    -- Query performance
    (SELECT count(*) FROM pg_stat_activity WHERE query_start < now() - interval '1 minute') as long_running_queries,
    
    -- Database size
    pg_size_pretty(pg_database_size(current_database())) as database_size,
    
    -- Cache hit ratio (should be > 95%)
    round(
        100.0 * sum(blks_hit) / nullif(sum(blks_hit) + sum(blks_read), 0), 2
    ) as cache_hit_ratio,
    
    -- Transaction statistics
    sum(xact_commit) as total_commits,
    sum(xact_rollback) as total_rollbacks,
    round(100.0 * sum(xact_rollback) / nullif(sum(xact_commit) + sum(xact_rollback), 0), 2) as rollback_ratio
    
FROM pg_stat_database 
WHERE datname = current_database();

-- Table-level performance monitoring
CREATE OR REPLACE VIEW table_performance_stats AS
SELECT 
    schemaname,
    tablename,
    seq_scan,
    seq_tup_read,
    idx_scan,
    idx_tup_fetch,
    n_tup_ins as inserts,
    n_tup_upd as updates,
    n_tup_del as deletes,
    n_live_tup as live_tuples,
    n_dead_tup as dead_tuples,
    -- Calculate index usage ratio
    round(
        100.0 * idx_scan / nullif(seq_scan + idx_scan, 0), 2
    ) as index_usage_ratio,
    -- Table bloat indicator
    round(100.0 * n_dead_tup / nullif(n_live_tup + n_dead_tup, 0), 2) as dead_tuple_ratio,
    last_vacuum,
    last_autovacuum,
    last_analyze,
    last_autoanalyze
FROM pg_stat_user_tables
ORDER BY (seq_scan + idx_scan) DESC;

-- Query performance monitoring (requires pg_stat_statements)
CREATE OR REPLACE VIEW slow_queries_analysis AS
SELECT 
    query,
    calls,
    total_exec_time,
    mean_exec_time,
    max_exec_time,
    stddev_exec_time,
    rows,
    100.0 * shared_blks_hit / nullif(shared_blks_hit + shared_blks_read, 0) as hit_percent
FROM pg_stat_statements 
WHERE query NOT LIKE '%pg_stat_statements%'
AND query NOT LIKE '%information_schema%'
ORDER BY total_exec_time DESC
LIMIT 20;

-- =============================================================================
-- HEALTHCARE-SPECIFIC MONITORING
-- =============================================================================

-- Guardian application health metrics
CREATE OR REPLACE VIEW guardian_health_metrics AS
SELECT 
    -- Document processing metrics
    (SELECT count(*) FROM documents WHERE status = 'uploaded') as documents_pending_processing,
    (SELECT count(*) FROM documents WHERE status = 'processing') as documents_currently_processing,
    (SELECT count(*) FROM documents WHERE status = 'completed') as documents_completed,
    (SELECT count(*) FROM documents WHERE status = 'failed') as documents_failed,
    
    -- Data quality metrics
    (SELECT count(*) FROM data_quality_flags WHERE status = 'pending') as quality_flags_pending,
    (SELECT count(*) FROM data_quality_flags WHERE severity = 'critical' AND status = 'pending') as critical_flags_pending,
    
    -- User activity metrics
    (SELECT count(DISTINCT user_id) FROM documents WHERE created_at > now() - interval '24 hours') as active_users_24h,
    (SELECT count(*) FROM documents WHERE created_at > now() - interval '24 hours') as documents_uploaded_24h,
    
    -- Medical data normalization metrics
    (SELECT count(*) FROM documents WHERE normalization_status = 'pending') as normalization_pending,
    (SELECT count(*) FROM documents WHERE normalization_status = 'failed') as normalization_failed,
    
    -- Processing pipeline health
    (SELECT avg(extract(epoch from (processed_at - created_at))) FROM documents WHERE processed_at IS NOT NULL) as avg_processing_time_seconds;

-- Medical data volume tracking
CREATE OR REPLACE VIEW medical_data_volume_stats AS
SELECT 
    'medications' as data_type,
    count(*) as total_records,
    count(*) FILTER (WHERE status = 'active') as active_records,
    count(*) FILTER (WHERE created_at > now() - interval '7 days') as recent_records
FROM patient_medications
UNION ALL
SELECT 
    'allergies' as data_type,
    count(*) as total_records,
    count(*) FILTER (WHERE status = 'active') as active_records,
    count(*) FILTER (WHERE created_at > now() - interval '7 days') as recent_records
FROM patient_allergies
UNION ALL
SELECT 
    'conditions' as data_type,
    count(*) as total_records,
    count(*) FILTER (WHERE status = 'active') as active_records,
    count(*) FILTER (WHERE created_at > now() - interval '7 days') as recent_records
FROM patient_conditions
UNION ALL
SELECT 
    'lab_results' as data_type,
    count(*) as total_records,
    count(*) as active_records, -- Lab results don't have status
    count(*) FILTER (WHERE created_at > now() - interval '7 days') as recent_records
FROM patient_lab_results
UNION ALL
SELECT 
    'vitals' as data_type,
    count(*) as total_records,
    count(*) as active_records, -- Vitals don't have status
    count(*) FILTER (WHERE created_at > now() - interval '7 days') as recent_records
FROM patient_vitals;

-- =============================================================================
-- AUTOMATED ALERTING FUNCTIONS
-- =============================================================================

-- Function to check system health and generate alerts
CREATE OR REPLACE FUNCTION check_system_health()
RETURNS TABLE (
    alert_level text,
    alert_category text,
    alert_message text,
    metric_value numeric,
    threshold numeric,
    action_required text
) AS $$
BEGIN
    RETURN QUERY
    WITH health_checks AS (
        -- Check cache hit ratio
        SELECT 
            CASE WHEN cache_hit_ratio < 95 THEN 'WARNING' ELSE 'OK' END as level,
            'PERFORMANCE' as category,
            'Database cache hit ratio is low' as message,
            cache_hit_ratio as value,
            95.0 as threshold,
            'Consider increasing shared_buffers or investigating query patterns' as action
        FROM db_performance_overview
        WHERE cache_hit_ratio < 95
        
        UNION ALL
        
        -- Check for long-running queries
        SELECT 
            CASE WHEN long_running_queries > 5 THEN 'CRITICAL' ELSE 'OK' END as level,
            'PERFORMANCE' as category,
            'Multiple long-running queries detected' as message,
            long_running_queries::numeric as value,
            5.0 as threshold,
            'Investigate slow queries and consider query optimization' as action
        FROM db_performance_overview
        WHERE long_running_queries > 5
        
        UNION ALL
        
        -- Check critical quality flags
        SELECT 
            CASE WHEN critical_flags_pending > 0 THEN 'CRITICAL' ELSE 'OK' END as level,
            'DATA_QUALITY' as category,
            'Critical data quality flags require immediate attention' as message,
            critical_flags_pending::numeric as value,
            0.0 as threshold,
            'Review and resolve critical data quality flags in Guardian dashboard' as action
        FROM guardian_health_metrics
        WHERE critical_flags_pending > 0
        
        UNION ALL
        
        -- Check processing pipeline backlog
        SELECT 
            CASE WHEN documents_pending_processing > 100 THEN 'WARNING' ELSE 'OK' END as level,
            'PROCESSING' as category,
            'Document processing backlog is high' as message,
            documents_pending_processing::numeric as value,
            100.0 as threshold,
            'Check document processing pipeline and Edge Function performance' as action
        FROM guardian_health_metrics
        WHERE documents_pending_processing > 100
        
        UNION ALL
        
        -- Check failed processing rate
        SELECT 
            CASE WHEN documents_failed > documents_completed * 0.05 THEN 'WARNING' ELSE 'OK' END as level,
            'PROCESSING' as category,
            'High document processing failure rate' as message,
            (documents_failed::numeric / nullif(documents_completed, 0) * 100) as value,
            5.0 as threshold,
            'Investigate document processing errors and improve error handling' as action
        FROM guardian_health_metrics
        WHERE documents_failed > documents_completed * 0.05
    )
    SELECT 
        hc.level,
        hc.category,
        hc.message,
        hc.value,
        hc.threshold,
        hc.action
    FROM health_checks hc
    WHERE hc.level != 'OK';
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- CONNECTION POOL MONITORING
-- =============================================================================

-- Function to monitor connection pool health
CREATE OR REPLACE FUNCTION monitor_connection_pool()
RETURNS TABLE (
    metric_name text,
    current_value bigint,
    recommended_max bigint,
    status text,
    recommendation text
) AS $$
BEGIN
    RETURN QUERY
    WITH connection_stats AS (
        SELECT 
            count(*) as total_connections,
            count(*) FILTER (WHERE state = 'active') as active_connections,
            count(*) FILTER (WHERE state = 'idle') as idle_connections,
            count(*) FILTER (WHERE state = 'idle in transaction') as idle_in_transaction,
            count(*) FILTER (WHERE state = 'idle in transaction (aborted)') as aborted_transactions
        FROM pg_stat_activity
        WHERE pid != pg_backend_pid()
    )
    SELECT 
        'Total Connections'::text,
        cs.total_connections,
        current_setting('max_connections')::bigint,
        CASE 
            WHEN cs.total_connections > current_setting('max_connections')::bigint * 0.8 THEN 'WARNING'
            WHEN cs.total_connections > current_setting('max_connections')::bigint * 0.9 THEN 'CRITICAL'
            ELSE 'OK'
        END,
        CASE 
            WHEN cs.total_connections > current_setting('max_connections')::bigint * 0.8 
            THEN 'Consider implementing connection pooling or increasing max_connections'
            ELSE 'Connection usage is within normal limits'
        END
    FROM connection_stats cs
    
    UNION ALL
    
    SELECT 
        'Idle in Transaction'::text,
        cs.idle_in_transaction,
        5::bigint, -- Recommended max
        CASE 
            WHEN cs.idle_in_transaction > 5 THEN 'WARNING'
            WHEN cs.idle_in_transaction > 10 THEN 'CRITICAL'
            ELSE 'OK'
        END,
        CASE 
            WHEN cs.idle_in_transaction > 5 
            THEN 'Review application transaction handling - may indicate connection leaks'
            ELSE 'Idle in transaction connections are within normal limits'
        END
    FROM connection_stats cs;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- MAINTENANCE AUTOMATION
-- =============================================================================

-- Function for automated maintenance tasks
CREATE OR REPLACE FUNCTION run_maintenance_tasks()
RETURNS TABLE (
    task_name text,
    status text,
    details text,
    execution_time interval
) AS $$
DECLARE
    start_time timestamp;
    end_time timestamp;
BEGIN
    -- Update table statistics for query planner
    start_time := clock_timestamp();
    ANALYZE;
    end_time := clock_timestamp();
    
    RETURN QUERY SELECT 
        'ANALYZE Tables'::text,
        'COMPLETED'::text,
        'Updated table statistics for query planner'::text,
        (end_time - start_time)::interval;
    
    -- Clean up old audit records (keep 90 days)
    start_time := clock_timestamp();
    DELETE FROM data_quality_audit WHERE created_at < now() - interval '90 days';
    end_time := clock_timestamp();
    
    RETURN QUERY SELECT 
        'Cleanup Audit Records'::text,
        'COMPLETED'::text,
        format('Removed audit records older than 90 days')::text,
        (end_time - start_time)::interval;
        
    -- Update materialized views if any exist
    -- Note: Guardian doesn't currently use materialized views, but this is a placeholder
    RETURN QUERY SELECT 
        'Refresh Materialized Views'::text,
        'SKIPPED'::text,
        'No materialized views to refresh'::text,
        '0 seconds'::interval;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- QUERY OPTIMIZATION HELPERS
-- =============================================================================

-- Function to identify missing indexes based on query patterns
CREATE OR REPLACE FUNCTION suggest_missing_indexes()
RETURNS TABLE (
    table_name text,
    suggested_index text,
    reason text,
    priority text
) AS $$
BEGIN
    RETURN QUERY
    -- Check for tables with high sequential scan ratios
    WITH table_scan_stats AS (
        SELECT 
            schemaname,
            tablename,
            seq_scan,
            idx_scan,
            CASE 
                WHEN seq_scan + idx_scan = 0 THEN 0
                ELSE round(100.0 * seq_scan / (seq_scan + idx_scan), 2)
            END as seq_scan_ratio
        FROM pg_stat_user_tables
        WHERE schemaname = 'public'
    )
    SELECT 
        tss.tablename::text,
        format('CREATE INDEX idx_%s_user_id ON %s(user_id);', tss.tablename, tss.tablename)::text,
        format('Table has %.1f%% sequential scans, likely needs user_id index', tss.seq_scan_ratio)::text,
        CASE 
            WHEN tss.seq_scan_ratio > 50 THEN 'HIGH'
            WHEN tss.seq_scan_ratio > 25 THEN 'MEDIUM'
            ELSE 'LOW'
        END::text
    FROM table_scan_stats tss
    WHERE tss.seq_scan_ratio > 25
    AND tss.tablename LIKE 'patient_%'
    AND NOT EXISTS (
        SELECT 1 FROM pg_indexes 
        WHERE tablename = tss.tablename 
        AND indexdef LIKE '%user_id%'
    );
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- GRANTS AND PERMISSIONS
-- =============================================================================

-- Grant permissions for monitoring functions to authenticated users
GRANT SELECT ON db_performance_overview TO authenticated;
GRANT SELECT ON table_performance_stats TO authenticated;
GRANT SELECT ON guardian_health_metrics TO authenticated;
GRANT SELECT ON medical_data_volume_stats TO authenticated;

GRANT EXECUTE ON FUNCTION check_system_health TO authenticated;
GRANT EXECUTE ON FUNCTION monitor_connection_pool TO authenticated;
GRANT EXECUTE ON FUNCTION suggest_missing_indexes TO authenticated;

-- Maintenance functions should be restricted to service role or administrators
REVOKE EXECUTE ON FUNCTION run_maintenance_tasks FROM PUBLIC;
-- GRANT EXECUTE ON FUNCTION run_maintenance_tasks TO service_role;

-- =============================================================================
-- DOCUMENTATION AND COMMENTS
-- =============================================================================

COMMENT ON VIEW db_performance_overview IS 'Comprehensive database performance metrics for monitoring';
COMMENT ON VIEW table_performance_stats IS 'Table-level performance statistics including index usage';
COMMENT ON VIEW guardian_health_metrics IS 'Guardian-specific application health metrics';
COMMENT ON VIEW medical_data_volume_stats IS 'Medical data volume tracking across all clinical tables';

COMMENT ON FUNCTION check_system_health IS 'Automated system health checks with alerting thresholds';
COMMENT ON FUNCTION monitor_connection_pool IS 'Connection pool health monitoring and recommendations';
COMMENT ON FUNCTION run_maintenance_tasks IS 'Automated database maintenance tasks (restricted access)';
COMMENT ON FUNCTION suggest_missing_indexes IS 'Analyze query patterns and suggest missing indexes';

-- =============================================================================
-- USAGE INSTRUCTIONS
-- =============================================================================

/*
MONITORING QUERIES FOR GUARDIAN HEALTHCARE PLATFORM:

-- Check overall system health
SELECT * FROM check_system_health();

-- Monitor database performance
SELECT * FROM db_performance_overview;

-- Check Guardian application metrics
SELECT * FROM guardian_health_metrics;

-- Monitor connection pool
SELECT * FROM monitor_connection_pool();

-- Analyze table performance
SELECT * FROM table_performance_stats WHERE tablename LIKE 'patient_%';

-- Check for slow queries (requires pg_stat_statements)
SELECT * FROM slow_queries_analysis;

-- Get index suggestions
SELECT * FROM suggest_missing_indexes();

-- Run maintenance (service role only)
SELECT * FROM run_maintenance_tasks();

RECOMMENDED MONITORING SCHEDULE:
- check_system_health(): Every 5 minutes
- guardian_health_metrics: Every 15 minutes  
- connection pool monitoring: Every 10 minutes
- Performance analysis: Daily
- Maintenance tasks: Weekly
*/