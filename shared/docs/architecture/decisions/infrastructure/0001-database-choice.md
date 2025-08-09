# ADR 0001: Database, Storage, and Authentication Stack Choice

**Status:** Accepted  
**Date:** 2025-07-03  
**Owner:** Xavier Flanagan (solo developer)

## Context

Guardian needs a reliable, secure, and low-maintenance way to:

1. Store relational data (users, medical-document metadata, AI pipeline results).
2. Persist uploaded files (PDFs, images, structured exports).
3. Handle user authentication securely (email, OAuth, magic links).

The solution must:
- Work seamlessly with a Next.js app deployed on Vercel.
- Minimise DevOps/infra work for a solo developer.
- Offer HIPAA-friendly security primitives (row-level policies, ACLs).
- Start free/cheap, scale without re-architecting.

## Options Considered

| # | Option | Pros | Cons |
|---|--------|------|------|
| 1 | **Supabase** (Postgres + Auth + Storage) | One service does DB, Auth, Storage; Postgres roots; RLS; generous free tier; TypeScript SDK; UI dashboard | Slight vendor lock-in; storage bandwidth limits |
| 2 | **Neon + AWS S3 + Clerk/Auth.js** | Best-in-class pieces; unlimited S3 scale; branchable Postgres | Multiple dashboards/bills; IAM + presign endpoints to maintain; more code |
| 3 | **PlanetScale + S3 + Clerk** | Serverless MySQL; branch workflow | Same complexity as #2; MySQL not ideal for analytics |
| 4 | Self-hosted Postgres + MinIO + custom Auth | Full control | High operational burden; not viable solo |

## Decision

Choose **Supabase** for database, authentication, and file storage.

### Rationale

- **Time-to-feature**: Built-in auth & storage free up weeks of work.
- **Security**: Row-Level Security policies are first-class and GUI-driven.
- **Developer DX**: CLI, migrations, TypeScript types, generous free tier.
- **Scalability**: Underlying Postgres can be migrated if needed.
- **Community & docs**: Active ecosystem and examples for Next.js.

## Keep-the-Door-Open Plan

1. **Storage abstraction**  
   Implement a single `uploadFile()` helper. Internally start with Supabase Storage client. Interface can later swap to S3/R2.

2. **Auth abstraction**  
   Use Supabase Auth now, wrap calls in an `auth.ts` module so Clerk/NextAuth could replace later.

3. **SQL portability**  
   Stick to standard Postgres features; avoid Supabase-specific RPC edges.

4. **Routine exports**  
   Automate nightly `pg_dump` + Storage object export to S3 (Supabase provides).

5. **Monitoring lock-in**  
   Document all Supabase-specific features in this ADR so migration scope is clear.

## Consequences

- Faster MVP delivery, fewer moving parts.
- Monthly cost contained in one Supabase bill.
- If Guardian outgrows Supabase Storage bandwidth, we will migrate objects to S3 and point `uploadFile()` to new backend.

## Actions / Next Steps

1. Create Supabase project `guardian-prod`.
2. Add `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` to Vercel & `.env.local`.
3. Define tables (`users`, `documents`, `ocr_jobs`, etc.).
4. Configure RLS policies.
5. Create storage bucket `medical-docs`.
6. Follow **docs/guides/supabase-setup.md** for implementation details.

## Related Documents

- docs/guides/supabase-setup.md 