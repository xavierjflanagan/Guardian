import { QueryClient } from '@tanstack/react-query';

// Healthcare-optimized query client configuration
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Clinical data changes slowly - longer cache times appropriate
      staleTime: 5 * 60 * 1000, // 5 minutes
      gcTime: 30 * 60 * 1000,   // 30 minutes (preserve for offline scenarios)
      retry: 3,                 // Critical for healthcare reliability
      retryDelay: attemptIndex => Math.min(1000 * 2 ** attemptIndex, 30000),
      refetchOnWindowFocus: false, // Prevent excessive API calls
      refetchOnReconnect: true,    // Sync when connection restored
    },
    mutations: {
      retry: 2, // Retry failed mutations
      onError: (error) => {
        // Global error handling for mutations
        console.error('Mutation failed:', error);
        // TODO: Add monitoring service integration
      }
    }
  }
});

export { QueryClient } from '@tanstack/react-query';