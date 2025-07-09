"use client";

import { User } from "@supabase/supabase-js";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabaseClientSSR";
import { uploadFile } from "@/utils/uploadFile";

interface Document {
  id: string;
  original_name: string | null;
  s3_key: string;
  mime_type: string | null;
  status: string | null;
  created_at: string;
}

// Create a single, stable Supabase client instance
const supabase = createClient();

export default function Dashboard() {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [isAuthLoading, setIsAuthLoading] = useState(true);

  // Effect for handling authentication state
  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setIsAuthLoading(false);
    });

    // Initial fetch of user
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        setUser(user);
      }
      setIsAuthLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Effect for fetching documents when user is available or changes
  useEffect(() => {
    if (user) {
      const fetchDocs = async () => {
        setLoadingDocs(true);
        const { data, error: docsError } = await supabase
          .from("documents")
          .select("id, original_name, s3_key, mime_type, status, created_at")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false });

        if (!docsError && data) {
          setDocuments(data);
        }
        setLoadingDocs(false);
      };
      fetchDocs();
    } else {
      // Clear documents if there is no user
      setDocuments([]);
    }
  }, [user]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFile(e.target.files?.[0] || null);
    setMessage(null);
    setError(null);
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    setUploading(true);
    setMessage(null);
    setError(null);
    try {
      if (!user) {
        setError("You must be signed in to upload files.");
        setUploading(false);
        return;
      }
      if (!file) {
        setError("Please select a file to upload.");
        setUploading(false);
        return;
      }
      const newFilePath = await uploadFile(file, user.id);

      // Invoke the document-processor Edge Function
      const { error: functionError } = await supabase.functions.invoke(
        "document-processor",
        {
          body: { filePath: newFilePath },
        }
      );

      if (functionError) {
        throw new Error(`Failed to start processing: ${functionError.message}`);
      }

      setMessage("File uploaded and processing started!");
      setFile(null);
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message || "Upload failed.");
      } else {
        setError("Upload failed.");
      }
    }
    setUploading(false);
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    // The onAuthStateChange listener will handle setting user to null
    // and redirecting will be handled by middleware or page-level checks.
    // For an immediate redirect, you could use:
    // window.location.href = '/sign-in';
  };

  if (isAuthLoading) {
    return (
      <main className="flex flex-col items-center justify-center min-h-screen p-8 bg-gray-50 dark:bg-zinc-900">
        <p>Loading...</p>
      </main>
    );
  }

  return (
    <main className="flex flex-col items-center min-h-screen p-8 bg-gray-50 dark:bg-zinc-900">
      <div className="w-full max-w-2xl">
        {user && (
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-2xl font-bold">Welcome, {user.email}</h1>
            <button
              onClick={handleSignOut}
              className="bg-red-600 text-white py-2 px-4 rounded hover:bg-red-700 disabled:opacity-50"
            >
              Sign Out
            </button>
          </div>
        )}
        {/* File Upload Form */}
        <div className="mb-8 p-6 border rounded shadow bg-white dark:bg-zinc-800">
          <h2 className="text-xl font-bold mb-4">Upload Medical Document</h2>
          <form onSubmit={handleUpload} className="space-y-4">
            <input
              type="file"
              accept="application/pdf,image/*"
              onChange={handleFileChange}
              className="w-full"
            />
            <button
              type="submit"
              disabled={uploading}
              className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700 disabled:opacity-50"
            >
              {uploading ? "Uploading..." : "Upload"}
            </button>
          </form>
          {message && <p className="mt-4 text-green-600">{message}</p>}
          {error && <p className="mt-4 text-red-600">{error}</p>}
        </div>
        {/* Documents List */}
        <div className="p-6 border rounded shadow bg-white dark:bg-zinc-800">
          <h2 className="text-xl font-bold mb-4">Your Uploaded Documents</h2>
          {loadingDocs ? (
            <p>Loading documents...</p>
          ) : documents.length === 0 ? (
            <p>No documents uploaded yet.</p>
          ) : (
            <ul className="divide-y divide-gray-200 dark:divide-zinc-700">
              {documents.map((doc) => (
                <li
                  key={doc.id}
                  className="py-2 flex flex-col sm:flex-row sm:items-center sm:justify-between"
                >
                  <span>{doc.original_name || doc.s3_key}</span>
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    {new Date(doc.created_at).toLocaleString()}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </main>
  );
}
