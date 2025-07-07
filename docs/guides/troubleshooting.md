# Troubleshooting Guide - Guardian

**Purpose:** Common issues and solutions for Guardian development and deployment.
**Last updated:** July 2025
**Audience:** Developers, contributors
**Prerequisites:** Familiarity with Node.js, Next.js, Supabase, and Vercel

---

## 🎯 Quick Problem Resolution

### 🔍 Find Your Issue Fast

| Problem Area | Common Symptoms | Jump To |
|--------------|-----------------|---------|
| **Setup & Installation** | Won't start, dependency errors | [Setup Issues](#setup-issues) |
| **Authentication** | Login failures, redirect errors | [Auth Issues](#authentication-issues) |
| **File Upload** | Upload failures, storage errors | [File Upload Issues](#file-upload-issues) |
| **Database** | Connection errors, query failures | [Database Issues](#database-issues) |
| **API** | 404s, 500s, timeout errors | [API Issues](#api-issues) |
| **Deployment** | Build failures, production errors | [Deployment Issues](#deployment-issues) |
| **Performance** | Slow loading, memory issues | [Performance Issues](#performance-issues) |

---

## 🛠️ Setup Issues

### Issue: `npm install` fails with dependency errors

**Symptoms:**
```bash
npm ERR! peer dep missing: react@18.0.0
npm ERR! Could not resolve dependency
```

**Solution:**
```bash
# Clear npm cache
npm cache clean --force

# Delete node_modules and package-lock.json
rm -rf node_modules package-lock.json

# Use exact Node.js version
nvm use 18.17.0  # or whatever version is specified in .nvmrc

# Install dependencies
npm install

# If still failing, try:
npm install --legacy-peer-deps
```

### Issue: Environment variables not loading

**Symptoms:**
- `undefined` values for environment variables
- "Missing required environment variables" errors

**Solution:**
```bash
# Check .env.local file exists and has correct format
# File should be in project root, not in docs/

# Verify environment variable names
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Restart development server after changes
npm run dev
```

### Issue: TypeScript errors on first run

**Symptoms:**
```bash
Type error: Cannot find module '@/lib/supabase' or its corresponding type declarations
```

**Solution:**
```bash
# Check tsconfig.json has correct path mapping
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  }
}

# Verify file structure matches imports
src/
├── lib/
│   └── supabase.ts
├── components/
└── app/

# Clear TypeScript cache
rm -rf .next
npm run dev
```

---

## 🔐 Authentication Issues

### Issue: Magic link authentication not working

**Symptoms:**
- Email sent but clicking link doesn't log user in
- "Invalid link" or "Link expired" errors
- Redirect loops

**Solution:**
```bash
# 1. Check Supabase Auth settings
# Go to Supabase Dashboard > Authentication > Settings

# 2. Verify Site URL matches your app URL
Site URL: http://localhost:3000 (development)
Site URL: https://your-app.vercel.app (production)

# 3. Check redirect URLs are configured
Redirect URLs:
- http://localhost:3000/auth/callback
- https://your-app.vercel.app/auth/callback

# 4. Test email template
# In Supabase Dashboard > Authentication > Email Templates
# Ensure magic link contains: {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=magiclink
```

### Issue: User session not persisting

**Symptoms:**
- User logged out after page refresh
- Session appears to expire immediately

**Solution:**
```javascript
// Check session handling in your app
// In layout.tsx or _app.tsx
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { useEffect, useState } from 'react';

export default function App() {
  const [session, setSession] = useState(null);
  const supabase = createClientComponentClient();

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  // Rest of your app
}
```

### Issue: Authentication redirects to wrong URL

**Symptoms:**
- After login, redirected to localhost instead of production URL
- CORS errors in production

**Solution:**
```javascript
// Check your auth callback handling
// In app/auth/callback/route.ts
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { NextResponse } from 'next/server';

export async function GET(request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');

  if (code) {
    const supabase = createRouteHandlerClient({ cookies });
    await supabase.auth.exchangeCodeForSession(code);
  }

  // Use environment variable for redirect
  const redirectUrl = process.env.NEXT_PUBLIC_APP_URL || requestUrl.origin;
  return NextResponse.redirect(`${redirectUrl}/dashboard`);
}
```

---

## 📁 File Upload Issues

### Issue: File upload fails with "Storage error"

**Symptoms:**
```bash
Error: Storage: Object not found
Error: Storage: Bucket not found
Error: Storage: Access denied
```

**Solution:**
```bash
# 1. Check bucket exists in Supabase Dashboard > Storage
# Create "medical-docs" bucket if missing

# 2. Verify RLS policies are set
# In Supabase Dashboard > Storage > Policies
```

```sql
-- Required RLS policies for file upload
CREATE POLICY "Users can upload their own files" ON storage.objects
FOR INSERT WITH CHECK (
  bucket_id = 'medical-docs' AND 
  auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can view their own files" ON storage.objects
FOR SELECT USING (
  bucket_id = 'medical-docs' AND 
  auth.uid()::text = (storage.foldername(name))[1]
);
```

### Issue: File upload progress not showing

**Symptoms:**
- Upload appears to hang
- No progress feedback to user

**Solution:**
```javascript
// Add progress tracking to your upload function
const uploadFile = async (file, onProgress) => {
  const filePath = `${user.id}/${Date.now()}_${file.name}`;
  
  const { data, error } = await supabase.storage
    .from('medical-docs')
    .upload(filePath, file, {
      cacheControl: '3600',
      upsert: false,
      onUploadProgress: (progress) => {
        const percent = (progress.loaded / progress.total) * 100;
        onProgress(percent);
      }
    });

  if (error) throw error;
  return data;
};
```

### Issue: Large file uploads timing out

**Symptoms:**
- Files over 5MB fail to upload
- "Request timeout" errors

**Solution:**
```javascript
// Implement chunked upload for large files
const uploadLargeFile = async (file) => {
  const CHUNK_SIZE = 1024 * 1024; // 1MB chunks
  
  if (file.size <= CHUNK_SIZE) {
    // Use normal upload for small files
    return await supabase.storage
      .from('medical-docs')
      .upload(filePath, file);
  }
  
  // For large files, consider using resumable uploads
  // or implement chunked upload logic
  throw new Error('Large file upload not yet implemented');
};
```

---

## 🗄️ Database Issues

### Issue: Database connection fails

**Symptoms:**
```bash
Error: connect ECONNREFUSED
Error: password authentication failed
Error: database "postgres" does not exist
```

**Solution:**
```bash
# 1. Check Supabase project status
# Go to Supabase Dashboard > Settings > Database

# 2. Verify connection string
# Check NEXT_PUBLIC_SUPABASE_URL is correct

# 3. Test connection in Supabase SQL Editor
SELECT 1;

# 4. Check database pooling settings
# In Supabase Dashboard > Settings > Database > Connection pooling
```

### Issue: Row Level Security (RLS) blocking queries

**Symptoms:**
- "permission denied for table" errors
- Queries return empty results
- 403 Forbidden errors

**Solution:**
```sql
-- Check RLS policies are correctly configured
-- In Supabase Dashboard > Authentication > Policies

-- Example: Allow users to access their own documents
CREATE POLICY "Users can access own documents" ON documents
FOR ALL USING (auth.uid() = user_id);

-- Enable RLS on the table
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

-- Test policy with sample query
SELECT * FROM documents WHERE user_id = auth.uid();
```

### Issue: Database migrations failing

**Symptoms:**
- Schema changes don't apply
- "relation already exists" errors
- Migration rollback failures

**Solution:**
```bash
# Check migration status
# In Supabase Dashboard > Database > Migrations

# For local development with Supabase CLI:
supabase migration list
supabase migration repair --status applied --version 20231201120000

# Manual fix if needed:
# Run migrations individually in SQL Editor
```

---

## 🔌 API Issues

### Issue: API routes returning 404 errors

**Symptoms:**
```bash
GET /api/documents -> 404 Not Found
POST /api/upload -> 404 Not Found
```

**Solution:**
```bash
# 1. Check file structure in app/api/
app/
├── api/
│   ├── documents/
│   │   └── route.ts
│   └── upload/
│       └── route.ts

# 2. Verify route handlers export correct methods
// app/api/documents/route.ts
export async function GET(request) {
  // GET handler
}

export async function POST(request) {
  // POST handler
}

# 3. Check for TypeScript errors
npm run type-check
```

### Issue: API calls returning 500 errors

**Symptoms:**
- Internal server errors
- "Something went wrong" messages
- No detailed error information

**Solution:**
```javascript
// Add proper error handling to API routes
export async function POST(request) {
  try {
    const body = await request.json();
    
    // Your API logic here
    const result = await processDocument(body);
    
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error('API Error:', error);
    
    return NextResponse.json(
      { 
        success: false, 
        error: error.message || 'Internal server error' 
      },
      { status: 500 }
    );
  }
}
```

### Issue: CORS errors in production

**Symptoms:**
```bash
Access to fetch at 'https://your-api.com' from origin 'https://your-app.com' has been blocked by CORS policy
```

**Solution:**
```javascript
// Add CORS headers to API routes
export async function OPTIONS(request) {
  return new Response(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}

// Or use middleware.ts
import { NextResponse } from 'next/server';

export function middleware(request) {
  const response = NextResponse.next();
  
  response.headers.set('Access-Control-Allow-Origin', '*');
  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  return response;
}
```

---

## 🚀 Deployment Issues

### Issue: Vercel build fails

**Symptoms:**
```bash
Error: Build failed
Type error: Cannot find module
Module not found: Can't resolve
```

**Solution:**
```bash
# 1. Check build locally first
npm run build

# 2. Common fixes:
# - Update tsconfig.json paths
# - Check all imports are correct
# - Verify all dependencies are in package.json

# 3. Check Vercel build logs
# Go to Vercel Dashboard > Project > Functions tab

# 4. Set correct Node.js version
# In package.json:
{
  "engines": {
    "node": "18.x"
  }
}
```

### Issue: Environment variables not available in production

**Symptoms:**
- Features work locally but not in production
- "undefined" values in production

**Solution:**
```bash
# 1. Check Vercel Dashboard > Project > Settings > Environment Variables

# 2. Verify variable names match exactly
# NEXT_PUBLIC_SUPABASE_URL (not NEXT_PUBLIC_SUPABASE_URL_PROD)

# 3. Redeploy after adding variables
# Variables only apply to new deployments

# 4. Check for typos in environment variable names
```

### Issue: Database connection fails in production

**Symptoms:**
- Local development works fine
- Production deployment can't connect to database

**Solution:**
```bash
# 1. Check production database URL
# Make sure it's the production Supabase project URL

# 2. Verify database is accessible
# Check Supabase project status

# 3. Check connection limits
# Free tier has connection limits

# 4. Enable connection pooling
# In Supabase Dashboard > Settings > Database > Connection pooling
```

---

## ⚡ Performance Issues

### Issue: Slow page load times

**Symptoms:**
- Pages take >3 seconds to load
- Poor Lighthouse scores
- Users complaining about performance

**Solution:**
```javascript
// 1. Implement proper loading states
const [loading, setLoading] = useState(false);

// 2. Add React.memo for expensive components
const ExpensiveComponent = React.memo(({ data }) => {
  // Component logic
});

// 3. Use Next.js Image optimization
import Image from 'next/image';

// 4. Implement code splitting
const DynamicComponent = dynamic(() => import('./Component'), {
  loading: () => <p>Loading...</p>,
});
```

### Issue: Database queries are slow

**Symptoms:**
- API responses take >2 seconds
- Database CPU usage high
- Timeout errors

**Solution:**
```sql
-- 1. Add indexes for commonly queried columns
CREATE INDEX documents_user_id_idx ON documents(user_id);
CREATE INDEX documents_created_at_idx ON documents(created_at);

-- 2. Optimize queries
-- Bad: SELECT * FROM documents WHERE user_id = 'xxx'
-- Good: SELECT id, filename, status FROM documents WHERE user_id = 'xxx' LIMIT 10

-- 3. Use query limits
SELECT * FROM documents 
WHERE user_id = auth.uid() 
ORDER BY created_at DESC 
LIMIT 20;
```

### Issue: Memory usage increasing over time

**Symptoms:**
- Application becomes slow after running for hours
- Memory usage continuously grows
- Out of memory errors

**Solution:**
```javascript
// 1. Clean up event listeners
useEffect(() => {
  const handleResize = () => {
    // Handle resize
  };
  
  window.addEventListener('resize', handleResize);
  
  return () => {
    window.removeEventListener('resize', handleResize);
  };
}, []);

// 2. Abort fetch requests on cleanup
useEffect(() => {
  const abortController = new AbortController();
  
  fetch('/api/data', {
    signal: abortController.signal
  });
  
  return () => {
    abortController.abort();
  };
}, []);

// 3. Use React.useMemo for expensive calculations
const expensiveValue = useMemo(() => {
  return performExpensiveCalculation(data);
}, [data]);
```

---

## 🆘 Getting Help

### Before Asking for Help

1. **Check this guide** - Search for your specific error message
2. **Check the logs** - Look at browser console, Vercel function logs, Supabase logs
3. **Try the solution locally** - Can you reproduce the issue in development?
4. **Check recent changes** - What changed since it was last working?

### Where to Get Help

- **GitHub Issues** - For bugs and feature requests
- **Supabase Discord** - For database and auth questions
- **Vercel Discord** - For deployment and performance questions
- **Stack Overflow** - For general Next.js and React questions

### Information to Include

When asking for help, include:
- Error messages (full stack trace)
- Steps to reproduce
- Environment (development/production)
- Browser and version
- Screenshots if relevant

---

## 🔄 Regular Maintenance

### Weekly Checks
- [ ] Review error logs in Vercel Dashboard
- [ ] Check database performance in Supabase Dashboard
- [ ] Monitor application performance
- [ ] Review user feedback

### Monthly Tasks
- [ ] Update dependencies: `npm update`
- [ ] Review and update environment variables
- [ ] Check backup and recovery procedures
- [ ] Review security settings

### Quarterly Reviews
- [ ] Performance audit and optimization
- [ ] Security review and updates
- [ ] Documentation review and updates
- [ ] Disaster recovery testing

---

*This troubleshooting guide is continuously updated based on common issues encountered. Last updated: July 2025*