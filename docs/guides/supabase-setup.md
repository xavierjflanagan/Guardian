# Supabase Setup & Integration Guide

**Goal:** Stand up Supabase for Guardian and wire it into the Next.js code-base.

---

## 1. Create the Supabase Project

1. Log in to https://app.supabase.com  
2. Click **New Project** → choose organisation.  
3. Enter a name (`guardian-prod`), strong db password, nearest region.  
4. Wait for the project to provision.

---

## 2. Grab Environment Variables

From **Project Settings → API** copy:

```
NEXT_PUBLIC_SUPABASE_URL=https://xyzcompany.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...   # server-side only
```

Add them to:

- `.env.local` for local dev
- Vercel dashboard → Environment variables

---

## 3. Install Client and Types

```bash
cd guardian-web
npm install @supabase/supabase-js
npm install -D @supabase/cli
npx supabase login   # opens browser
```

Generate type-safe db types (optional):

```bash
npx supabase gen types typescript --project-id your-id > supabase.types.ts
```

---

## 4. Initialise Supabase Client (Frontend & Backend)

`guardian-web/lib/supabaseClient.ts`:

```ts
import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);
```

Server-side helpers can use `SUPABASE_SERVICE_ROLE_KEY` for elevated privileges.

---

## 5. Define Database Schema

Use the Supabase SQL Editor or `supabase/migrations`:

```sql
create table documents (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users on delete cascade,
  s3_key text not null,
  original_name text,
  mime_type text,
  status text default 'uploaded',
  created_at timestamptz default now()
);
```

Row-Level Security:

```sql
alter table documents enable row level security;
create policy "user can read own docs"
  on documents for select using ( auth.uid() = user_id );
```

---

## 6. Storage Bucket

1. In Dashboard → **Storage** → **Create Bucket** `medical-docs` (public = false).  
2. Add policy to allow the owner read/write.

---

## 7. File Upload Helper

`guardian-web/utils/uploadFile.ts`:

```ts
import { supabase } from "@/lib/supabaseClient";

export async function uploadFile(file: File, userId: string) {
  const filePath = `${Date.now()}_${file.name}`;
  const { error } = await supabase.storage
    .from("medical-docs")
    .upload(filePath, file, { contentType: file.type });
  if (error) throw error;
  return filePath;
}
```

---

## 8. Authentication Flows

```ts
const { data, error } = await supabase.auth.signInWithOtp({ email });
```

Protect API routes:

```ts
import { supabase } from "@/lib/supabaseAdmin";

const { data: { user } } = await supabase.auth.getUser(token);
if (!user) return new Response("Unauthorized", { status: 401 });
```

---

## 9. Local Development

```bash
npx supabase start
```

Runs Postgres + storage emulator + auth locally on ports 54322, ….

---

## 10. Deployment Notes

- Supabase edge function (if used) can call back into Guardian via webhook.  
- Backups and point-in-time recovery can be toggled in **Database Backups**.

---

Happy building! For questions, see the `#supabase` channel or ADR-0001. 