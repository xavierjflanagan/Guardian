"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabaseClientSSR";
import { useRouter } from "next/navigation";

export default function AuthCallbackPage() {
  const router = useRouter();
  const supabase = createClient();
  const [message, setMessage] = useState<string>("Completing sign-in…");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    const run = async () => {
      try {
        // Debug logging for troubleshooting
        console.log('[Auth Callback] URL:', window.location.href);
        console.log('[Auth Callback] Query params:', window.location.search);
        console.log('[Auth Callback] Hash fragment:', window.location.hash);

        // Let the client library detect the PKCE params in the URL and exchange for a session
        const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
        console.log('[Auth Callback] Initial session check:', {
          hasSession: !!sessionData?.session,
          error: sessionError
        });
        if (sessionError) throw sessionError;

        // Defensive token exchange: if session not auto-detected, try explicit exchange
        if (!sessionData?.session) {
          const urlParams = new URLSearchParams(window.location.search);
          const hashParams = new URLSearchParams(window.location.hash.substring(1));

          if (urlParams.has('code') || urlParams.has('token') || hashParams.has('access_token')) {
            console.log('[Auth Callback] No session detected, attempting explicit token exchange');
            const { data: exchangeData, error: exchangeError } =
              await supabase.auth.exchangeCodeForSession(window.location.href);

            if (exchangeError) {
              console.log('[Auth Callback] Token exchange error:', exchangeError);
            } else if (exchangeData?.session) {
              console.log('[Auth Callback] Token exchange successful');
            }
          }
        }

        // The PKCE exchange is performed automatically by @supabase/ssr createBrowserClient
        // when detectSessionInUrl is true (configured in supabaseClientSSR.ts).
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();
        if (userError) throw userError;

        const {
          data: { session },
          error: sessionFetchError,
        } = await supabase.auth.getSession();
        if (sessionFetchError) throw sessionFetchError;

        if (session && user && isMounted) {
          setMessage("Signed in. Redirecting…");
          router.replace("/dashboard");
          return;
        }

        // If no session, surface error from URL if present
        const url = new URL(window.location.href);
        const err = url.searchParams.get("error_description") || url.searchParams.get("error");
        if (err && isMounted) {
          setError(err);
          setMessage("");
          return;
        }

        if (isMounted) {
          setError("Authentication failed. Please request a new magic link and try again.");
          setMessage("");
        }
      } catch (e: unknown) {
        if (isMounted) {
          const msg = e instanceof Error ? e.message : "Authentication error";
          setError(msg);
          setMessage("");
        }
      }
    };

    run();
    return () => {
      isMounted = false;
    };
  }, [router, supabase]);

  return (
    <div className="max-w-md mx-auto mt-24 p-6 border rounded">
      <h1 className="text-xl font-semibold mb-2">Signing you in…</h1>
      {message && <p className="text-gray-700">{message}</p>}
      {error && <p className="text-red-600">{error}</p>}
    </div>
  );
}


