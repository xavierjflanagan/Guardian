'use client';

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { useUser } from '@/lib/auth';

// Profile types
interface Profile {
  id: string;
  account_owner_id: string;
  profile_type: 'self' | 'child' | 'pet' | 'dependent';
  profile_status: 'active' | 'inactive' | 'pending_transfer';
  display_name: string;
  full_name?: string;
  date_of_birth?: string;
  relationship?: string;
  theme_color: string;
  avatar_url?: string;
  created_at: string;
  archived: boolean;
}

interface AllowedPatient {
  patient_id: string;
  access_type: string;
  relationship: string;
}

interface ProfileContextValue {
  // Core state
  currentProfile: Profile | null;
  profiles: Profile[];
  allowedPatients: AllowedPatient[];
  
  // Actions
  switchProfile: (profileId: string) => Promise<void>;
  refreshProfiles: () => Promise<void>;
  
  // State
  isLoading: boolean;
  error: string | null;
}

const ProfileContext = createContext<ProfileContextValue | null>(null);

export function ProfileProvider({ children }: { children: ReactNode }) {
  const user = useUser();
  const [supabase] = useState(() => createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  ));
  
  // State
  const [currentProfile, setCurrentProfile] = useState<Profile | null>(null);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [allowedPatients, setAllowedPatients] = useState<AllowedPatient[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load user profiles from database
  const loadProfiles = useCallback(async () => {
    if (!user?.id) return;

    try {
      setIsLoading(true);
      setError(null);

      // Fetch all profiles owned by current user
      const { data: userProfiles, error: profilesError } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('account_owner_id', user.id)
        .eq('archived', false)
        .order('created_at', { ascending: true });

      if (profilesError) throw profilesError;

      if (userProfiles?.length) {
        setProfiles(userProfiles);
        
        // Try to restore previous profile selection
        const { data: contextData } = await supabase
          .from('user_profile_context')
          .select('current_profile_id')
          .eq('user_id', user.id)
          .single();

        let targetProfile = userProfiles[0]; // Default fallback
        
        if (contextData?.current_profile_id) {
          const savedProfile = userProfiles.find(p => p.id === contextData.current_profile_id);
          if (savedProfile) {
            targetProfile = savedProfile;
          }
        } else {
          // Prefer 'self' profile as default
          const selfProfile = userProfiles.find(p => p.profile_type === 'self');
          if (selfProfile) {
            targetProfile = selfProfile;
          }
        }
        
        setCurrentProfile(targetProfile);
        await loadAllowedPatients(targetProfile.id);
      }
    } catch (err) {
      console.error('Failed to load profiles:', err);
      setError(err instanceof Error ? err.message : 'Failed to load profiles');
    } finally {
      setIsLoading(false);
    }
  }, [user?.id, supabase]);

  // Load allowed patients for current profile
  const loadAllowedPatients = useCallback(async (profileId: string) => {
    try {
      const { data, error } = await supabase.rpc('get_allowed_patient_ids', {
        p_profile_id: profileId
      });

      if (error) throw error;
      setAllowedPatients(data || []);
    } catch (err) {
      console.error('Failed to load allowed patients:', err);
      setAllowedPatients([]);
    }
  }, [supabase]);

  // Switch to different profile
  const switchProfile = useCallback(async (profileId: string) => {
    const profile = profiles.find(p => p.id === profileId);
    if (!profile || !user?.id) return;

    try {
      setIsLoading(true);
      setCurrentProfile(profile);
      
      // Update database context
      await supabase.from('user_profile_context').upsert({
        user_id: user.id,
        current_profile_id: profileId,
        last_switched_at: new Date().toISOString()
      });

      // Load allowed patients for new profile
      await loadAllowedPatients(profileId);

      // Log the profile switch event
      await supabase.from('user_events').insert({
        profile_id: profileId,
        action: 'profile_switch',
        metadata: {
          from_profile: currentProfile?.id,
          to_profile: profileId,
          profile_name: profile.display_name
        },
        session_id: crypto.randomUUID(),
        privacy_level: 'internal'
      });

    } catch (err) {
      console.error('Failed to switch profile:', err);
      setError(err instanceof Error ? err.message : 'Failed to switch profile');
    } finally {
      setIsLoading(false);
    }
  }, [profiles, user?.id, currentProfile?.id, supabase, loadAllowedPatients]);

  // Refresh all profile data
  const refreshProfiles = useCallback(async () => {
    await loadProfiles();
  }, [loadProfiles]);

  // Load profiles when user changes
  useEffect(() => {
    if (user?.id) {
      loadProfiles();
    } else {
      // Clear state when user logs out
      setCurrentProfile(null);
      setProfiles([]);
      setAllowedPatients([]);
      setIsLoading(false);
      setError(null);
    }
  }, [user?.id, loadProfiles]);

  const value: ProfileContextValue = {
    currentProfile,
    profiles,
    allowedPatients,
    switchProfile,
    refreshProfiles,
    isLoading,
    error
  };

  return (
    <ProfileContext.Provider value={value}>
      {children}
    </ProfileContext.Provider>
  );
}

// Hook to use profile context
export function useProfile() {
  const context = useContext(ProfileContext);
  if (!context) {
    throw new Error('useProfile must be used within a ProfileProvider');
  }
  return context;
}

// Convenience hook to get current patient IDs
export function useAllowedPatients() {
  const { allowedPatients, isLoading, error } = useProfile();
  
  return {
    patientIds: allowedPatients.map(p => p.patient_id),
    allowedPatients,
    isLoading,
    error
  };
}

// Type exports
export type { Profile, AllowedPatient, ProfileContextValue };