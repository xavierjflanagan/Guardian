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
  extracted_text?: string | null;
  ocr_confidence?: number | null;
  processed_at?: string | null;
  error_log?: string | null;
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
          .select("id, original_name, s3_key, mime_type, status, created_at, extracted_text, ocr_confidence, processed_at, error_log")
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
            <div className="space-y-4">
              {documents.map((doc) => (
                <div
                  key={doc.id}
                  className="p-4 border rounded-lg bg-gray-50 dark:bg-zinc-700"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-2">
                    <h3 className="font-medium">{doc.original_name || doc.s3_key}</h3>
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${
                        doc.status === 'completed' ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' :
                        doc.status === 'processing' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200' :
                        doc.status === 'failed' ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200' :
                        'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200'
                      }`}>
                        {doc.status}
                      </span>
                      {doc.ocr_confidence && (
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                          {doc.ocr_confidence}% confidence
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                    Uploaded: {new Date(doc.created_at).toLocaleString()}
                    {doc.processed_at && ` • Processed: ${new Date(doc.processed_at).toLocaleString()}`}
                  </div>
                  {doc.extracted_text && (
                    <div className="mt-2">
                      <details className="cursor-pointer">
                        <summary className="text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline">
                          View Extracted Text
                        </summary>
                        <div className="mt-2 p-3 bg-white dark:bg-zinc-800 rounded border text-sm max-h-32 overflow-y-auto">
                          <pre className="whitespace-pre-wrap font-mono text-xs">{doc.extracted_text}</pre>
                        </div>
                      </details>
                    </div>
                  )}
                  {doc.error_log && (
                    <div className="mt-2 p-2 bg-red-50 dark:bg-red-900/20 rounded border border-red-200 dark:border-red-800">
                      <p className="text-sm text-red-700 dark:text-red-300 font-medium">Processing Error:</p>
                      <pre className="text-xs text-red-600 dark:text-red-400 mt-1">{doc.error_log}</pre>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
