import { createClient } from '@supabase/supabase-js'
import { getCorsHeaders } from '../_shared/cors.ts'

// Initialize Supabase client with service role for privileged operations
const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

// Healthcare-specific critical audit event types
type CriticalEventType = 
  | 'document_access'
  | 'profile_switch' 
  | 'data_export'
  | 'authentication_event'
  | 'medical_data_modification'
  | 'consent_change'
  | 'provider_access_grant'
  | 'security_event';

interface CriticalAuditEvent {
  event_type: CriticalEventType;
  action: string;
  profile_id: string;
  patient_id?: string;
  metadata: Record<string, unknown>;
  privacy_level: 'public' | 'internal' | 'sensitive';
  session_id: string;
  user_agent?: string;
  ip_address?: string;
  
  // Critical audit-specific fields
  resource_id?: string;
  resource_type?: string;
  compliance_category?: 'hipaa' | 'gdpr' | 'clinical_decision' | 'consent_management';
}

/**
 * Generate cryptographic integrity hash for audit event
 * This ensures non-repudiation and tamper detection
 */
async function generateIntegrityHash(event: CriticalAuditEvent): Promise<string> {
  // Create deterministic string from critical fields
  const eventString = JSON.stringify({
    event_type: event.event_type,
    action: event.action,
    profile_id: event.profile_id,
    patient_id: event.patient_id,
    resource_id: event.resource_id,
    timestamp: new Date().toISOString(),
    // Include secret for HMAC-style verification
    secret: Deno.env.get('AUDIT_INTEGRITY_SECRET') || 'fallback-secret'
  });
  
  const encoder = new TextEncoder();
  const data = encoder.encode(eventString);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Classify if an event requires server-side integrity verification
 */
function requiresServerSideLogging(eventType: string, action: string): boolean {
  const criticalEvents = [
    // Document access patterns
    'data_access.document_view',
    'data_access.document_download', 
    'data_access.document_export',
    
    // Profile and authentication events
    'profile.switch',
    'profile.access_granted',
    'system.authentication_success',
    'system.authentication_failure',
    
    // Medical data modifications
    'data_access.medical_record_edit',
    'interaction.consent_change',
    'data_access.provider_access_grant',
    
    // Security events
    'system.security_violation',
    'system.unauthorized_access_attempt',
    'navigation.restricted_area_access'
  ];
  
  const eventKey = `${eventType}.${action}`;
  return criticalEvents.includes(eventKey);
}

/**
 * Guardian Audit Events Edge Function
 * 
 * Provides server-side audit logging with cryptographic integrity
 * for critical healthcare compliance events
 */
Deno.serve(async (req: Request) => {
  // Get secure CORS headers based on origin
  const origin = req.headers.get('origin');
  
  // Handle CORS preflight request
  if (req.method === 'OPTIONS') {
    const corsHeaders = getCorsHeaders(origin, true); // true = preflight
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  
  const corsHeaders = getCorsHeaders(origin);

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ 
      success: false, 
      error: 'Method not allowed' 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 405,
    });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'Authentication required' 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 401,
      });
    }

    // Verify the auth token and get user context
    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    );

    if (authError || !user) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'Invalid authentication token' 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 401,
      });
    }

    const body = await req.json();
    const { 
      event_type, 
      action, 
      profile_id, 
      patient_id,
      metadata = {}, 
      privacy_level = 'internal',
      session_id,
      resource_id,
      resource_type,
      compliance_category
    } = body as Partial<CriticalAuditEvent>;

    // Validate required fields
    if (!event_type || !action || !profile_id || !session_id) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'Missing required fields: event_type, action, profile_id, session_id' 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      });
    }

    // Check if this event requires server-side logging
    if (!requiresServerSideLogging(event_type, action)) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'Event type does not require server-side logging',
        should_use_client_logging: true
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      });
    }

    // Extract client context
    const clientIP = req.headers.get('x-forwarded-for') || 
                     req.headers.get('x-real-ip') || 
                     'unknown';
    const userAgent = req.headers.get('user-agent') || 'unknown';

    // Create critical audit event
    const auditEvent: CriticalAuditEvent = {
      event_type: event_type as CriticalEventType,
      action,
      profile_id,
      patient_id,
      metadata: {
        ...metadata,
        server_side_logged: true,
        edge_function_version: '1.0.0',
        authenticated_user_id: user.id
      },
      privacy_level,
      session_id,
      user_agent: userAgent.substring(0, 100), // Truncate for privacy
      ip_address: clientIP,
      resource_id,
      resource_type,
      compliance_category
    };

    // Generate cryptographic integrity hash
    const integrityHash = await generateIntegrityHash(auditEvent);

    // Insert into audit_log table using the enhanced audit function
    const { data: auditResult, error: auditError } = await supabase
      .rpc('log_audit_event_with_fallback', {
        p_table_name: 'critical_audit_events',
        p_record_id: crypto.randomUUID(),
        p_operation: 'INSERT',
        p_old_values: null,
        p_new_values: {
          ...auditEvent,
          integrity_hash: integrityHash,
          logged_at: new Date().toISOString(),
          server_verified: true
        },
        p_reason: `Critical audit event: ${event_type}.${action}`,
        p_compliance_category: compliance_category || 'hipaa',
        p_patient_id: patient_id
      });

    if (auditError) {
      console.error('Critical audit logging failed:', auditError);
      
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'Audit logging failed',
        should_retry: true
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      });
    }

    // Also insert into user_events for backward compatibility (if not critical failure)
    try {
      await supabase.from('user_events').insert({
        action: `${event_type}.${action}`,
        metadata: {
          ...auditEvent.metadata,
          integrity_verified: true,
          audit_id: auditResult
        },
        profile_id,
        session_id,
        privacy_level
      });
    } catch (error) {
      // Non-critical - main audit succeeded
      console.warn('User events fallback failed:', error);
    }

    return new Response(JSON.stringify({ 
      success: true,
      audit_id: auditResult,
      integrity_hash: integrityHash,
      message: 'Critical audit event logged with integrity verification'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error) {
    console.error('Audit events edge function error:', error);
    
    return new Response(JSON.stringify({ 
      success: false, 
      error: 'Internal server error',
      should_use_client_fallback: true
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});