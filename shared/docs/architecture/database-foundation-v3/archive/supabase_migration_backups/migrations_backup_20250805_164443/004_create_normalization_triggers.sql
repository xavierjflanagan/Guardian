-- Database Triggers for Real-Time Normalization
-- This migration sets up automatic triggers to process document normalization
-- when documents are completed with medical data

-- First, we need to enable the HTTP extension for making requests to Edge Functions
CREATE EXTENSION IF NOT EXISTS http;

-- Function to trigger document normalization via Edge Function
CREATE OR REPLACE FUNCTION trigger_document_normalization()
RETURNS TRIGGER AS $$
DECLARE
    supabase_url text;
    service_role_key text;
    edge_function_url text;
    http_response http_response;
    request_body jsonb;
BEGIN
    -- Only trigger normalization when status changes to 'completed'
    -- and medical_data is not null and normalization hasn't been completed
    IF NEW.status = 'completed' 
       AND NEW.medical_data IS NOT NULL 
       AND (NEW.normalization_status IS NULL OR NEW.normalization_status = 'pending')
       AND (OLD.status IS NULL OR OLD.status != 'completed') THEN
        
        -- Get Supabase configuration from environment
        -- Note: In production, these would be set via Supabase vault or environment
        supabase_url := current_setting('app.supabase_url', true);
        service_role_key := current_setting('app.service_role_key', true);
        
        -- Construct Edge Function URL
        IF supabase_url IS NOT NULL THEN
            edge_function_url := supabase_url || '/functions/v1/document-normalizer';
        ELSE
            -- Fallback for local development
            edge_function_url := 'http://localhost:54321/functions/v1/document-normalizer';
        END IF;
        
        -- Prepare request body
        request_body := json_build_object(
            'document_id', NEW.id,
            'user_id', NEW.user_id,
            'medical_data', NEW.medical_data,
            'trigger_type', CASE 
                WHEN TG_OP = 'INSERT' THEN 'insert'
                WHEN TG_OP = 'UPDATE' THEN 'update'
                ELSE 'manual'
            END
        );
        
        -- Make async HTTP request to Edge Function
        BEGIN
            SELECT http_post(
                url := edge_function_url,
                headers := json_build_object(
                    'Content-Type', 'application/json',
                    'Authorization', 'Bearer ' || COALESCE(service_role_key, '')
                )::jsonb,
                body := request_body::text
            ) INTO http_response;
            
            -- Log successful trigger
            RAISE LOG 'Normalization triggered for document %: HTTP status %', NEW.id, http_response.status;
            
            -- If the request failed, update the document with error status
            IF http_response.status NOT BETWEEN 200 AND 299 THEN
                UPDATE documents 
                SET normalization_status = 'failed',
                    normalization_errors = json_build_array(
                        'Trigger failed: HTTP ' || http_response.status || ' - ' || http_response.content
                    )
                WHERE id = NEW.id;
                
                RAISE WARNING 'Normalization trigger failed for document %: HTTP % - %', 
                    NEW.id, http_response.status, http_response.content;
            END IF;
            
        EXCEPTION WHEN OTHERS THEN
            -- Handle any errors in HTTP request
            UPDATE documents 
            SET normalization_status = 'failed',
                normalization_errors = json_build_array(
                    'Trigger error: ' || SQLERRM
                )
            WHERE id = NEW.id;
            
            RAISE WARNING 'Normalization trigger error for document %: %', NEW.id, SQLERRM;
        END;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create the trigger
DROP TRIGGER IF EXISTS documents_normalization_trigger ON documents;
CREATE TRIGGER documents_normalization_trigger
    AFTER INSERT OR UPDATE ON documents
    FOR EACH ROW
    EXECUTE FUNCTION trigger_document_normalization();

-- Manual normalization function for batch processing or re-processing
CREATE OR REPLACE FUNCTION manually_trigger_normalization(document_id_param uuid)
RETURNS jsonb AS $$
DECLARE
    doc_record documents%ROWTYPE;
    supabase_url text;
    service_role_key text;
    edge_function_url text;
    http_response http_response;
    request_body jsonb;
    result jsonb;
BEGIN
    -- Get the document
    SELECT * INTO doc_record FROM documents WHERE id = document_id_param;
    
    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'error', 'Document not found');
    END IF;
    
    IF doc_record.medical_data IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'Document has no medical data');
    END IF;
    
    -- Set normalization status to processing
    UPDATE documents 
    SET normalization_status = 'processing',
        normalization_errors = NULL
    WHERE id = document_id_param;
    
    -- Get Supabase configuration
    supabase_url := current_setting('app.supabase_url', true);
    service_role_key := current_setting('app.service_role_key', true);
    
    -- Construct Edge Function URL
    IF supabase_url IS NOT NULL THEN
        edge_function_url := supabase_url || '/functions/v1/document-normalizer';
    ELSE
        edge_function_url := 'http://localhost:54321/functions/v1/document-normalizer';
    END IF;
    
    -- Prepare request body
    request_body := json_build_object(
        'document_id', doc_record.id,
        'user_id', doc_record.user_id,
        'medical_data', doc_record.medical_data,
        'trigger_type', 'manual'
    );
    
    -- Make HTTP request
    BEGIN
        SELECT http_post(
            url := edge_function_url,
            headers := json_build_object(
                'Content-Type', 'application/json',
                'Authorization', 'Bearer ' || COALESCE(service_role_key, '')
            )::jsonb,
            body := request_body::text
        ) INTO http_response;
        
        IF http_response.status BETWEEN 200 AND 299 THEN
            result := json_build_object(
                'success', true,
                'message', 'Normalization triggered successfully',
                'document_id', document_id_param,
                'http_status', http_response.status
            );
        ELSE
            -- Update document with error status
            UPDATE documents 
            SET normalization_status = 'failed',
                normalization_errors = json_build_array(
                    'Manual trigger failed: HTTP ' || http_response.status
                )
            WHERE id = document_id_param;
            
            result := json_build_object(
                'success', false,
                'error', 'HTTP request failed: ' || http_response.status,
                'response', http_response.content
            );
        END IF;
        
    EXCEPTION WHEN OTHERS THEN
        -- Update document with error status
        UPDATE documents 
        SET normalization_status = 'failed',
            normalization_errors = json_build_array(
                'Manual trigger error: ' || SQLERRM
            )
        WHERE id = document_id_param;
        
        result := json_build_object(
            'success', false,
            'error', 'Request failed: ' || SQLERRM
        );
    END;
    
    RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Batch normalization function for processing multiple documents
CREATE OR REPLACE FUNCTION batch_normalize_documents(limit_count integer DEFAULT 10)
RETURNS jsonb AS $$
DECLARE
    doc_record RECORD;
    processed_count integer := 0;
    success_count integer := 0;
    error_count integer := 0;
    results jsonb[] := '{}';
    normalize_result jsonb;
BEGIN
    -- Process documents that are completed with medical data but not normalized
    FOR doc_record IN 
        SELECT id, original_name 
        FROM documents 
        WHERE status = 'completed'
          AND medical_data IS NOT NULL
          AND (normalization_status IS NULL OR normalization_status = 'pending' OR normalization_status = 'failed')
        ORDER BY created_at DESC
        LIMIT limit_count
    LOOP
        -- Trigger normalization for each document
        SELECT manually_trigger_normalization(doc_record.id) INTO normalize_result;
        
        -- Track results
        processed_count := processed_count + 1;
        
        IF (normalize_result->>'success')::boolean THEN
            success_count := success_count + 1;
        ELSE
            error_count := error_count + 1;
        END IF;
        
        -- Add to results array
        results := results || jsonb_build_object(
            'document_id', doc_record.id,
            'file_name', doc_record.original_name,
            'result', normalize_result
        );
    END LOOP;
    
    RETURN json_build_object(
        'processed', processed_count,
        'success', success_count,
        'errors', error_count,
        'results', results
    );
END;
$$ LANGUAGE plpgsql;

-- Function to check normalization status and statistics
CREATE OR REPLACE FUNCTION get_normalization_stats()
RETURNS jsonb AS $$
DECLARE
    total_docs integer;
    completed_docs integer;
    with_medical_data integer;
    normalized_completed integer;
    normalized_failed integer;
    normalized_pending integer;
    normalized_processing integer;
BEGIN
    -- Get document counts
    SELECT COUNT(*) INTO total_docs FROM documents;
    SELECT COUNT(*) INTO completed_docs FROM documents WHERE status = 'completed';
    SELECT COUNT(*) INTO with_medical_data FROM documents WHERE status = 'completed' AND medical_data IS NOT NULL;
    SELECT COUNT(*) INTO normalized_completed FROM documents WHERE normalization_status = 'completed';
    SELECT COUNT(*) INTO normalized_failed FROM documents WHERE normalization_status = 'failed';
    SELECT COUNT(*) INTO normalized_pending FROM documents WHERE normalization_status = 'pending' OR normalization_status IS NULL;
    SELECT COUNT(*) INTO normalized_processing FROM documents WHERE normalization_status = 'processing';
    
    RETURN json_build_object(
        'total_documents', total_docs,
        'completed_documents', completed_docs,
        'documents_with_medical_data', with_medical_data,
        'normalization_status', json_build_object(
            'completed', normalized_completed,
            'failed', normalized_failed,
            'pending', normalized_pending,
            'processing', normalized_processing
        ),
        'normalization_rate', 
            CASE 
                WHEN with_medical_data > 0 THEN ROUND((normalized_completed::decimal / with_medical_data) * 100, 2)
                ELSE 0 
            END
    );
END;
$$ LANGUAGE plpgsql;

-- Create indexes for normalization monitoring
CREATE INDEX IF NOT EXISTS documents_normalization_monitoring_idx 
    ON documents(status, normalization_status, medical_data) 
    WHERE status = 'completed' AND medical_data IS NOT NULL;

-- Comments for documentation
COMMENT ON FUNCTION trigger_document_normalization() IS 'Automatically triggers normalization when documents are completed with medical data';
COMMENT ON FUNCTION manually_trigger_normalization(uuid) IS 'Manually trigger normalization for a specific document';
COMMENT ON FUNCTION batch_normalize_documents(integer) IS 'Process multiple documents for normalization in batch';
COMMENT ON FUNCTION get_normalization_stats() IS 'Get statistics about document normalization status';

-- Grant necessary permissions
-- Note: In production, ensure proper RLS policies are in place
GRANT EXECUTE ON FUNCTION manually_trigger_normalization(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION get_normalization_stats() TO authenticated;