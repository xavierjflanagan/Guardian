import { useQuery, useInfiniteQuery } from '@tanstack/react-query';
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

interface TimelineCursorOptions extends TimelineOptions {
  cursorDate?: Date;
  cursorId?: string;
}

interface TimelineResult {
  events: any[];
  hasMore: boolean;
  nextCursor?: { date: Date; id: string };
}

export function useTimeline(profileId: string | null, options?: TimelineOptions) {
  return useQuery({
    queryKey: ['timeline', profileId, options],
    queryFn: async () => {
      if (!profileId) return [];
      
      const supabase = createClient();
      // Use legacy function signature for backward compatibility
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

// New cursor-based infinite query for production use
export function useTimelineInfinite(profileId: string | null, options?: TimelineOptions) {
  return useInfiniteQuery({
    queryKey: ['timeline-infinite', profileId, options],
    queryFn: async ({ pageParam }): Promise<TimelineResult> => {
      if (!profileId) return { events: [], hasMore: false };
      
      const supabase = createClient();
      const cursor = pageParam as { date?: Date; id?: string } | undefined;
      
      // Use production function with cursor pagination
      const { data, error } = await supabase.rpc('get_timeline_for_profile', {
        p_profile_id: profileId,
        p_date_start: options?.dateRange?.start?.toISOString(),
        p_date_end: options?.dateRange?.end?.toISOString(),
        p_event_types: options?.eventTypes,
        p_limit: options?.limit || 50,
        p_cursor_date: cursor?.date?.toISOString(),
        p_cursor_id: cursor?.id
      });
      
      if (error) throw error;
      
      if (!data || data.length === 0) {
        return { events: [], hasMore: false };
      }
      
      // All rows have the same has_more value
      const hasMore = data[0]?.has_more || false;
      const events = data.map(({ has_more, ...event }) => event);
      
      // Get cursor for next page from last event
      const lastEvent = events[events.length - 1];
      const nextCursor = hasMore && lastEvent ? {
        date: new Date(lastEvent.event_date),
        id: lastEvent.id
      } : undefined;
      
      return {
        events,
        hasMore,
        nextCursor
      };
    },
    enabled: !!profileId,
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: 3,
    initialPageParam: undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
  });
}

// Hook for getting flattened infinite timeline data
export function useTimelineData(profileId: string | null, options?: TimelineOptions) {
  const { data, fetchNextPage, hasNextPage, isLoading, isFetchingNextPage, error } = 
    useTimelineInfinite(profileId, options);
  
  const events = data?.pages.flatMap(page => page.events) ?? [];
  const hasMore = hasNextPage;
  
  return {
    events,
    hasMore,
    loadMore: fetchNextPage,
    isLoading,
    isLoadingMore: isFetchingNextPage,
    error
  };
}

export type { DateRange, TimelineOptions, TimelineCursorOptions, TimelineResult };