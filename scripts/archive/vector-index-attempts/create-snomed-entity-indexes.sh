#!/bin/bash

# Create Entity-Specific HNSW Indexes for SNOMED CT
# Must be run with Session pooler connection
#
# This creates 5 partial indexes (one per entity type) instead of
# one monolithic index. This avoids memory exhaustion and timeouts.
#
# Expected total time: 30-75 minutes
# Expected performance improvement: 50-100x faster queries

echo "SNOMED CT Entity-Specific Index Creation"
echo "=========================================="
echo ""

# Check if psql is installed
if ! command -v psql &> /dev/null; then
    echo "ERROR: psql is not installed"
    echo ""
    echo "Install with: brew install postgresql@15"
    exit 1
fi

# Prompt for password
echo "Enter your Supabase database password:"
read -s DB_PASSWORD
echo ""

# Connection details (Session pooler - port 5432)
DB_HOST="aws-0-ap-southeast-1.pooler.supabase.com"
DB_PORT="5432"
DB_NAME="postgres"
DB_USER="postgres.napoydbbuvbpyciwjdci"

export PGPASSWORD="$DB_PASSWORD"

echo "Testing connection..."
psql "postgresql://$DB_USER@$DB_HOST:$DB_PORT/$DB_NAME" -c "SELECT version();" > /dev/null 2>&1

if [ $? -ne 0 ]; then
    echo "ERROR: Failed to connect to database"
    echo "Check your password and network connection"
    unset PGPASSWORD
    exit 1
fi

echo "[OK] Connected to database"
echo ""

# Entity types in order (smallest to largest for testing)
ENTITIES=("medication" "procedure" "physical_finding" "condition" "observation")
COUNTS=("44846" "93561" "113711" "130948" "323478")

TOTAL_START=$(date +%s)

for i in "${!ENTITIES[@]}"; do
    ENTITY="${ENTITIES[$i]}"
    COUNT="${COUNTS[$i]}"

    echo ""
    echo "=========================================="
    echo "Building Index $((i+1))/5: $ENTITY"
    echo "Codes: $COUNT ($(echo "scale=1; $COUNT / 706544 * 100" | bc)% of SNOMED)"
    echo "=========================================="
    echo ""

    START_TIME=$(date +%s)

    psql "postgresql://$DB_USER@$DB_HOST:$DB_PORT/$DB_NAME" <<SQL
-- Set 2 hour timeout (generous for largest index)
SET statement_timeout = '2h';

-- Enable parallel index build (pgvector 0.8.0)
SET max_parallel_maintenance_workers = 7;

-- Create entity-specific HNSW index with m=8 (smaller size, still fast)
CREATE INDEX idx_snomed_${ENTITY}_hnsw
ON regional_medical_codes
USING hnsw (embedding vector_cosine_ops)
WITH (m = 8)
WHERE code_system = 'snomed_ct'
  AND country_code = 'AUS'
  AND entity_type = '${ENTITY}';

-- Verify index was created
SELECT
    indexname,
    pg_index.indisvalid as is_valid,
    pg_size_pretty(pg_relation_size(indexname::regclass)) as size,
    CASE
        WHEN pg_index.indisvalid THEN 'VALID - Index created successfully'
        ELSE 'INVALID - Build failed'
    END as status
FROM pg_indexes
JOIN pg_class ON pg_class.relname = pg_indexes.indexname
JOIN pg_index ON pg_index.indexrelid = pg_class.oid
WHERE tablename = 'regional_medical_codes'
  AND indexname = 'idx_snomed_${ENTITY}_hnsw';
SQL

    if [ $? -ne 0 ]; then
        echo ""
        echo "[ERROR] Index creation failed for $ENTITY"
        echo "Check error messages above"
        unset PGPASSWORD
        exit 1
    fi

    END_TIME=$(date +%s)
    ELAPSED=$((END_TIME - START_TIME))

    echo ""
    echo "[OK] Completed in ${ELAPSED}s ($((ELAPSED / 60))m $((ELAPSED % 60))s)"
    echo ""
done

TOTAL_END=$(date +%s)
TOTAL_ELAPSED=$((TOTAL_END - TOTAL_START))

unset PGPASSWORD

echo ""
echo "=========================================="
echo "ALL INDEXES CREATED SUCCESSFULLY"
echo "=========================================="
echo ""
echo "Total time: ${TOTAL_ELAPSED}s ($((TOTAL_ELAPSED / 60))m $((TOTAL_ELAPSED % 60))s)"
echo ""
echo "Summary of created indexes:"
echo ""

export PGPASSWORD="$DB_PASSWORD"

psql "postgresql://$DB_USER@$DB_HOST:$DB_PORT/$DB_NAME" <<SQL
SELECT
    indexname,
    pg_index.indisvalid as is_valid,
    pg_size_pretty(pg_relation_size(indexname::regclass)) as size
FROM pg_indexes
JOIN pg_class ON pg_class.relname = pg_indexes.indexname
JOIN pg_index ON pg_index.indexrelid = pg_class.oid
WHERE tablename = 'regional_medical_codes'
  AND indexname LIKE 'idx_snomed_%_hnsw'
ORDER BY pg_relation_size(indexname::regclass) DESC;
SQL

unset PGPASSWORD

echo ""
echo "=========================================="
echo "Next Steps:"
echo "=========================================="
echo ""
echo "1. Test query performance with:"
echo "   ./scripts/test-snomed-index-performance.sh"
echo ""
echo "2. Verify indexes are being used:"
echo "   Run EXPLAIN ANALYZE on your vector searches"
echo ""
echo "3. Monitor query times:"
echo "   Target: 10-50ms (vs 2800ms before)"
echo ""
echo "4. See documentation:"
echo "   shared/docs/.../VECTOR-INDEX-STRATEGY.md"
echo ""
