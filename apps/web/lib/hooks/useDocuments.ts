import { useQuery } from '@tanstack/react-query';
import { createClient } from '@/lib/supabaseClientSSR';

export function useDocuments(profileId: string | null) {
  return useQuery({
    queryKey: ['documents', profileId],
    queryFn: async () => {
      if (!profileId) return [];
      
      const supabase = createClient();
      // Server-side function handles patient_id resolution and access control
      const { data, error } = await supabase.rpc('get_documents_for_profile', {
        p_profile_id: profileId
      });
      
      if (error) throw error;
      return data || [];
    },
    enabled: !!profileId,
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: 3,
  });
}