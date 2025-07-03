
# Gemini CLI Project Context: Guardian AI

This document provides a persistent context for the Gemini CLI to maintain project state and history across sessions.

## 1. Project Goal

The primary goal is to build a functioning prototype of "Guardian," an AI-powered healthcare application. The application will allow users to upload their medical records (like PDFs) and use AI to analyze, understand, and manage their health data. The end product should have a "wow-factor" UX.

## 2. Chosen Tech Stack

- **Frontend:** Next.js 14 with TypeScript
- **Styling:** Tailwind CSS with shadcn/ui
- **Deployment:** Vercel
- **Authentication:** Clerk
- **Database:** Neon (Serverless Postgres)
- **File Storage:** Cloudflare R2 (S3-compatible)
- **AI Orchestration:** LangGraph / LlamaIndex (to be implemented in GCP Functions)

## 3. Current Status (As of 2025-07-03)

- **Repository:** The local Git repository has been cleaned and reset. The problematic commit history containing oversized files has been removed.
- **`.gitignore`:** A comprehensive `.gitignore` file has been created at the project root to exclude `node_modules`, `.next`, `.env.local`, and other unnecessary files.
- **GitHub:** The local repository has been successfully force-pushed to a new, clean `Guardian` repository on GitHub, resolving the authentication and large-file issues.
- **File Architecture:** A new, scalable directory structure has been implemented within the `guardian-web` application:
    - `components/ui` and `components/shared` for UI elements.
    - `lib/` and `utils/` for shared logic and helpers.
    - `app/(auth)` and `app/(main)` route groups to separate authentication and main application pages.
    - Basic sign-in and sign-up pages have been created using Clerk components.
- **Documentation:** A `README.md` has been created with a project overview, setup instructions, and a high-level to-do list.

## 4. Next Immediate Step

The next task is to implement the authentication logic by configuring the Clerk middleware in the `guardian-web/middleware.ts` file to protect application routes and manage user sessions.
