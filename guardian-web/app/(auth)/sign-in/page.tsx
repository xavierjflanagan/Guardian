"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabaseClientSSR";

export default function SignInPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const supabase = createClient();

  // Check for auth callback errors from URL
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const authError = urlParams.get('error');
    if (authError) {
      setError(`Authentication error: ${authError.replace('_', ' ')}`);
    }
  }, []);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);
    setError(null);
    const { error } = await supabase.auth.signInWithOtp({ 
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`
      }
    });
    if (error) {
      setError(error.message);
    } else {
      setMessage("Check your email for a magic link to sign in.");
      setEmail("");
    }
    setLoading(false);
  };

  return (
    <div className="max-w-md mx-auto mt-20 p-6 border rounded shadow">
      <h1 className="text-2xl font-bold mb-4">Sign in to Guardian</h1>
      <form onSubmit={handleSignIn} className="space-y-4">
        <input
          type="email"
          required
          placeholder="Your email address"
          value={email}
          onChange={e => setEmail(e.target.value)}
          className="w-full px-3 py-2 border rounded"
        />
        <button
          type="submit"
          disabled={loading}
          className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? "Sending..." : "Send Magic Link"}
        </button>
      </form>
      {message && <p className="mt-4 text-green-600">{message}</p>}
      {error && <p className="mt-4 text-red-600">{error}</p>}
    </div>
  );
}
