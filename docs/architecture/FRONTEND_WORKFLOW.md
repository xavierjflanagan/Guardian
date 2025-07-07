# Guardian — Front-End Generation & Source-of-Truth Workflow (July 2025)

**Purpose:** Describes the frontend code generation, review, and deployment workflow for Guardian.
**Last updated:** July 2025
**Audience:** Developers, contributors
**Prerequisites:** Familiarity with frontend development and Git workflows

---

## 1 · Primary Repo & Deployment
- **GitHub + Vercel (Next.js/Supabase)** = single source of truth  
- Protect `main` with PR-only merges; run lint + OWASP scans on every pull request

## 2 · Code-Generator Roles

| Tool | Use-Case | Export Model | When to Turn It Off |
|------|----------|--------------|---------------------|
| **Vercel v0** | One-shot scaffolding of React + shadcn/Tailwind components | “Add to Codebase” → local files → commit | After component lands in repo |
| **Bolt** | Hour-long spikes / workflow glue (StackBlitz) | GitHub sync **or** ZIP download | Once prototype is merged; close project to stop token burn |
| **Lovable** | Non-dev teammates mock dashboards / CRUD apps | Auto-push to linked GitHub repo (two-way) | After feature stabilises; detach or archive to cut noise |

## 3 · Daily Dev Environment
- **Cursor** IDE → chat + refactor Edge Functions, SQL, React
- **Warp** terminal → AI-assisted CLI (deploy Supabase, tail logs, etc.)

## 4 · Practical Flow

1. **Scaffold UI in v0** → commit to `ui/` branch → PR review  
2. **Prototype in Bolt** → export → merge to `spike/<feature>` → refactor locally  
3. **Let designers use Lovable** → review PRs → cherry-pick stable parts  
4. Refine & test in **Cursor/Warp** → squash & merge to `main` → Vercel deploy

## 5 · Compliance Checklist (each merge)

- Strip sample PHI / secrets from generated code  
- Run OWASP/Zap baseline, `npm audit`, `npm run lint`  
- Confirm Supabase storage rules & Vercel env vars never leak

> **TL;DR** Generate fast (v0 / Bolt / Lovable) → export to Git → refactor in Cursor → deploy via Vercel. Always treat AI output like normal code: review, test, secure.