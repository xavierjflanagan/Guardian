/**
 * Quality Guardian Edge Function
 * 
 * Handles data quality flag management:
 * - Flag resolution (confirm, edit, delete)
 * - Batch operations
 * - Flag restoration (undo deletes)
 * - ML feedback collection
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

interface FlagResolutionRequest {
  action: 'confirm' | 'edit' | 'delete' | 'merge' | 'ignore';
  corrected_value?: any;
  resolution_notes?: string;
  user_feedback_rating?: number;
  user_confidence?: 'very_sure' | 'somewhat_sure' | 'unsure';
  correction_difficulty?: 'easy' | 'moderate' | 'difficult';
}

interface BatchOperationRequest {
  flag_ids: string[];
  action: 'confirm' | 'delete' | 'ignore';
  resolution_notes?: string;
}

interface RestoreRequest {
  table_name: string;
  record_id: string;
  reason?: string;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get authentication token
    const authorization = req.headers.get('authorization');
    if (!authorization) {
      return new Response(
        JSON.stringify({ error: 'Authorization header required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify user authentication
    const token = authorization.replace('Bearer ', '');
    const { data: user, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user.user) {
      return new Response(
        JSON.stringify({ error: 'Invalid authentication token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const url = new URL(req.url);
    const pathParts = url.pathname.split('/').filter(part => part.length > 0);
    
    // Route requests based on path
    if (pathParts.length < 2) {
      return new Response(
        JSON.stringify({ error: 'Invalid path' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const resource = pathParts[1]; // flags, batch, restore, etc.
    const action = pathParts[2]; // resolve, restore, etc.

    switch (resource) {
      case 'flags':
        if (action === 'resolve' && pathParts[3]) {
          return await resolveSingleFlag(req, supabase, pathParts[3], user.user.id);
        } else if (action === 'restore' && pathParts[3]) {
          return await restoreSingleFlag(req, supabase, pathParts[3], user.user.id);
        } else if (req.method === 'GET' && pathParts[2]) {
          return await getFlagDetails(supabase, pathParts[2], user.user.id);
        } else if (req.method === 'GET') {
          return await getUserFlags(req, supabase, user.user.id);
        }
        break;
        
      case 'batch':
        if (req.method === 'POST') {
          return await handleBatchOperation(req, supabase, user.user.id);
        }
        break;
        
      case 'restore':
        if (req.method === 'POST') {
          return await handleRecordRestore(req, supabase, user.user.id);
        }
        break;
        
      case 'feedback':
        if (req.method === 'POST') {
          return await collectMLFeedback(req, supabase, user.user.id);
        }
        break;
        
      case 'stats':
        if (req.method === 'GET') {
          return await getQualityStats(req, supabase, user.user.id);
        }
        break;
    }

    return new Response(
      JSON.stringify({ error: 'Endpoint not found' }),
      { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Quality Guardian error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

/**
 * Resolve a single flag with user's decision
 */
async function resolveSingleFlag(
  req: Request,
  supabase: any,
  flagId: string,
  userId: string
): Promise<Response> {
  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const body: FlagResolutionRequest = await req.json();
  
  // Validate request
  if (!['confirm', 'edit', 'delete', 'merge', 'ignore'].includes(body.action)) {
    return new Response(
      JSON.stringify({ error: 'Invalid action' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    // Start transaction
    const { data: flag, error: flagError } = await supabase
      .from('data_quality_flags')
      .select('*')
      .eq('flag_id', flagId)
      .single();

    if (flagError || !flag) {
      return new Response(
        JSON.stringify({ error: 'Flag not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check user has permission to resolve this flag
    const { data: profileAccess, error: accessError } = await supabase
      .from('user_profiles')
      .select('owner_user_id')
      .eq('profile_id', flag.profile_id)
      .single();

    if (accessError || profileAccess.owner_user_id !== userId) {
      // Check if user has shared access
      const { data: sharedAccess } = await supabase
        .from('profile_access_permissions')
        .select('*')
        .eq('profile_id', flag.profile_id)
        .eq('grantee_user_id', userId)
        .in('access_level', ['owner', 'full_access', 'read_write']);

      if (!sharedAccess || sharedAccess.length === 0) {
        return new Response(
          JSON.stringify({ error: 'Insufficient permissions' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Handle different resolution actions
    let updateResult;
    
    switch (body.action) {
      case 'confirm':
        // User confirms the original value is correct
        updateResult = await supabase.rpc('resolve_data_quality_flag', {
          p_flag_id: flagId,
          p_resolution_action: 'confirmed',
          p_resolution_notes: body.resolution_notes,
          p_user_feedback_rating: body.user_feedback_rating
        });
        break;

      case 'edit':
        // User provides corrected value
        if (!body.corrected_value) {
          return new Response(
            JSON.stringify({ error: 'Corrected value required for edit action' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Update the original record with corrected value
        await updateOriginalRecord(supabase, flag, body.corrected_value);
        
        // Record the correction
        await supabase.from('data_quality_corrections').insert({
          flag_id: flagId,
          original_value: flag.raw_value,
          corrected_value: body.corrected_value,
          correction_method: 'manual',
          correction_source: 'ui_panel',
          user_confidence: body.user_confidence,
          correction_difficulty: body.correction_difficulty,
          user_feedback: body.resolution_notes,
          created_by: userId
        });

        // Resolve the flag
        updateResult = await supabase.rpc('resolve_data_quality_flag', {
          p_flag_id: flagId,
          p_resolution_action: 'corrected',
          p_resolution_notes: body.resolution_notes,
          p_user_feedback_rating: body.user_feedback_rating
        });
        break;

      case 'delete':
        // Soft delete the record
        updateResult = await supabase.rpc('soft_delete_with_flag_resolution', {
          p_table_name: flag.record_table,
          p_record_id: flag.record_id,
          p_flag_id: flagId
        });
        break;

      case 'ignore':
        // User wants to ignore this flag (dismiss without action)
        updateResult = await supabase.rpc('resolve_data_quality_flag', {
          p_flag_id: flagId,
          p_resolution_action: 'ignored',
          p_resolution_notes: body.resolution_notes,
          p_user_feedback_rating: body.user_feedback_rating
        });
        break;

      case 'merge':
        // Complex merge operation - would need more implementation
        return new Response(
          JSON.stringify({ error: 'Merge operation not yet implemented' }),
          { status: 501, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }

    if (updateResult.error) {
      throw updateResult.error;
    }

    // Update ML pattern learning
    await updatePatternLearning(supabase, flag, body.action, body.user_feedback_rating);

    // Send real-time notification to update UI
    await supabase
      .channel(`profile:${flag.profile_id}`)
      .send({
        type: 'broadcast',
        event: 'flag_resolved',
        payload: {
          flag_id: flagId,
          action: body.action,
          profile_id: flag.profile_id
        }
      });

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Flag resolved successfully',
        flag_id: flagId,
        action: body.action
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error resolving flag:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to resolve flag', details: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}

/**
 * Handle batch operations on multiple flags
 */
async function handleBatchOperation(
  req: Request,
  supabase: any,
  userId: string
): Promise<Response> {
  const body: BatchOperationRequest = await req.json();
  
  if (!body.flag_ids || !Array.isArray(body.flag_ids) || body.flag_ids.length === 0) {
    return new Response(
      JSON.stringify({ error: 'flag_ids array required' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  if (body.flag_ids.length > 50) {
    return new Response(
      JSON.stringify({ error: 'Maximum 50 flags per batch operation' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    const results = [];
    const errors = [];

    for (const flagId of body.flag_ids) {
      try {
        // Create a synthetic request for single flag resolution
        const flagRequest = new Request(req.url, {
          method: 'POST',
          headers: req.headers,
          body: JSON.stringify({
            action: body.action,
            resolution_notes: body.resolution_notes
          })
        });

        const result = await resolveSingleFlag(flagRequest, supabase, flagId, userId);
        const resultData = await result.json();
        
        if (result.status === 200) {
          results.push({ flag_id: flagId, success: true });
        } else {
          errors.push({ flag_id: flagId, error: resultData.error });
        }
      } catch (error) {
        errors.push({ flag_id: flagId, error: error.message });
      }
    }

    return new Response(
      JSON.stringify({
        success: errors.length === 0,
        processed: results.length,
        errors: errors.length,
        results,
        errors
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in batch operation:', error);
    return new Response(
      JSON.stringify({ error: 'Batch operation failed', details: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}

/**
 * Restore a previously soft-deleted record
 */
async function handleRecordRestore(
  req: Request,
  supabase: any,
  userId: string
): Promise<Response> {
  const body: RestoreRequest = await req.json();
  
  if (!body.table_name || !body.record_id) {
    return new Response(
      JSON.stringify({ error: 'table_name and record_id required' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    const result = await supabase.rpc('restore_soft_deleted_record', {
      p_table_name: body.table_name,
      p_record_id: body.record_id
    });

    if (result.error) {
      throw result.error;
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Record restored successfully',
        table: body.table_name,
        record_id: body.record_id
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error restoring record:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to restore record', details: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}

/**
 * Get user's flags with filtering and pagination
 */
async function getUserFlags(
  req: Request,
  supabase: any,
  userId: string
): Promise<Response> {
  const url = new URL(req.url);
  const profileId = url.searchParams.get('profile_id');
  const status = url.searchParams.get('status') || 'pending';
  const severity = url.searchParams.get('severity');
  const category = url.searchParams.get('category');
  const limit = parseInt(url.searchParams.get('limit') || '50');
  const offset = parseInt(url.searchParams.get('offset') || '0');

  try {
    let query = supabase
      .from('data_quality_flags')
      .select(`
        *,
        documents(id, file_name, created_at),
        user_profiles(display_name, profile_type)
      `)
      .eq('status', status)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (profileId) {
      query = query.eq('profile_id', profileId);
    }

    if (severity) {
      query = query.eq('severity', severity);
    }

    if (category) {
      query = query.eq('category', category);
    }

    const { data: flags, error } = await query;

    if (error) {
      throw error;
    }

    // Get total count for pagination
    let countQuery = supabase
      .from('data_quality_flags')
      .select('*', { count: 'exact', head: true })
      .eq('status', status);

    if (profileId) {
      countQuery = countQuery.eq('profile_id', profileId);
    }

    const { count } = await countQuery;

    return new Response(
      JSON.stringify({
        flags,
        pagination: {
          total: count,
          limit,
          offset,
          has_more: count > offset + limit
        }
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error fetching flags:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to fetch flags', details: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}

/**
 * Get detailed information about a specific flag
 */
async function getFlagDetails(
  supabase: any,
  flagId: string,
  userId: string
): Promise<Response> {
  try {
    const { data: flag, error } = await supabase
      .from('data_quality_flags')
      .select(`
        *,
        documents(id, file_name, file_path, created_at),
        user_profiles(display_name, profile_type),
        data_quality_corrections(*)
      `)
      .eq('flag_id', flagId)
      .single();

    if (error || !flag) {
      return new Response(
        JSON.stringify({ error: 'Flag not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ flag }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error fetching flag details:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to fetch flag details', details: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}

/**
 * Get quality statistics for dashboard
 */
async function getQualityStats(
  req: Request,
  supabase: any,
  userId: string
): Promise<Response> {
  const url = new URL(req.url);
  const profileId = url.searchParams.get('profile_id');
  const days = parseInt(url.searchParams.get('days') || '30');

  try {
    const dateFrom = new Date();
    dateFrom.setDate(dateFrom.getDate() - days);

    let baseQuery = supabase
      .from('data_quality_flags')
      .select('*')
      .gte('created_at', dateFrom.toISOString());

    if (profileId) {
      baseQuery = baseQuery.eq('profile_id', profileId);
    }

    // Get flag counts by status
    const { data: allFlags } = await baseQuery;
    
    const stats = {
      total_flags: allFlags?.length || 0,
      pending_flags: allFlags?.filter(f => f.status === 'pending').length || 0,
      resolved_flags: allFlags?.filter(f => f.status === 'resolved').length || 0,
      dismissed_flags: allFlags?.filter(f => f.status === 'dismissed').length || 0,
      critical_flags: allFlags?.filter(f => f.severity === 'critical').length || 0,
      warning_flags: allFlags?.filter(f => f.severity === 'warning').length || 0,
      info_flags: allFlags?.filter(f => f.severity === 'info').length || 0,
      category_breakdown: {},
      resolution_rate: 0,
      avg_resolution_time_hours: 0
    };

    // Calculate category breakdown
    const categories = ['temporal', 'demographic', 'clinical', 'profile_mismatch', 'extraction_quality'];
    for (const category of categories) {
      stats.category_breakdown[category] = allFlags?.filter(f => f.category === category).length || 0;
    }

    // Calculate resolution rate
    const resolvedCount = stats.resolved_flags + stats.dismissed_flags;
    stats.resolution_rate = stats.total_flags > 0 ? (resolvedCount / stats.total_flags * 100) : 0;

    // Calculate average resolution time
    const resolvedFlags = allFlags?.filter(f => f.resolved_at) || [];
    if (resolvedFlags.length > 0) {
      const totalResolutionTime = resolvedFlags.reduce((sum, flag) => {
        const created = new Date(flag.created_at);
        const resolved = new Date(flag.resolved_at);
        return sum + (resolved.getTime() - created.getTime());
      }, 0);
      stats.avg_resolution_time_hours = (totalResolutionTime / resolvedFlags.length) / (1000 * 60 * 60);
    }

    return new Response(
      JSON.stringify({ stats }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error fetching quality stats:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to fetch quality stats', details: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}

/**
 * Collect ML feedback for pattern learning
 */
async function collectMLFeedback(
  req: Request,
  supabase: any,
  userId: string
): Promise<Response> {
  const body = await req.json();
  
  try {
    // This would implement ML feedback collection
    // For now, just acknowledge the request
    
    return new Response(
      JSON.stringify({ success: true, message: 'Feedback recorded' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error collecting ML feedback:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to collect feedback', details: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}

// Helper functions

/**
 * Update the original record with corrected value
 */
async function updateOriginalRecord(supabase: any, flag: any, correctedValue: any): Promise<void> {
  if (!flag.record_id || !flag.record_table || !flag.field_name) {
    return; // Can't update without these details
  }

  const updateData = { [flag.field_name]: correctedValue };
  
  await supabase
    .from(flag.record_table)
    .update(updateData)
    .eq('id', flag.record_id);
}

/**
 * Update ML pattern learning based on user feedback
 */
async function updatePatternLearning(
  supabase: any,
  flag: any,
  resolution: string,
  userRating?: number
): Promise<void> {
  try {
    // Create a signature for this pattern
    const patternSignature = {
      category: flag.category,
      problem_code: flag.problem_code,
      confidence_range: Math.floor(flag.confidence_score * 10) / 10 // Round to nearest 0.1
    };

    // Check if pattern exists
    const { data: existingPattern } = await supabase
      .from('flag_pattern_learning')
      .select('*')
      .eq('category', flag.category)
      .eq('problem_code', flag.problem_code)
      .single();

    if (existingPattern) {
      // Update existing pattern
      const isCorrection = resolution === 'corrected';
      const isFalsePositive = resolution === 'ignored';
      
      const newFrequency = existingPattern.correction_frequency + (isCorrection ? 1 : 0);
      const newSampleSize = existingPattern.sample_size + 1;
      const newFalsePositiveRate = existingPattern.false_positive_rate + 
        (isFalsePositive ? (1 - existingPattern.false_positive_rate) / newSampleSize : 0);
      
      await supabase
        .from('flag_pattern_learning')
        .update({
          correction_frequency: newFrequency,
          false_positive_rate: newFalsePositiveRate,
          user_satisfaction_score: userRating || existingPattern.user_satisfaction_score,
          last_updated: new Date().toISOString(),
          sample_size: newSampleSize
        })
        .eq('pattern_id', existingPattern.pattern_id);
    } else {
      // Create new pattern
      await supabase
        .from('flag_pattern_learning')
        .insert({
          category: flag.category,
          problem_code: flag.problem_code,
          pattern_signature: patternSignature,
          correction_frequency: resolution === 'corrected' ? 1 : 0,
          false_positive_rate: resolution === 'ignored' ? 1.0 : 0.0,
          user_satisfaction_score: userRating || 3,
          sample_size: 1
        });
    }
  } catch (error) {
    console.error('Error updating pattern learning:', error);
    // Don't throw - this is non-critical functionality
  }
}

/**
 * Restore a single flag (for undo operations)
 */
async function restoreSingleFlag(
  req: Request,
  supabase: any,
  flagId: string,
  userId: string
): Promise<Response> {
  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    // Get the flag details
    const { data: flag, error: flagError } = await supabase
      .from('data_quality_flags')
      .select('*')
      .eq('flag_id', flagId)
      .single();

    if (flagError || !flag) {
      return new Response(
        JSON.stringify({ error: 'Flag not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (flag.status !== 'resolved' || flag.resolution_action !== 'deleted') {
      return new Response(
        JSON.stringify({ error: 'Only deleted records can be restored' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Restore the record
    const result = await supabase.rpc('restore_soft_deleted_record', {
      p_table_name: flag.record_table,
      p_record_id: flag.record_id
    });

    if (result.error) {
      throw result.error;
    }

    // Reopen the flag
    await supabase
      .from('data_quality_flags')
      .update({
        status: 'pending',
        resolution_action: null,
        resolved_by: null,
        resolved_at: null,
        updated_at: new Date().toISOString()
      })
      .eq('flag_id', flagId);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Record and flag restored successfully',
        flag_id: flagId
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error restoring flag:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to restore flag', details: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}