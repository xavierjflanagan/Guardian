import { useQuery } from '@tanstack/react-query';
import { createClient } from '@/lib/supabaseClientSSR';
import type { AllowedPatient } from '@/app/providers/ProfileProvider';

export function useAllowedPatients(profileId: string | null) {
  return useQuery({
    queryKey: ['allowed-patients', profileId],
    queryFn: async (): Promise<AllowedPatient[]> => {
      if (!profileId) return [];
      
      const supabase = createClient();
      const { data, error } = await supabase.rpc('get_allowed_patient_ids', { 
        p_profile_id: profileId 
      });
      
      if (error) throw error;
      return data || [];
    },
    enabled: !!profileId,
    staleTime: 5 * 60 * 1000, // 5min cache (access doesn't change frequently)
    retry: 3,
  });
}