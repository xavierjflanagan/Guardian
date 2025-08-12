import { useQuery } from '@tanstack/react-query';
import { createClient } from '@/lib/supabaseClientSSR';

export interface DocumentsOptions {
  limit?: number;
  offset?: number;
  orderBy?: 'created_at' | 'updated_at' | 'upload_date' | 'filename' | 'file_size';
  orderDirection?: 'ASC' | 'DESC';
}

export interface PaginatedDocumentsResult {
  documents: any[];
  totalCount: number;
  hasMore: boolean;
}

export function useDocuments(profileId: string | null, options: DocumentsOptions = {}) {
  return useQuery({
    queryKey: ['documents', profileId, options],
    queryFn: async (): Promise<PaginatedDocumentsResult> => {
      if (!profileId) return { documents: [], totalCount: 0, hasMore: false };
      
      const supabase = createClient();
      const {
        limit = 50,
        offset = 0,
        orderBy = 'created_at',
        orderDirection = 'DESC'
      } = options;
      
      // Use production-ready function with pagination
      const { data, error } = await supabase.rpc('get_documents_for_profile', {
        p_profile_id: profileId,
        p_limit: limit,
        p_offset: offset,
        p_order_by: orderBy,
        p_order_direction: orderDirection
      });
      
      if (error) throw error;
      
      if (!data || data.length === 0) {
        return { documents: [], totalCount: 0, hasMore: false };
      }
      
      // Extract total count from first row (all rows have same total_count)
      const totalCount = data[0]?.total_count || 0;
      const documents = data.map(({ total_count, ...doc }) => doc);
      const hasMore = offset + limit < totalCount;
      
      return {
        documents,
        totalCount: Number(totalCount),
        hasMore
      };
    },
    enabled: !!profileId,
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: 3,
  });
}

// Legacy compatibility function
export function useDocumentsSimple(profileId: string | null) {
  const { data, ...rest } = useDocuments(profileId, { limit: 100 });
  return {
    data: data?.documents || [],
    ...rest
  };
}