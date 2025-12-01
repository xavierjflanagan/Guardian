#!/bin/bash

# Create SNOMED CT vector index via direct PostgreSQL connection
# This bypasses Supabase API timeout limits

echo "SNOMED CT Vector Index Creation (Direct Connection)"
echo "===================================================="
echo ""

# Check if psql is installed
if ! command -v psql &> /dev/null; then
    echo "ERROR: psql is not installed"
    echo ""
    echo "Install with: brew install postgresql@15"
    exit 1
fi

# Load connection string from .env.local
if [ -f .env.local ]; then
    export $(grep -v '^#' .env.local | xargs)
fi

# Check for connection string
if [ -z "$SUPABASE_DB_URL" ]; then
    echo "ERROR: SUPABASE_DB_URL not found in .env.local"
    echo ""
    echo "Add this to your .env.local file:"
    echo "SUPABASE_DB_URL=postgresql://postgres:[PASSWORD]@db.napoydbbuvbpyciwjdci.supabase.co:5432/postgres"
    echo ""
    echo "Get the connection string from:"
    echo "Supabase Dashboard → Settings → Database → Connection string"
    exit 1
fi

echo "Connection string found"
echo "Creating IVFFlat vector index..."
echo ""
echo "Configuration:"
echo "  - Index type: IVFFlat"
echo "  - Distance metric: Cosine similarity"
echo "  - Lists (clusters): 1000"
echo "  - Vectors: ~706,544 SNOMED CT codes"
echo "  - Estimated time: 5-15 minutes"
echo ""
echo "Note: Building with CONCURRENTLY (database stays usable)"
echo ""

# Create index with psql
psql "$SUPABASE_DB_URL" <<SQL
-- Set statement timeout to 30 minutes
SET statement_timeout = '30min';

-- Create index
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_snomed_embedding_ivfflat
ON regional_medical_codes
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 1000)
WHERE code_system = 'snomed_ct' AND country_code = 'AUS';

-- Verify index was created
SELECT
    indexname,
    pg_size_pretty(pg_relation_size(indexname::regclass)) as size
FROM pg_indexes
WHERE tablename = 'regional_medical_codes'
  AND indexname = 'idx_snomed_embedding_ivfflat';
SQL

if [ $? -eq 0 ]; then
    echo ""
    echo "===================================================="
    echo "INDEX CREATED SUCCESSFULLY"
    echo "===================================================="
    echo ""
    echo "Next steps:"
    echo "1. Index is now active for vector searches"
    echo "2. Query performance should be 100x faster"
    echo "3. Test with vector similarity queries"
else
    echo ""
    echo "ERROR: Index creation failed"
    echo "Check the error message above"
    exit 1
fi
