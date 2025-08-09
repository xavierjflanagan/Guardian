import { useQuery } from '@tanstack/react-query';
import { createClient } from '@/lib/supabaseClientSSR';

interface DateRange {
  start?: Date;
  end?: Date;
}

interface TimelineOptions {
  dateRange?: DateRange;
  eventTypes?: string[];
  limit?: number;
}

export function useTimeline(profileId: string | null, options?: TimelineOptions) {
  return useQuery({
    queryKey: ['timeline', profileId, options],
    queryFn: async () => {
      if (!profileId) return [];
      
      const supabase = createClient();
      // Server-side function handles patient_id resolution and filtering
      const { data, error } = await supabase.rpc('get_timeline_for_profile', {
        p_profile_id: profileId,
        p_date_start: options?.dateRange?.start?.toISOString(),
        p_date_end: options?.dateRange?.end?.toISOString(),
        p_event_types: options?.eventTypes,
        p_limit: options?.limit
      });
      
      if (error) throw error;
      return data || [];
    },
    enabled: !!profileId,
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: 3,
  });
}

export type { DateRange, TimelineOptions };