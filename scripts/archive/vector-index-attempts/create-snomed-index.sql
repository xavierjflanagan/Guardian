-- Set 30 minute timeout for index creation
SET statement_timeout = '30min';

-- Create IVFFlat vector index for SNOMED CT
CREATE INDEX CONCURRENTLY idx_snomed_embedding_ivfflat
ON regional_medical_codes
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 1000)
WHERE code_system = 'snomed_ct' AND country_code = 'AUS';

-- Verify index was created (ACTUAL verification, not just a static message)
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
  AND indexname = 'idx_snomed_embedding_ivfflat';
