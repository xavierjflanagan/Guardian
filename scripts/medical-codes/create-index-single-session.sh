#!/bin/bash
# Create HNSW index using single psql session
# Executes all commands in one connection to avoid pooler issues

echo "=== Creating HNSW Index via Supabase Session Pooler ==="
echo ""
echo "This script uses a single psql session for all commands"
echo "Index creation on 102,891 vectors will take 3-5 minutes"
echo ""

PROJECT_REF="napoydbbuvbpyciwjdci"
PGHOST="aws-0-ap-southeast-1.pooler.supabase.com"
PGPORT="5432"
PGDATABASE="postgres"
PGUSER="postgres.${PROJECT_REF}"

echo "To get your database password:"
echo "  1. Go to https://supabase.com/dashboard/project/$PROJECT_REF/settings/database"
echo "  2. Copy the password EXACTLY as shown"
echo ""
echo "Enter your database password (it will be hidden):"
read -s DB_PASSWORD
echo ""

# Create temporary .pgpass file
PGPASS_FILE="$HOME/.pgpass.tmp"
echo "${PGHOST}:${PGPORT}:${PGDATABASE}:${PGUSER}:${DB_PASSWORD}" > "$PGPASS_FILE"
chmod 600 "$PGPASS_FILE"

export PGPASSFILE="$PGPASS_FILE"

echo "Connecting to database via Session Pooler..."
echo "Host: $PGHOST (IPv4 compatible)"
echo ""

# Create combined SQL file that does everything in one session
COMBINED_SQL="/tmp/create-index-combined.sql"
cat > "$COMBINED_SQL" << 'EOF'
-- Set statement timeout to 10 minutes
SET statement_timeout = '600000';

-- Display current timeout
SHOW statement_timeout;

-- Create HNSW index on OpenAI embeddings for LOINC codes
-- Using default HNSW parameters (m=16, ef_construction=64)
CREATE INDEX IF NOT EXISTS idx_universal_codes_loinc_embedding_hnsw
ON universal_medical_codes
USING hnsw (embedding vector_cosine_ops)
WHERE code_system = 'loinc' AND embedding IS NOT NULL;

-- Add comment explaining index purpose
COMMENT ON INDEX idx_universal_codes_loinc_embedding_hnsw IS
'HNSW index for fast vector similarity search on LOINC codes (Pass 1.5 two-tier search)';

-- Verify index was created
SELECT
    indexname,
    tablename,
    indexdef
FROM pg_indexes
WHERE indexname = 'idx_universal_codes_loinc_embedding_hnsw';

-- Show index size
SELECT
    pg_size_pretty(pg_relation_size('idx_universal_codes_loinc_embedding_hnsw')) as index_size;
EOF

echo "Executing index creation in single session..."
echo "This will take 3-5 minutes. Please wait..."
echo ""

# Execute all commands in a single psql session
psql -h "$PGHOST" -p "$PGPORT" -d "$PGDATABASE" -U "$PGUSER" \
     -f "$COMBINED_SQL"

EXIT_CODE=$?

# Clean up
rm -f "$PGPASS_FILE"
rm -f "$COMBINED_SQL"

if [ $EXIT_CODE -eq 0 ]; then
    echo ""
    echo "Index created successfully!"
    echo ""
    echo "Next steps:"
    echo "  1. Test vector search performance on LOINC codes"
    echo "  2. Optional: Clean up LOINC from regional_medical_codes"
else
    echo ""
    echo "Index creation failed with exit code: $EXIT_CODE"
    echo ""
    echo "Check error messages above for details."
fi
