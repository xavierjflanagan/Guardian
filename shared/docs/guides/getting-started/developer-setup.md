# Developer Setup Guide (PNPM)

Follow these steps to set up the Guardian monorepo for local development using pnpm.

## Prerequisites
- Node.js 18–20
- Git

## Steps
1. Clone the repository
2. Enable pnpm via Corepack and install dependencies from repo root:
   ```bash
   corepack enable
   corepack prepare pnpm@9.15.1 --activate
   pnpm install
   ```
3. Set up Supabase: see `shared/docs/guides/setup/supabase-setup.md`
4. Configure environment variables (see `.env.example`)
5. Start the web app dev server:
   ```bash
   pnpm --filter @guardian/web run dev
   ```
6. Access the app at `http://localhost:3000`

## Notes
- The monorepo uses `pnpm-workspace.yaml` as the source of truth for workspaces.
- CI/CD uses pnpm with `--frozen-lockfile` for deterministic installs.

