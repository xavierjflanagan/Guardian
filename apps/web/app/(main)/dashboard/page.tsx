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
  console.log('=================================================');
  console.log('DASHBOARD PAGE LOADED - Console logging is working!');
  console.log('Timestamp:', new Date().toISOString());
  console.log('=================================================');

  const [user, setUser] = useState<User | null>(null);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  // Remove unused loading state - documents loading handled by useDocuments hook
  const [uploading, setUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  console.log('[DASHBOARD] Current state:', { uploading, hasUploadMessage: !!uploadMessage, hasUploadError: !!uploadError });

  // Effect for handling authentication state
  useEffect(() => {
    console.log('Dashboard: Initializing auth state management');
    
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      console.log('Dashboard: Auth state changed', { 
        event, 
        user: session?.user?.email || 'null',
        hasSession: !!session,
        url: typeof window !== 'undefined' ? window.location.href : 'server'
      });
      
      setUser(session?.user ?? null);
      setIsAuthLoading(false);
    });

    // Initial fetch of user
    supabase.auth.getUser().then(({ data: { user }, error }) => {
      console.log('Dashboard: Initial user fetch', { 
        user: user?.email || 'null',
        error: error?.message || 'none',
        url: typeof window !== 'undefined' ? window.location.href : 'server'
      });
      
      setUser(user);
      setIsAuthLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Fetch documents function (V3: using shell_files table)
  const fetchDocuments = useCallback(async () => {
    if (!user) {
      setDocuments([]);
      return;
    }

    // Loading state now handled by useDocuments hook
    try {
      const { data, error } = await supabase
        .from("shell_files")
        .select("*")
        .eq("patient_id", user.id)
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Error fetching shell_files:", error);
      } else {
        setDocuments(data || []);
      }
    } catch (error) {
      console.error("Error fetching shell_files:", error);
    } finally {
      // Loading state now handled by useDocuments hook
    }
  }, [user]);

  // Effect for fetching documents when user is available or changes
  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  // Handle file upload
  const handleDocumentUpload = async (file: File) => {
    console.log('[DEBUG] handleDocumentUpload START', { fileName: file.name, hasUser: !!user });

    if (!user) {
      console.log('[DEBUG] No user, aborting');
      setUploadError("You must be signed in to upload files.");
      return;
    }

    console.log('[DEBUG] Setting uploading=true');
    setUploading(true);
    setUploadMessage(null);
    setUploadError(null);

    try {
      console.log('[DEBUG] Calling uploadFile...');
      // V3: uploadFile now handles everything (storage + shell-file-processor-v3 + job enqueue)
      const _shellFileId = await uploadFile(file, user.id);
      console.log('[DEBUG] uploadFile SUCCESS', { shellFileId: _shellFileId });

      console.log('[DEBUG] Setting success message');
      setUploadMessage("File uploaded and AI processing started!");

      console.log('[DEBUG] Triggering fetchDocuments (background)');
      // Refresh documents list (don't await - let it run in background)
      fetchDocuments().catch(err => {
        console.error("Error refreshing documents after upload:", err);
      });

      console.log('[DEBUG] About to enter finally block');
    } catch (err) {
      console.log('[DEBUG] uploadFile FAILED', { error: err });
      if (err instanceof Error) {
        setUploadError(err.message || "Upload failed.");
      } else {
        setUploadError("Upload failed.");
      }
    } finally {
      console.log('[DEBUG] FINALLY BLOCK - Setting uploading=false');
      // Always reset uploading state, even if fetchDocuments fails
      setUploading(false);
      console.log('[DEBUG] FINALLY BLOCK COMPLETE');
    }

    console.log('[DEBUG] handleDocumentUpload END');
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