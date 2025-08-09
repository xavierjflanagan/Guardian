# Architecture Decision Records (ADRs)

**All Guardian architectural decisions in one searchable location.**

---

## 📋 **What are ADRs?**

Architecture Decision Records capture important architectural decisions made during Guardian's development, including context, options considered, and rationale.

---

## 🏗️ **Infrastructure Decisions**

Core infrastructure and deployment architecture:

- **[0001 Database Choice](infrastructure/0001-database-choice.md)** - Supabase vs Neon selection
- **[0002 Hybrid Infrastructure](infrastructure/0002-hybrid-infrastructure.md)** - Supabase + Render.com approach

---

## 🔄 **Pipeline Decisions**

Document processing pipeline architecture (collaborative AI analysis):

- **[0002 Gemini Strategy](pipeline/0002-gemini-strategy.md)** - Gemini's pipeline approach
- **[0003 Claude Strategy](pipeline/0003-claude-strategy.md)** - Claude's pipeline approach  
- **[0004 Gemini Rebuttal](pipeline/0004-gemini-rebuttal.md)** - Gemini's response to Claude
- **[0005 Claude Counter](pipeline/0005-claude-counter.md)** - Claude's counter-response
- **[0006 Final Recommendation](pipeline/0006-final-recommendation.md)** - Synthesis and final decision
- **[0007 Claude Synthesis](pipeline/0007-claude-synthesis.md)** - Strategic synthesis

---

## 🎨 **Frontend Decisions**

Frontend architecture and development workflow:

- **[0008 AI Workflow](frontend/0008-ai-workflow.md)** - AI-assisted frontend development workflow

---

## 📝 **ADR Format**

Each ADR follows a consistent format:
- **Status**: Proposed, Accepted, Superseded
- **Context**: What's the issue we're solving?
- **Decision**: What's the change we're making?
- **Consequences**: What becomes easier or more difficult?

---

## 🔍 **Finding ADRs**

- **Browse by category** using the sections above
- **Search by number** (e.g., ADR-0001)
- **Search by topic** using your editor's search functionality

---

*ADRs are immutable records. If a decision changes, create a new ADR that supersedes the old one.*