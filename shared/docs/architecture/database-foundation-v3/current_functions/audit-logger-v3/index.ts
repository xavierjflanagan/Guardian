// =============================================================================
// AUDIT-LOGGER-V3 - V3 Correlation Logging and Audit Events Edge Function
// =============================================================================
// PURPOSE: Centralized audit logging with job correlation for V3 architecture
// INTEGRATION: Uses log_audit_event RPC with proper patient_id correlation
// SECURITY: Healthcare compliance with PII-safe logging and correlation tracking
// =============================================================================

import { createServiceRoleClient, getEdgeFunctionEnv } from '../_shared/supabase-client.ts';
import { handlePreflight, addCORSHeaders } from '../_shared/cors.ts';
import { 
  createErrorResponse, 
  createSuccessResponse, 
  handleError,
  validateMethod,
  getCorrelationId,
  ErrorCode 
} from '../_shared/error-handling.ts';
import { AuditEventData, APIResponse } from '../_shared/types.ts';

/**
 * Audit Event Request Interface
 */
interface AuditEventRequest {
  table_name: string;
  record_id: string;
  operation: 'INSERT' | 'UPDATE' | 'DELETE' | 'SELECT' | 'PROCESS';
  old_values?: Record<string, any>;
  new_values?: Record<string, any>;
  description?: string;
  job_id?: string;
  patient_id?: string;
  metadata?: Record<string, any>;
}

/**
 * Batch Audit Events Request Interface
 */
interface BatchAuditRequest {
  events: AuditEventRequest[];
  correlation_id?: string;
}

/**
 * Main Edge Function Handler
 */
Deno.serve(async (request: Request) => {
  const correlationId = getCorrelationId(request);
  
  try {
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return handlePreflight(request);
    }
    
    // Validate method
    const methodError = validateMethod(request, ['POST']);
    if (methodError) {
      return addCORSHeaders(
        createErrorResponse(methodError, 405, correlationId),
        request.headers.get('origin')
      );
    }
    
    // Initialize environment and database
    const env = getEdgeFunctionEnv();
    const supabase = createServiceRoleClient(env);
    
    // Parse request body
    let requestData: AuditEventRequest | BatchAuditRequest;
    try {
      requestData = await request.json();
    } catch (error) {
      return addCORSHeaders(
        createErrorResponse({
          code: ErrorCode.INVALID_REQUEST,
          message: 'Invalid JSON in request body',
          correlation_id: correlationId,
        }, 400, correlationId),
        request.headers.get('origin')
      );
    }
    
    // Determine if this is a batch request or single event
    const isBatchRequest = 'events' in requestData;
    const events = isBatchRequest 
      ? (requestData as BatchAuditRequest).events 
      : [requestData as AuditEventRequest];
      
    // Use correlation ID from batch request if provided
    const finalCorrelationId = isBatchRequest 
      ? (requestData as BatchAuditRequest).correlation_id || correlationId
      : correlationId;
    
    // Validate all events
    for (let i = 0; i < events.length; i++) {
      const validationError = validateAuditEvent(events[i], i);
      if (validationError) {
        return addCORSHeaders(
          createErrorResponse({
            ...validationError,
            correlation_id: finalCorrelationId,
          }, 400, finalCorrelationId),
          request.headers.get('origin')
        );
      }
    }
    
    // Process audit events
    const results = await processAuditEvents(
      supabase,
      events,
      finalCorrelationId
    );
    
    const responseData = isBatchRequest 
      ? { events_logged: results.length, correlation_id: finalCorrelationId }
      : { event_logged: true, correlation_id: finalCorrelationId };
    
    return addCORSHeaders(
      createSuccessResponse(responseData, finalCorrelationId, 201),
      request.headers.get('origin')
    );
    
  } catch (error) {
    const processedError = handleError(error, 'audit-logger-v3', correlationId);
    return addCORSHeaders(
      createErrorResponse(processedError, 500, correlationId),
      request.headers.get('origin')
    );
  }
});

/**
 * Validate audit event data
 */
function validateAuditEvent(event: AuditEventRequest, index?: number): any {
  const prefix = index !== undefined ? `Event ${index}: ` : '';
  
  // Required fields
  const required = ['table_name', 'record_id', 'operation'];
  for (const field of required) {
    if (!event[field]) {
      return {
        code: ErrorCode.MISSING_REQUIRED_FIELD,
        message: `${prefix}Missing required field: ${field}`,
      };
    }
  }
  
  // Validate operation type
  const validOperations = ['INSERT', 'UPDATE', 'DELETE', 'SELECT', 'PROCESS'];
  if (!validOperations.includes(event.operation)) {
    return {
      code: ErrorCode.INVALID_REQUEST,
      message: `${prefix}Invalid operation: ${event.operation}. Must be one of: ${validOperations.join(', ')}`,
    };
  }
  
  // Validate record_id format (should be UUID for most cases)
  if (event.record_id && !isValidUUID(event.record_id)) {
    // Allow non-UUID record_ids for some system events, but log warning
    console.warn(`Non-UUID record_id detected: ${event.record_id} for table: ${event.table_name}`);
  }
  
  // Validate patient_id format if provided
  if (event.patient_id && !isValidUUID(event.patient_id)) {
    return {
      code: ErrorCode.INVALID_REQUEST,
      message: `${prefix}Invalid patient_id format: must be a valid UUID`,
    };
  }
  
  // Validate job_id format if provided
  if (event.job_id && !isValidUUID(event.job_id)) {
    return {
      code: ErrorCode.INVALID_REQUEST,
      message: `${prefix}Invalid job_id format: must be a valid UUID`,
    };
  }
  
  return null;
}

/**
 * Process audit events using V3 audit system
 */
async function processAuditEvents(
  supabase: any,
  events: AuditEventRequest[],
  correlationId: string
): Promise<any[]> {
  const results = [];
  
  for (const event of events) {
    try {
      // Add correlation metadata (for logging purposes)
      const metadata = {
        ...(event.metadata || {}),
        correlation_id: correlationId,
        job_id: event.job_id,
        patient_id: event.patient_id,
        edge_function: 'audit-logger-v3',
        timestamp: new Date().toISOString(),
      };
      
      // Call V3 audit logging RPC with correct parameter names
      const { data: auditResult, error: auditError } = await supabase
        .rpc('log_audit_event', {
          p_table_name: event.table_name,
          p_record_id: event.record_id,
          p_operation: event.operation,
          p_old_values: event.old_values || null,
          p_new_values: event.new_values || null,
          p_reason: event.description || `${event.operation} operation on ${event.table_name}`,
          p_compliance_category: 'system_operation',
          p_patient_id: event.patient_id || null,
        });
        
      if (auditError) {
        console.error(`[${correlationId}] Audit logging failed for ${event.table_name}:${event.record_id}:`, auditError);
        throw new Error(`Audit logging failed: ${auditError.message}`);
      }
      
      results.push({
        table_name: event.table_name,
        record_id: event.record_id,
        operation: event.operation,
        audit_logged: true,
        correlation_id: correlationId,
      });
      
      // Log success
      console.log(`[${correlationId}] Audit logged: ${event.operation} on ${event.table_name}:${event.record_id}${event.job_id ? ` (job:${event.job_id})` : ''}${event.patient_id ? ` (patient:${event.patient_id})` : ''}`);
      
    } catch (error) {
      console.error(`[${correlationId}] Failed to log audit event:`, error);
      
      // For critical audit failures, we should fail the request
      // Healthcare applications require audit trail integrity
      throw error;
    }
  }
  
  return results;
}

/**
 * Basic UUID format validation
 */
function isValidUUID(uuid: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[4][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
}

/**
 * Helper function to create job-correlated audit event
 */
export interface JobAuditHelper {
  logJobEvent(params: {
    job_id: string;
    operation: string;
    table_name: string;
    record_id: string;
    patient_id?: string;
    description?: string;
    metadata?: Record<string, any>;
  }): Promise<void>;
}

/**
 * Export helper for other Edge Functions to use
 * This allows other functions to easily log job-correlated events
 */
export function createJobAuditHelper(supabase: any, correlationId: string): JobAuditHelper {
  return {
    async logJobEvent(params) {
      const auditEvent: AuditEventRequest = {
        table_name: params.table_name,
        record_id: params.record_id,
        operation: params.operation as any,
        job_id: params.job_id,
        patient_id: params.patient_id,
        description: params.description || `Job ${params.job_id} ${params.operation} on ${params.table_name}`,
        metadata: {
          ...(params.metadata || {}),
          job_correlated: true,
          correlation_id: correlationId,
        },
      };
      
      await processAuditEvents(supabase, [auditEvent], correlationId);
    },
  };
}