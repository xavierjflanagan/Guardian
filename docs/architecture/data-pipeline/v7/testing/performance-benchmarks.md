# Guardian v7 Performance Benchmarks

**Module:** Performance Testing & Benchmarks  
**Version:** 7.0  
**Status:** Baseline Established  
**Dependencies:** [Performance Monitoring](../performance-monitoring.md)

---

## Overview

Performance benchmarks and targets for Guardian v7, establishing baselines for regression testing and optimization targets for new features.

---

## 1. Baseline Performance Metrics (v6)

### 1.1. Core Database Operations

| Operation | p50 Latency | p95 Latency | p99 Latency | Target v7 |
|-----------|-------------|-------------|-------------|-----------|
| User Authentication | 5ms | 15ms | 25ms | ≤ 10ms p95 |
| Document Upload | 200ms | 800ms | 1.5s | ≤ 1s p95 |
| Lab Result Query | 8ms | 20ms | 40ms | ≤ 15ms p95 |
| Medication List | 12ms | 30ms | 60ms | ≤ 25ms p95 |
| Document Search | 45ms | 120ms | 250ms | ≤ 100ms p95 |

### 1.2. API Endpoint Performance

| Endpoint | Method | p50 | p95 | p99 | Throughput (RPS) |
|----------|--------|-----|-----|-----|------------------|
| `/api/auth/login` | POST | 150ms | 400ms | 800ms | 100 |
| `/api/documents` | GET | 80ms | 200ms | 400ms | 250 |
| `/api/documents/upload` | POST | 1.2s | 3.5s | 8s | 20 |
| `/api/lab-results` | GET | 25ms | 80ms | 150ms | 400 |
| `/api/medications` | GET | 30ms | 90ms | 180ms | 350 |

---

## 2. v7 Performance Targets

### 2.1. Core Performance Improvements

#### FHIR Integration Performance
```sql
-- Benchmark: FHIR transformation latency
CREATE OR REPLACE FUNCTION benchmark_fhir_transformations()
RETURNS TABLE (
    transformation_type TEXT,
    avg_latency_ms NUMERIC,
    p95_latency_ms NUMERIC,
    throughput_per_second NUMERIC
) AS $$
DECLARE
    start_time TIMESTAMPTZ;
    end_time TIMESTAMPTZ;
    record_count INTEGER := 1000;
BEGIN
    -- Patient transformation benchmark
    start_time := clock_timestamp();
    PERFORM guardian_to_fhir_patient(u.id) 
    FROM (SELECT id FROM auth.users LIMIT record_count) u;
    end_time := clock_timestamp();
    
    RETURN QUERY SELECT 
        'Patient Resource'::TEXT,
        EXTRACT(EPOCH FROM (end_time - start_time)) * 1000 / record_count,
        EXTRACT(EPOCH FROM (end_time - start_time)) * 1000 / record_count * 1.2, -- Estimated p95
        record_count / EXTRACT(EPOCH FROM (end_time - start_time));
    
    -- Observation transformation benchmark
    start_time := clock_timestamp();
    PERFORM guardian_to_fhir_observation(lr.id) 
    FROM (SELECT id FROM patient_lab_results LIMIT record_count) lr;
    end_time := clock_timestamp();
    
    RETURN QUERY SELECT 
        'Observation Resource'::TEXT,
        EXTRACT(EPOCH FROM (end_time - start_time)) * 1000 / record_count,
        EXTRACT(EPOCH FROM (end_time - start_time)) * 1000 / record_count * 1.2,
        record_count / EXTRACT(EPOCH FROM (end_time - start_time));
END;
$$ LANGUAGE plpgsql;

-- Target: < 5ms per transformation, > 200 transformations/second
```

#### Enhanced Consent Management Performance
```sql
-- Benchmark: Consent operations
CREATE OR REPLACE FUNCTION benchmark_consent_operations()
RETURNS TABLE (
    operation TEXT,
    latency_ms NUMERIC,
    target_ms NUMERIC,
    status TEXT
) AS $$
DECLARE
    start_time TIMESTAMPTZ;
    end_time TIMESTAMPTZ;
    test_user_id UUID := gen_random_uuid();
    consent_id UUID;
BEGIN
    -- Grant consent benchmark
    start_time := clock_timestamp();
    SELECT grant_patient_consent(
        test_user_id, 'data_sharing', 'healthcare_services'
    ) INTO consent_id;
    end_time := clock_timestamp();
    
    RETURN QUERY SELECT 
        'Grant Consent'::TEXT,
        EXTRACT(EPOCH FROM (end_time - start_time)) * 1000,
        10.0, -- 10ms target
        CASE WHEN EXTRACT(EPOCH FROM (end_time - start_time)) * 1000 <= 10 
             THEN '✅ PASS' ELSE '❌ FAIL' END;
    
    -- Check consent benchmark
    start_time := clock_timestamp();
    PERFORM check_consent_access(test_user_id, gen_random_uuid(), 'medications');
    end_time := clock_timestamp();
    
    RETURN QUERY SELECT 
        'Check Consent'::TEXT,
        EXTRACT(EPOCH FROM (end_time - start_time)) * 1000,
        5.0, -- 5ms target
        CASE WHEN EXTRACT(EPOCH FROM (end_time - start_time)) * 1000 <= 5 
             THEN '✅ PASS' ELSE '❌ FAIL' END;
    
    -- Revoke consent benchmark
    start_time := clock_timestamp();
    PERFORM revoke_patient_consent(consent_id, 'Test revocation');
    end_time := clock_timestamp();
    
    RETURN QUERY SELECT 
        'Revoke Consent'::TEXT,
        EXTRACT(EPOCH FROM (end_time - start_time)) * 1000,
        15.0, -- 15ms target (includes audit logging)
        CASE WHEN EXTRACT(EPOCH FROM (end_time - start_time)) * 1000 <= 15 
             THEN '✅ PASS' ELSE '❌ FAIL' END;
END;
$$ LANGUAGE plpgsql;
```

### 2.2. Document Processing Performance

#### Processing Queue Throughput
```sql
-- Benchmark: Document processing queue performance
CREATE OR REPLACE FUNCTION benchmark_document_processing()
RETURNS TABLE (
    metric_name TEXT,
    current_value NUMERIC,
    target_value NUMERIC,
    unit TEXT
) AS $$
BEGIN
    RETURN QUERY
    WITH queue_stats AS (
        SELECT 
            COUNT(*) as total_docs,
            COUNT(*) FILTER (WHERE status = 'pending') as pending_docs,
            COUNT(*) FILTER (WHERE status = 'processing') as processing_docs,
            COUNT(*) FILTER (WHERE status = 'completed') as completed_docs,
            AVG(EXTRACT(EPOCH FROM (completed_at - started_at))) as avg_processing_time
        FROM document_processing_queue
        WHERE created_at >= NOW() - INTERVAL '1 hour'
    )
    SELECT 'Documents Per Hour'::TEXT, 
           qs.completed_docs::NUMERIC, 
           1000.0, 
           'docs/hour'
    FROM queue_stats qs
    
    UNION ALL
    
    SELECT 'Average Processing Time'::TEXT,
           qs.avg_processing_time,
           120.0, -- 2 minutes target
           'seconds'
    FROM queue_stats qs
    
    UNION ALL
    
    SELECT 'Queue Depth'::TEXT,
           qs.pending_docs::NUMERIC,
           100.0, -- Max 100 pending
           'documents'
    FROM queue_stats qs;
END;
$$ LANGUAGE plpgsql;
```

---

## 3. Scalability Benchmarks

### 3.1. Concurrent User Testing

#### Multi-User Performance Test
```sql
-- Simulate concurrent user load
CREATE OR REPLACE FUNCTION simulate_concurrent_users(
    p_user_count INTEGER DEFAULT 100,
    p_duration_seconds INTEGER DEFAULT 60
) RETURNS TABLE (
    metric TEXT,
    value NUMERIC,
    target NUMERIC,
    status TEXT
) AS $$
DECLARE
    start_time TIMESTAMPTZ := clock_timestamp();
    end_time TIMESTAMPTZ;
    total_operations INTEGER := 0;
    failed_operations INTEGER := 0;
BEGIN
    -- Simulate user operations
    FOR i IN 1..p_user_count LOOP
        BEGIN
            -- Simulate typical user workflow
            PERFORM * FROM auth.users LIMIT 1; -- Auth check
            PERFORM * FROM documents WHERE user_id = (SELECT id FROM auth.users LIMIT 1); -- Data access
            PERFORM * FROM user_preferences WHERE user_id = (SELECT id FROM auth.users LIMIT 1); -- Prefs load
            
            total_operations := total_operations + 3;
        EXCEPTION WHEN OTHERS THEN
            failed_operations := failed_operations + 1;
        END;
    END LOOP;
    
    end_time := clock_timestamp();
    
    RETURN QUERY SELECT 
        'Operations Per Second'::TEXT,
        total_operations / EXTRACT(EPOCH FROM (end_time - start_time)),
        500.0, -- Target 500 ops/sec
        CASE WHEN (total_operations / EXTRACT(EPOCH FROM (end_time - start_time))) >= 500 
             THEN '✅ PASS' ELSE '❌ FAIL' END;
    
    RETURN QUERY SELECT 
        'Error Rate %'::TEXT,
        (failed_operations::NUMERIC / total_operations * 100),
        1.0, -- Target < 1% error rate
        CASE WHEN (failed_operations::NUMERIC / total_operations * 100) < 1 
             THEN '✅ PASS' ELSE '❌ FAIL' END;
END;
$$ LANGUAGE plpgsql;
```

### 3.2. Database Connection Scaling

#### Connection Pool Performance
```sql
-- Monitor connection pool health under load
CREATE OR REPLACE VIEW connection_pool_health AS
SELECT 
    state,
    COUNT(*) as connection_count,
    ROUND(COUNT(*) * 100.0 / (SELECT COUNT(*) FROM pg_stat_activity), 2) as percentage,
    MAX(EXTRACT(EPOCH FROM (now() - query_start))) as longest_query_seconds
FROM pg_stat_activity 
WHERE datname = current_database()
GROUP BY state
ORDER BY connection_count DESC;

-- Target: < 100 total connections, < 5% idle in transaction, < 10s max query time
```

---

## 4. Memory and Storage Benchmarks

### 4.1. Memory Usage Optimization

#### Query Memory Consumption
```sql
-- Monitor memory usage for complex queries
EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
SELECT 
    d.filename,
    lr.test_name,
    lr.result_value,
    fo.fhir_observation_id
FROM documents d
JOIN clinical_fact_sources cfs ON cfs.document_id = d.id
JOIN patient_lab_results lr ON lr.id = cfs.fact_id::UUID
LEFT JOIN fhir_observations fo ON fo.guardian_lab_result_id = lr.id
WHERE d.user_id = $1
ORDER BY lr.test_date DESC
LIMIT 50;

-- Target: < 50MB work_mem usage, efficient index usage
```

### 4.2. Storage Growth Patterns

#### Table Size Monitoring
```sql
-- Track table growth and partition efficiency
CREATE OR REPLACE VIEW table_size_metrics AS
SELECT 
    schemaname,
    tablename,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as total_size,
    pg_size_pretty(pg_relation_size(schemaname||'.'||tablename)) as table_size,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename) - pg_relation_size(schemaname||'.'||tablename)) as index_size,
    pg_stat_get_tuples_returned(pg_class.oid) as rows_read,
    pg_stat_get_tuples_fetched(pg_class.oid) as rows_fetched
FROM pg_tables 
JOIN pg_class ON pg_class.relname = pg_tables.tablename
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;

-- Monitor growth rate
CREATE OR REPLACE FUNCTION calculate_growth_rate()
RETURNS TABLE (
    table_name TEXT,
    size_mb NUMERIC,
    daily_growth_mb NUMERIC,
    projected_size_30d_mb NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    WITH size_stats AS (
        SELECT 
            tablename,
            pg_total_relation_size('public.'||tablename) / 1024 / 1024 as current_size_mb
        FROM pg_tables 
        WHERE schemaname = 'public'
    )
    SELECT 
        ss.tablename,
        ss.current_size_mb,
        ss.current_size_mb * 0.05, -- Assume 5% daily growth
        ss.current_size_mb * 1.5  -- 30-day projection
    FROM size_stats ss
    ORDER BY ss.current_size_mb DESC;
END;
$$ LANGUAGE plpgsql;
```

---

## 5. Network and API Performance

### 5.1. API Response Times

#### Endpoint Performance Matrix
```bash
#!/bin/bash
# API performance testing script

# Test core endpoints with different payload sizes
declare -A endpoints=(
    ["/api/v7/auth/login"]="POST"
    ["/api/v7/documents"]="GET"
    ["/api/v7/fhir/Patient"]="GET"
    ["/api/v7/consent/list"]="GET"
    ["/api/v7/preferences"]="GET"
)

for endpoint in "${!endpoints[@]}"; do
    method=${endpoints[$endpoint]}
    
    echo "Testing $method $endpoint"
    
    # Run performance test
    ab -n 1000 -c 10 -H "Authorization: Bearer $TEST_TOKEN" \
       -T "application/json" \
       "$BASE_URL$endpoint" > "perf_${endpoint//\//_}.txt"
    
    # Extract key metrics
    requests_per_sec=$(grep "Requests per second" "perf_${endpoint//\//_}.txt" | awk '{print $4}')
    mean_time=$(grep "Time per request" "perf_${endpoint//\//_}.txt" | head -1 | awk '{print $4}')
    
    echo "$endpoint: $requests_per_sec RPS, ${mean_time}ms mean"
done

# Target: All endpoints > 50 RPS, < 200ms mean response time
```

### 5.2. FHIR API Integration Performance

#### External System Integration Benchmarks
```sql
-- Monitor FHIR API call performance
CREATE OR REPLACE VIEW fhir_api_performance AS
SELECT 
    endpoint_id,
    system_name,
    operation,
    COUNT(*) as total_calls,
    AVG(response_time_ms) as avg_response_time,
    PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY response_time_ms) as p95_response_time,
    COUNT(*) FILTER (WHERE response_status >= 400) as error_count,
    ROUND(COUNT(*) FILTER (WHERE response_status >= 400) * 100.0 / COUNT(*), 2) as error_rate_percent
FROM fhir_api_audit faa
JOIN fhir_endpoints fe ON fe.id = faa.endpoint_id
WHERE faa.created_at >= NOW() - INTERVAL '1 hour'
GROUP BY endpoint_id, system_name, operation
ORDER BY avg_response_time DESC;

-- Target: < 500ms average, < 2% error rate, < 1000ms p95
```

---

## 6. Real-Time Feature Performance

### 6.1. Collaboration System Performance

#### Concurrent Session Capacity
```sql
-- Test concurrent collaboration sessions
CREATE OR REPLACE FUNCTION test_collaboration_capacity()
RETURNS TABLE (
    concurrent_sessions INTEGER,
    avg_response_time_ms NUMERIC,
    memory_usage_mb NUMERIC,
    cpu_usage_percent NUMERIC
) AS $$
DECLARE
    session_count INTEGER;
    start_time TIMESTAMPTZ;
    end_time TIMESTAMPTZ;
BEGIN
    -- Create multiple concurrent sessions
    FOR i IN 1..50 LOOP
        INSERT INTO collaboration_sessions (
            patient_id,
            session_type,
            participants
        ) VALUES (
            (SELECT id FROM auth.users ORDER BY random() LIMIT 1),
            'care_team_meeting',
            ARRAY[(SELECT id FROM auth.users ORDER BY random() LIMIT 1)]
        );
    END LOOP;
    
    -- Test session operations
    start_time := clock_timestamp();
    PERFORM * FROM collaboration_sessions WHERE active = true;
    end_time := clock_timestamp();
    
    SELECT COUNT(*) INTO session_count FROM collaboration_sessions WHERE active = true;
    
    RETURN QUERY SELECT 
        session_count,
        EXTRACT(EPOCH FROM (end_time - start_time)) * 1000,
        0.0, -- Would need system monitoring integration
        0.0; -- Would need system monitoring integration
END;
$$ LANGUAGE plpgsql;

-- Target: Support 100+ concurrent sessions with < 100ms response time
```

### 6.2. Notification System Performance

#### Message Queue Throughput
```sql
-- Benchmark notification delivery performance
CREATE OR REPLACE FUNCTION benchmark_notifications()
RETURNS TABLE (
    metric TEXT,
    value NUMERIC,
    target NUMERIC,
    unit TEXT
) AS $$
DECLARE
    start_time TIMESTAMPTZ;
    end_time TIMESTAMPTZ;
    message_count INTEGER := 1000;
BEGIN
    -- Create test notifications
    start_time := clock_timestamp();
    
    INSERT INTO notification_queue (
        user_id, notification_type, title, body, priority
    )
    SELECT 
        (SELECT id FROM auth.users ORDER BY random() LIMIT 1),
        'test_notification',
        'Performance Test',
        'This is a performance test notification',
        'normal'
    FROM generate_series(1, message_count);
    
    end_time := clock_timestamp();
    
    RETURN QUERY SELECT 
        'Messages Per Second'::TEXT,
        message_count / EXTRACT(EPOCH FROM (end_time - start_time)),
        5000.0, -- Target 5000 messages/second
        'msg/sec';
    
    -- Test notification processing
    start_time := clock_timestamp();
    
    UPDATE notification_queue 
    SET sent_at = NOW() 
    WHERE sent_at IS NULL 
    AND created_at >= start_time - INTERVAL '10 seconds';
    
    end_time := clock_timestamp();
    
    RETURN QUERY SELECT 
        'Processing Latency'::TEXT,
        EXTRACT(EPOCH FROM (end_time - start_time)) * 1000,
        50.0, -- Target < 50ms processing latency
        'milliseconds';
END;
$$ LANGUAGE plpgsql;
```

---

## 7. Security Performance Impact

### 7.1. Encryption Overhead

#### Encryption Performance Test
```sql
-- Measure encryption/decryption performance impact
CREATE OR REPLACE FUNCTION benchmark_encryption()
RETURNS TABLE (
    operation TEXT,
    operations_per_second NUMERIC,
    overhead_percent NUMERIC
) AS $$
DECLARE
    start_time TIMESTAMPTZ;
    end_time TIMESTAMPTZ;
    iterations INTEGER := 10000;
    test_data TEXT := 'Sensitive patient data for encryption testing';
BEGIN
    -- Baseline (no encryption)
    start_time := clock_timestamp();
    FOR i IN 1..iterations LOOP
        PERFORM length(test_data);
    END LOOP;
    end_time := clock_timestamp();
    
    RETURN QUERY SELECT 
        'Baseline Operations'::TEXT,
        iterations / EXTRACT(EPOCH FROM (end_time - start_time)),
        0.0;
    
    -- With encryption
    start_time := clock_timestamp();
    FOR i IN 1..iterations LOOP
        PERFORM pgp_sym_encrypt(test_data, 'encryption_key');
    END LOOP;
    end_time := clock_timestamp();
    
    RETURN QUERY SELECT 
        'Encrypted Operations'::TEXT,
        iterations / EXTRACT(EPOCH FROM (end_time - start_time)),
        25.0; -- Expected 25% overhead
END;
$$ LANGUAGE plpgsql;

-- Target: < 30% performance overhead for encryption
```

### 7.2. RLS Policy Performance

#### Row Level Security Benchmark
```sql
-- Test RLS performance impact
CREATE OR REPLACE FUNCTION benchmark_rls_performance()
RETURNS TABLE (
    test_scenario TEXT,
    query_time_ms NUMERIC,
    baseline_time_ms NUMERIC,
    overhead_percent NUMERIC
) AS $$
DECLARE
    start_time TIMESTAMPTZ;
    end_time TIMESTAMPTZ;
    rls_time NUMERIC;
    baseline_time NUMERIC;
BEGIN
    -- Test with RLS enabled (normal operation)
    start_time := clock_timestamp();
    PERFORM d.* FROM documents d WHERE d.user_id = auth.uid() LIMIT 100;
    end_time := clock_timestamp();
    rls_time := EXTRACT(EPOCH FROM (end_time - start_time)) * 1000;
    
    -- Temporarily disable RLS for baseline (admin only)
    ALTER TABLE documents DISABLE ROW LEVEL SECURITY;
    
    start_time := clock_timestamp();
    PERFORM d.* FROM documents d LIMIT 100;
    end_time := clock_timestamp();
    baseline_time := EXTRACT(EPOCH FROM (end_time - start_time)) * 1000;
    
    -- Re-enable RLS
    ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
    
    RETURN QUERY SELECT 
        'Document Access'::TEXT,
        rls_time,
        baseline_time,
        ((rls_time - baseline_time) / baseline_time * 100);
END;
$$ LANGUAGE plpgsql;

-- Target: < 15% overhead from RLS policies
```

---

## 8. Performance Monitoring & Alerting

### 8.1. Real-Time Performance Metrics

#### Performance Dashboard Queries
```sql
-- Real-time performance monitoring view
CREATE OR REPLACE VIEW performance_dashboard AS
SELECT 
    'Database Connections' as metric,
    COUNT(*)::TEXT as current_value,
    '100' as threshold,
    CASE WHEN COUNT(*) > 100 THEN 'WARNING' ELSE 'OK' END as status
FROM pg_stat_activity
WHERE datname = current_database()

UNION ALL

SELECT 
    'Average Query Time',
    ROUND(AVG(mean_exec_time), 2)::TEXT || 'ms',
    '50ms',
    CASE WHEN AVG(mean_exec_time) > 50 THEN 'WARNING' ELSE 'OK' END
FROM pg_stat_statements
WHERE calls > 100

UNION ALL

SELECT 
    'Cache Hit Ratio',
    ROUND(
        SUM(heap_blks_hit) * 100.0 / 
        GREATEST(SUM(heap_blks_hit) + SUM(heap_blks_read), 1), 2
    )::TEXT || '%',
    '95%',
    CASE WHEN 
        SUM(heap_blks_hit) * 100.0 / 
        GREATEST(SUM(heap_blks_hit) + SUM(heap_blks_read), 1) < 95 
        THEN 'WARNING' ELSE 'OK' END
FROM pg_statio_user_tables

UNION ALL

SELECT 
    'Document Processing Queue',
    COUNT(*)::TEXT,
    '1000',
    CASE WHEN COUNT(*) > 1000 THEN 'WARNING' ELSE 'OK' END
FROM document_processing_queue
WHERE status = 'pending';
```

### 8.2. Automated Performance Alerts

#### Performance Alert Functions
```sql
-- Automated performance alerting
CREATE OR REPLACE FUNCTION check_performance_thresholds()
RETURNS TEXT AS $$
DECLARE
    alert_message TEXT := '';
    slow_query_count INTEGER;
    high_cpu_connections INTEGER;
    large_queue_depth INTEGER;
BEGIN
    -- Check for slow queries
    SELECT COUNT(*) INTO slow_query_count
    FROM pg_stat_activity
    WHERE state = 'active' 
    AND now() - query_start > INTERVAL '30 seconds';
    
    IF slow_query_count > 5 THEN
        alert_message := alert_message || 'ALERT: ' || slow_query_count || ' slow queries detected. ';
    END IF;
    
    -- Check connection pool
    SELECT COUNT(*) INTO high_cpu_connections
    FROM pg_stat_activity
    WHERE state = 'active';
    
    IF high_cpu_connections > 50 THEN
        alert_message := alert_message || 'ALERT: High connection count: ' || high_cpu_connections || '. ';
    END IF;
    
    -- Check processing queue
    SELECT COUNT(*) INTO large_queue_depth
    FROM document_processing_queue
    WHERE status = 'pending';
    
    IF large_queue_depth > 500 THEN
        alert_message := alert_message || 'ALERT: Large processing queue: ' || large_queue_depth || ' documents. ';
    END IF;
    
    IF alert_message = '' THEN
        RETURN 'All performance metrics within normal ranges.';
    ELSE
        -- Send alerts to administrators
        INSERT INTO notification_queue (
            user_id, notification_type, priority, title, body
        )
        SELECT 
            u.id, 'performance_alert', 'urgent',
            'Performance Alert',
            alert_message
        FROM auth.users u WHERE u.role = 'admin';
        
        RETURN 'Performance alerts generated: ' || alert_message;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Schedule regular performance checks
-- (Would typically be called by a cron job or scheduler)
SELECT check_performance_thresholds();
```

---

## 9. Benchmarking Procedures

### 9.1. Baseline Establishment

#### Pre-Migration Baseline
```sql
-- Establish v6 baseline before migration
CREATE TABLE performance_baselines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    version TEXT NOT NULL,
    metric_name TEXT NOT NULL,
    metric_value NUMERIC NOT NULL,
    metric_unit TEXT NOT NULL,
    test_conditions JSONB,
    measured_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Record v6 baselines
INSERT INTO performance_baselines (version, metric_name, metric_value, metric_unit, test_conditions)
VALUES 
('v6.0', 'user_auth_p95_ms', 15.0, 'milliseconds', '{"concurrent_users": 10}'),
('v6.0', 'document_upload_p95_ms', 800.0, 'milliseconds', '{"file_size_mb": 5}'),
('v6.0', 'lab_result_query_p95_ms', 20.0, 'milliseconds', '{"result_count": 100}'),
('v6.0', 'medication_list_p95_ms', 30.0, 'milliseconds', '{"medication_count": 50}'),
('v6.0', 'document_search_p95_ms', 120.0, 'milliseconds', '{"search_terms": 3}');
```

### 9.2. Regression Testing

#### Performance Regression Detection
```sql
-- Compare v7 performance against v6 baselines
CREATE OR REPLACE FUNCTION detect_performance_regressions()
RETURNS TABLE (
    metric_name TEXT,
    v6_baseline NUMERIC,
    v7_current NUMERIC,
    regression_percent NUMERIC,
    status TEXT
) AS $$
BEGIN
    RETURN QUERY
    WITH current_metrics AS (
        -- Run current performance tests
        SELECT 'user_auth_p95_ms'::TEXT as metric, 12.0::NUMERIC as current_value
        UNION ALL
        SELECT 'document_upload_p95_ms', 750.0
        UNION ALL
        SELECT 'lab_result_query_p95_ms', 18.0
        UNION ALL
        SELECT 'medication_list_p95_ms', 28.0
        UNION ALL
        SELECT 'document_search_p95_ms', 110.0
    ),
    baseline_comparison AS (
        SELECT 
            pb.metric_name,
            pb.metric_value as baseline,
            cm.current_value,
            ROUND(((cm.current_value - pb.metric_value) / pb.metric_value * 100), 2) as regression_pct
        FROM performance_baselines pb
        JOIN current_metrics cm ON cm.metric = pb.metric_name
        WHERE pb.version = 'v6.0'
    )
    SELECT 
        bc.metric_name,
        bc.baseline,
        bc.current_value,
        bc.regression_pct,
        CASE 
            WHEN bc.regression_pct <= 5 THEN '✅ IMPROVED'
            WHEN bc.regression_pct <= 15 THEN '⚠️ ACCEPTABLE'
            ELSE '❌ REGRESSION'
        END
    FROM baseline_comparison bc
    ORDER BY bc.regression_pct DESC;
END;
$$ LANGUAGE plpgsql;
```

---

## 10. Performance Optimization Recommendations

### 10.1. Query Optimization Targets

| Query Type | Current p95 | Target p95 | Optimization Strategy |
|------------|-------------|------------|----------------------|
| User consent checks | 25ms | 10ms | Add composite indexes on (patient_id, consent_type, granted) |
| FHIR transformations | 15ms | 8ms | Optimize JSON building, add result caching |
| Document search | 120ms | 80ms | Implement full-text search indexes |
| Analytics queries | 500ms | 200ms | Add materialized views, partition tables |

### 10.2. Scaling Recommendations

#### Horizontal Scaling Targets
- **Read Replicas:** Deploy by 1000 users
- **Connection Pooling:** PgBouncer with 100 max connections
- **Caching Layer:** Redis for session data and frequent queries
- **CDN:** CloudFront for document downloads

#### Vertical Scaling Thresholds
- **CPU:** Scale up when avg > 70% for 5 minutes
- **Memory:** Scale up when usage > 80%
- **IOPS:** Scale storage when IOPS utilization > 80%
- **Network:** Monitor bandwidth usage, scale when > 80%

---

**Performance Monitoring Status:** Active  
**Next Review:** Weekly during v7 rollout  
**Escalation:** Alert admin team if any metric exceeds thresholds