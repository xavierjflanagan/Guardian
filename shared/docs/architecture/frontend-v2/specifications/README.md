# Guardian Frontend Technical Specifications

**Purpose:** Detailed technical specifications for Guardian frontend architecture  
**Audience:** Development team, technical reviewers, future maintainers  
**Status:** Implementation Ready

---

## Architecture Specifications

### [Context Architecture](./context-architecture.md)
Detailed specification for the hierarchical context provider system that manages global application state.

### [Component Standards](./component-standards.md)
Technical standards and interfaces that all Guardian components must implement.

### [Data Flow Architecture](./data-flow.md)
Specification for how data flows through the application from database to UI.

### [Real-time Integration](./realtime-integration.md)
Technical specification for Supabase real-time subscriptions and live data updates.

### [Privacy & Security](./privacy-security.md)
Specification for privacy-first data handling and security implementations.

### [Performance Requirements](./performance-requirements.md)
Technical performance targets and optimization strategies.

### [Mobile & Responsive](./mobile-responsive.md)
Specification for responsive design and mobile optimization.

### [Testing Architecture](./testing-architecture.md)
Comprehensive testing strategy and requirements.

---

## Technical Standards

### TypeScript Configuration
```json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "noImplicitReturns": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "exactOptionalPropertyTypes": true
  },
  "include": ["app/**/*", "components/**/*", "lib/**/*", "types/**/*"],
  "exclude": ["node_modules", ".next", "out"]
}
```

### Code Quality Standards
- **ESLint:** Strict configuration with healthcare-specific rules
- **Prettier:** Consistent formatting across all files  
- **Husky:** Pre-commit hooks for quality checks
- **Lint-staged:** Run linting only on staged files

### Bundle Configuration
```javascript
// next.config.js
const nextConfig = {
  experimental: {
    optimizePackageImports: ['@radix-ui/react-icons'],
  },
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production',
  },
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.optimization.splitChunks = {
        chunks: 'all',
        cacheGroups: {
          vendor: {
            test: /[\\/]node_modules[\\/]/,
            name: 'vendors',
            chunks: 'all',
          },
        },
      };
    }
    return config;
  },
};
```

### Environment Configuration
```bash
# Required environment variables
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
NEXT_PUBLIC_APP_URL=
NODE_ENV=production|development|test

# Optional environment variables
NEXT_PUBLIC_ANALYTICS_ID=
NEXT_PUBLIC_SENTRY_DSN=
NEXT_PUBLIC_FEATURE_FLAGS=
DATABASE_URL=
```

---

## Database Integration

### Supabase Client Configuration
```typescript
// lib/supabase.ts
import { createClient } from '@supabase/supabase-js';
import { Database } from '@/types/database';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true
  },
  realtime: {
    params: {
      eventsPerSecond: 10
    }
  }
});
```

### Type Generation
```bash
# Generate TypeScript types from Supabase schema
npx supabase gen types typescript --project-id "your-project-ref" > types/database.ts
```

### Row Level Security Integration
All database queries automatically respect RLS policies:
```typescript
// Automatic profile filtering via RLS
const { data: medications } = await supabase
  .from('patient_medications')
  .select('*')
  .eq('active', true);
// RLS automatically filters by current user's profiles
```

---

## Component Architecture

### Component Interface Standard
```typescript
// types/components.ts
export interface GuardianComponentProps {
  profileId: string;
  context: SecurityContext;
  capabilities: Capability[];
  dateRange?: DateRange;
  onEvent?: (event: UserEvent) => void;
}

export interface SecurityContext {
  user: User;
  permissions: Permission[];
  auditLog: boolean;
  encryptionLevel: EncryptionLevel;
}

export type Capability = 
  | 'camera' 
  | 'drag-drop' 
  | 'touch' 
  | 'file-system-access' 
  | 'push-notifications'
  | 'geolocation'
  | 'offline-storage';
```

### Component Composition Pattern
```tsx
// Standard component implementation
export function MedicationList({
  profileId,
  context,
  capabilities,
  dateRange,
  onEvent
}: GuardianComponentProps & MedicationListProps) {
  // Use standardized hooks
  const medications = useMedications(profileId, dateRange);
  const { logEvent } = useEventLogging();

  const handleMedicationClick = (medicationId: string) => {
    logEvent('medication_viewed', { medicationId });
    onEvent?.({ action: 'medication_viewed', medicationId });
  };

  return (
    <div className="medication-list" data-testid="medication-list">
      {medications.map(medication => (
        <MedicationCard
          key={medication.id}
          medication={medication}
          onClick={handleMedicationClick}
          context={context}
        />
      ))}
    </div>
  );
}
```

---

## State Management

### Context Provider Hierarchy
```tsx
// app/providers.tsx - Complete provider hierarchy
export function Providers({ children }: { children: ReactNode }) {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <ProfileProvider>
          <PrivacyProvider>
            <DataProvider>
              <NotificationProvider>
                <CapabilityProvider>
                  <QueryClient client={queryClient}>
                    {children}
                  </QueryClient>
                </CapabilityProvider>
              </NotificationProvider>
            </DataProvider>
          </PrivacyProvider>
        </ProfileProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}
```

### Data Fetching Strategy
```typescript
// hooks/useHealthData.ts
export function useHealthData(profileId: string) {
  return useQuery({
    queryKey: ['health-data', profileId],
    queryFn: async () => {
      const [medications, conditions, allergies] = await Promise.all([
        supabase.from('patient_medications').select('*').eq('profile_id', profileId),
        supabase.from('patient_conditions').select('*').eq('profile_id', profileId),
        supabase.from('patient_allergies').select('*').eq('profile_id', profileId)
      ]);
      
      return {
        medications: medications.data || [],
        conditions: conditions.data || [],
        allergies: allergies.data || []
      };
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    cacheTime: 30 * 60 * 1000, // 30 minutes
  });
}
```

---

## Security Implementation

### Authentication Flow
```typescript
// lib/auth.ts
export class AuthManager {
  async signIn(email: string) {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: false
      }
    });
    
    if (error) throw error;
  }

  async handleCallback() {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    
    // Log authentication event
    logUserEvent('user_authenticated', {
      method: 'magic_link',
      timestamp: new Date()
    });
    
    return data.session;
  }
}
```

### Data Privacy Implementation
```typescript
// lib/privacy.ts
export class PrivacyManager {
  encryptSensitiveData(data: any, level: EncryptionLevel): string {
    switch (level) {
      case 'standard':
        return btoa(JSON.stringify(data)); // Basic encoding
      case 'enhanced':
        return this.aesEncrypt(data); // AES encryption
      case 'zero-knowledge':
        return this.clientSideEncrypt(data); // Client-side only
      default:
        return JSON.stringify(data);
    }
  }

  async auditDataAccess(action: string, resourceId: string) {
    await supabase.from('audit_log').insert({
      action,
      resource_id: resourceId,
      user_id: (await supabase.auth.getUser()).data.user?.id,
      timestamp: new Date(),
      ip_address: await this.getClientIP()
    });
  }
}
```

---

## Performance Optimization

### Bundle Splitting Strategy
```typescript
// Dynamic imports for code splitting
const TimelineTab = dynamic(() => import('@/components/tabs/timeline'), {
  loading: () => <TimelineTabSkeleton />
});

const InsightsTab = dynamic(() => import('@/components/tabs/insights'), {
  loading: () => <InsightsTabSkeleton />
});
```

### Caching Strategy
```typescript
// Service worker for caching
self.addEventListener('fetch', (event) => {
  if (event.request.url.includes('/api/health-data')) {
    event.respondWith(
      caches.open('health-data-v1').then(cache => {
        return cache.match(event.request).then(response => {
          if (response) {
            // Serve from cache, update in background
            fetch(event.request).then(fetchResponse => {
              cache.put(event.request, fetchResponse.clone());
            });
            return response;
          }
          return fetch(event.request);
        });
      })
    );
  }
});
```

---

## Deployment Architecture

### Build Pipeline
```yaml
# .github/workflows/deploy.yml
name: Deploy Guardian Frontend
on:
  push:
    branches: [main]

jobs:
  build-and-deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
          cache: 'npm'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Type check
        run: npm run type-check
      
      - name: Lint
        run: npm run lint
      
      - name: Test
        run: npm run test -- --coverage
      
      - name: Build
        run: npm run build
        env:
          NEXT_PUBLIC_SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          NEXT_PUBLIC_SUPABASE_ANON_KEY: ${{ secrets.SUPABASE_ANON_KEY }}
      
      - name: Deploy to Production
        run: npm run deploy
```

---

## Monitoring & Analytics

### Performance Monitoring
```typescript
// lib/monitoring.ts
export function reportWebVitals(metric: NextWebVitalsMetric) {
  if (metric.label === 'web-vital') {
    logUserEvent('performance_metric', {
      name: metric.name,
      value: metric.value,
      rating: metric.rating
    });
  }
}
```

### Error Tracking
```typescript
// lib/error-tracking.ts
export function captureException(error: Error, context?: any) {
  logUserEvent('frontend_error', {
    message: error.message,
    stack: error.stack,
    context,
    userAgent: navigator.userAgent,
    url: window.location.href
  });
}
```

---

*For specific implementation details, refer to the individual specification documents.*