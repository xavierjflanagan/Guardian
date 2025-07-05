# Architecture Overview

This document provides a high-level overview of the Guardian technical architecture, stack, and modular design.

---

## Tech Stack
- Frontend: Next.js (TypeScript), Tailwind CSS, shadcn/ui
- Backend: Supabase (Postgres), Supabase Auth, Supabase Storage (S3-compatible)
- AI Orchestration: LangGraph / LlamaIndex (planned for GCP Functions)
- Deployment: Vercel

## System Diagram
- [Insert or link to system diagram here]

## Modularity & Scalability
- Stateless microservices, pluggable endpoints, vendor-agnostic data layer
- Designed for solo-dev velocity, minimal DevOps

## Security & Compliance
- RLS policies, HIPAA/GDPR considerations, see SECURITY_COMPLIANCE.md

## Further Details
- [MVP Prototype](./prototype.md)
- [Long-Term Vision](./vision.md) 