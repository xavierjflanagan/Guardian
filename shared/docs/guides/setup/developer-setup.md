# Developer Setup Guide

**Purpose:** Walks you through setting up Guardian for local development.
**Last updated:** July 2025
**Audience:** Developers, contributors
**Prerequisites:** Node.js 18–20, pnpm (via Corepack), Supabase account, Vercel account

---

## Steps
1. Clone the repository
2. Enable pnpm via Corepack and install dependencies from repo root:
   ```bash
   corepack enable
   corepack prepare pnpm@9.15.1 --activate
   pnpm install
   ```
3. Set up Supabase: [See Supabase Setup Guide](./supabase-setup.md)
4. Configure environment variables (see .env.example)
5. Start the web app dev server:
   ```bash
   pnpm --filter @guardian/web run dev
   ```
6. Access the app at `http://localhost:3000`

## Additional Resources
- [Project Overview](../getting-started/overview.md)
- [Architecture](../architecture/system-design.md)
- [Progress Log](../PROGRESS_LOG.md)
- [Task Board](../management/TASKS.md) 