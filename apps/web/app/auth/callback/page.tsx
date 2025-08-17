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
        // Let the client library detect the PKCE params in the URL and exchange for a session
        const { error: sessionError } = await supabase.auth.getSession();
        if (sessionError) throw sessionError;

        // The PKCE exchange is performed automatically by @supabase/ssr createBrowserClient
        // when detectSessionInUrl is true (configured in supabaseClientSSR.ts).
        const {
          data: { user, session },
          error: userError,
        } = await supabase.auth.getUser();
        if (userError) throw userError;

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


