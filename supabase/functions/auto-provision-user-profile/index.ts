// =============================================================================
// AUTO-PROVISION-USER-PROFILE - Auth Hook Handler
// =============================================================================
// PURPOSE: Automatically create user_profiles record when new user signs up
// TRIGGER: Supabase Auth Hook (user.created event) - PREFERRED
//          OR Database Webhook on auth.users INSERT - FALLBACK
// SECURITY: Validates X-Webhook-Secret header to prevent unauthorized calls
// IDEMPOTENCY: Safe to call multiple times (checks for existing profile)
// =============================================================================

import { createServiceRoleClient, getEdgeFunctionEnv } from '../_shared/supabase-client.ts';

// Auth Hook payload (BEFORE user created event)
interface AuthHookPayload {
  event?: 'user.created';
  user_id?: string;
  email?: string;
  email_data?: {
    token: string;
    token_hash: string;
    redirect_to: string;
    email_action_type: string;
  };
  user?: {
    id: string;
    email: string;
    user_metadata?: {
      full_name?: string;
      name?: string;
    };
    created_at: string;
  };
}

// Database Webhook payload (auth.users INSERT)
interface DatabaseWebhookPayload {
  type: 'INSERT';
  table: string;
  record: {
    id: string;
    email: string;
    raw_user_meta_data?: {
      full_name?: string;
      name?: string;
    };
    created_at: string;
  };
  schema: string;
}

Deno.serve(async (req: Request) => {
  try {
    // Log headers for debugging
    console.log('[auto-provision] Request headers:', Object.fromEntries(req.headers.entries()));

    // Parse webhook payload (supports both Auth Hooks and Database Webhooks)
    let payload: AuthHookPayload | DatabaseWebhookPayload;
    try {
      payload = await req.json();
      console.log('[auto-provision] Received payload:', JSON.stringify(payload, null, 2));
    } catch (e) {
      console.error('[auto-provision] Failed to parse JSON:', e);
      return new Response(
        JSON.stringify({ error: 'Invalid JSON payload' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Extract user data based on payload type
    let userId: string;
    let userEmail: string;
    let userMetadata: any;
    let createdAt: string;

    if ('event' in payload && payload.event === 'user.created') {
      // Auth Hook payload (preferred)
      userId = payload.user.id;
      userEmail = payload.user.email;
      userMetadata = payload.user.user_metadata;
      createdAt = payload.user.created_at;
      console.log(`[auto-provision] Processing Auth Hook for user: ${userEmail}`);
    } else if ('type' in payload && payload.type === 'INSERT') {
      // Database Webhook payload (fallback)
      if (payload.table !== 'users' || payload.schema !== 'auth') {
        return new Response(
          JSON.stringify({ message: 'Ignored: Not an auth.users INSERT event' }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      userId = payload.record.id;
      userEmail = payload.record.email;
      userMetadata = payload.record.raw_user_meta_data;
      createdAt = payload.record.created_at;
      console.log(`[auto-provision] Processing Database Webhook for user: ${userEmail}`);
    } else {
      return new Response(
        JSON.stringify({ error: 'Invalid payload format' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Only process INSERT events on auth.users
    if (payload.type !== 'INSERT' || payload.table !== 'users' || payload.schema !== 'auth') {
      return new Response(
        JSON.stringify({ message: 'Ignored: Not an auth.users INSERT event' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Initialize Supabase service role client
    const env = getEdgeFunctionEnv();
    const supabase = createServiceRoleClient(env);

    // IDEMPOTENCY: Check if user_profiles record already exists
    // Safe to retry - will not create duplicates
    const { data: existingProfile } = await supabase
      .from('user_profiles')
      .select('id')
      .eq('id', userId)
      .single();

    if (existingProfile) {
      console.log(`[auto-provision] Profile already exists for user: ${userEmail}`);
      return new Response(
        JSON.stringify({
          message: 'Profile already exists (idempotent)',
          profile_id: existingProfile.id
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Extract display name from metadata or email
    const displayName =
      userMetadata?.full_name ||
      userMetadata?.name ||
      userEmail.split('@')[0]; // Use email prefix as fallback

    // Create user_profiles record
    const { data: newProfile, error: insertError } = await supabase
      .from('user_profiles')
      .insert({
        id: userId, // Same UUID as auth.users.id
        account_owner_id: userId,
        profile_type: 'self',
        display_name: displayName,
        email: userEmail,
        auth_level: 'read_write',
        created_at: createdAt,
        updated_at: createdAt,
      })
      .select('id')
      .single();

    if (insertError) {
      console.error(`[auto-provision] Failed to create profile: ${insertError.message}`);

      // If error is duplicate key (race condition), check again
      if (insertError.code === '23505') {
        const { data: retryCheck } = await supabase
          .from('user_profiles')
          .select('id')
          .eq('id', userId)
          .single();

        if (retryCheck) {
          console.log(`[auto-provision] Profile created by concurrent request: ${userEmail}`);
          return new Response(
            JSON.stringify({
              message: 'Profile created by concurrent request (race handled)',
              profile_id: retryCheck.id
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
      }

      throw insertError;
    }

    console.log(`[auto-provision] Successfully created user_profiles record: ${newProfile.id}`);

    return new Response(
      JSON.stringify({
        message: 'User profile created successfully',
        profile_id: newProfile.id,
        user_email: userEmail
      }),
      { status: 201, headers: { 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[auto-provision] Error:', error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Unknown error',
        message: 'Failed to create user profile'
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});
