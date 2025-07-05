import { User } from "@supabase/supabase-js";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { uploadFile } from "@/utils/uploadFile";

interface Document {
  id: string;
  original_name: string | null;
  s3_key: string;
  mime_type: string | null;
  status: string | null;
  created_at: string;
}

export default function Dashboard() {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(false);

  useEffect(() => {
    const fetchUserAndDocs = async () => {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        setUser(null);
        return;
      }
      setUser(user);
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
    fetchUserAndDocs();
  }, [uploading]);

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
      const { error: functionError } = await supabase.functions.invoke('document-processor', {
        body: { filePath: newFilePath },
      });

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

  return (
    <main className="flex flex-col items-center min-h-screen p-8 bg-gray-50 dark:bg-zinc-900">
      <div className="w-full max-w-2xl">
        {user && (
          <h1 className="text-2xl font-bold mb-6">Welcome, {user.email}</h1>
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
                <li key={doc.id} className="py-2 flex flex-col sm:flex-row sm:items-center sm:justify-between">
                  <span>{doc.original_name || doc.s3_key}</span>
                  <span className="text-xs text-gray-500 dark:text-gray-400">{new Date(doc.created_at).toLocaleString()}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </main>
  );
}
