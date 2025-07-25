"use client";

import { User } from "@supabase/supabase-js";
import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabaseClientSSR";
import { uploadFile } from "@/utils/uploadFile";
import { Document } from "@/types/guardian";
import { MedicalDashboard } from "@/components/MedicalDashboard";

// Create a single, stable Supabase client instance
const supabase = createClient();

export default function DashboardPage() {
  const [user, setUser] = useState<User | null>(null);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

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

  // Fetch documents function
  const fetchDocuments = useCallback(async () => {
    if (!user) {
      setDocuments([]);
      return;
    }

    setLoadingDocs(true);
    try {
      const { data, error } = await supabase
        .from("documents")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Error fetching documents:", error);
      } else {
        setDocuments(data || []);
      }
    } catch (error) {
      console.error("Error fetching documents:", error);
    } finally {
      setLoadingDocs(false);
    }
  }, [user]);

  // Effect for fetching documents when user is available or changes
  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  // Handle file upload
  const handleDocumentUpload = async (file: File) => {
    if (!user) {
      setUploadError("You must be signed in to upload files.");
      return;
    }

    setUploading(true);
    setUploadMessage(null);
    setUploadError(null);

    try {
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

      setUploadMessage("File uploaded and processing started!");
      
      // Refresh documents list
      await fetchDocuments();
    } catch (err) {
      if (err instanceof Error) {
        setUploadError(err.message || "Upload failed.");
      } else {
        setUploadError("Upload failed.");
      }
    } finally {
      setUploading(false);
    }
  };

  // Handle sign out
  const handleSignOut = async () => {
    await supabase.auth.signOut();
  };

  if (isAuthLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Access Denied</h1>
          <p className="text-gray-600 mb-4">You must be signed in to access the dashboard.</p>
          <a
            href="/sign-in"
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
          >
            Sign In
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* User Header */}
      <div className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div>
              <h1 className="text-xl font-semibold text-gray-900">
                Welcome, {user.email}
              </h1>
            </div>
            <button
              onClick={handleSignOut}
              className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              Sign Out
            </button>
          </div>
        </div>
      </div>

      {/* Main Dashboard */}
      <MedicalDashboard
        documents={documents}
        onDocumentUpload={handleDocumentUpload}
        onRefreshDocuments={fetchDocuments}
        isUploading={uploading}
        uploadError={uploadError}
        uploadMessage={uploadMessage}
      />
    </div>
  );
}