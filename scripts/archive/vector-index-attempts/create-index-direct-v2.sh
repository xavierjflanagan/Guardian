#!/bin/bash

# Create SNOMED CT HNSW vector index via direct PostgreSQL connection
# This bypasses Supabase API timeout limits

echo "SNOMED CT HNSW Vector Index Creation (Direct Connection)"
echo "=========================================================="
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

# Connection details - using SESSION pooler (port 5432 - supports long operations!)
# Session pooler is designed for long-running operations like index creation
DB_HOST="aws-0-ap-southeast-1.pooler.supabase.com"
DB_PORT="5432"
DB_NAME="postgres"
DB_USER="postgres.napoydbbuvbpyciwjdci"

echo "Connecting to database..."
echo "Host: $DB_HOST"
echo "Port: $DB_PORT"
echo ""
echo "Creating HNSW vector index..."
echo "This will take 1-5 minutes..."
echo ""

# Set password in environment and connect
export PGPASSWORD="$DB_PASSWORD"

psql "postgresql://$DB_USER@$DB_HOST:$DB_PORT/$DB_NAME" <<SQL
-- Set 60 minute timeout
SET statement_timeout = '60min';

-- Enable parallel index build for faster creation (pgvector 0.6.0+)
SET max_parallel_maintenance_workers = 7;  -- Use 7 workers (saves ~80% time)

-- Use default memory (2GB was too much - caused "No space left on device")
-- Let PostgreSQL use what's available

-- Create HNSW index (faster build time than IVFFlat)
CREATE INDEX idx_snomed_embedding_hnsw
ON regional_medical_codes
USING hnsw (embedding vector_cosine_ops)
WHERE code_system = 'snomed_ct' AND country_code = 'AUS';

-- Verify index was created with proper verification
SELECT
    indexname,
    pg_index.indisvalid as is_valid,
    pg_size_pretty(pg_relation_size(indexname::regclass)) as size,
    CASE
        WHEN pg_index.indisvalid THEN 'Index created successfully and is VALID'
        ELSE 'Index exists but is INVALID - creation may have failed'
    END as status
FROM pg_indexes
JOIN pg_class ON pg_class.relname = pg_indexes.indexname
JOIN pg_index ON pg_index.indexrelid = pg_class.oid
WHERE tablename = 'regional_medical_codes'
  AND indexname = 'idx_snomed_embedding_hnsw';
SQL

# Capture output and check if index actually exists
OUTPUT=$(psql "postgresql://$DB_USER@$DB_HOST:$DB_PORT/$DB_NAME" -t -c "SELECT COUNT(*) FROM pg_indexes WHERE tablename = 'regional_medical_codes' AND indexname = 'idx_snomed_embedding_hnsw';")

# Clear password from environment
unset PGPASSWORD

# Trim whitespace from output
INDEX_COUNT=$(echo "$OUTPUT" | tr -d '[:space:]')

echo ""
echo "=========================================================="
if [ "$INDEX_COUNT" = "1" ]; then
    echo "INDEX CREATED SUCCESSFULLY"
    echo "=========================================================="
    echo ""
    echo "Next steps:"
    echo "1. Index is now active for vector searches"
    echo "2. Query performance should be 50-100x faster"
    echo "3. Test with vector similarity queries"
else
    echo "INDEX CREATION FAILED"
    echo "=========================================================="
    echo ""
    echo "Index was not created (count: $INDEX_COUNT)"
    echo "Check the error messages above"
    echo ""
    echo "Common errors:"
    echo "- 'No space left on device' = Supabase plan doesn't have enough memory"
    echo "- Connection timeout = Took too long, try smaller dataset"
    echo "- ERROR messages = Check output above for specific issue"
    exit 1
fi
