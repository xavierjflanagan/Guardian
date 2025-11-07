#!/bin/bash

# Check SNOMED CT index creation progress
# Run this in a separate terminal while the index is being built

echo "Checking index creation progress..."
echo ""

# Load environment
if [ -f .env.local ]; then
    export $(grep -v '^#' .env.local | xargs)
fi

# Connection details (Session pooler)
DB_HOST="aws-0-ap-southeast-1.pooler.supabase.com"
DB_PORT="5432"
DB_USER="postgres.napoydbbuvbpyciwjdci"

echo "Enter your Supabase database password:"
read -s DB_PASSWORD
export PGPASSWORD="$DB_PASSWORD"

echo ""
echo "Checking active index creation..."
echo ""

# Check if index creation is running
psql "postgresql://$DB_USER@$DB_HOST:$DB_PORT/postgres" <<SQL
SELECT
    pid,
    state,
    NOW() - query_start as running_for,
    wait_event_type,
    wait_event
FROM pg_stat_activity
WHERE query LIKE '%CREATE INDEX%idx_snomed%'
  AND state = 'active';

-- Check if index exists yet
SELECT
    CASE
        WHEN COUNT(*) > 0 THEN 'Index exists!'
        ELSE 'Still building...'
    END as status
FROM pg_indexes
WHERE tablename = 'regional_medical_codes'
  AND indexname = 'idx_snomed_embedding_hnsw';
SQL

unset PGPASSWORD
