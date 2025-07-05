# Guardian Project Overview

Welcome to the Guardian documentation hub. This file provides a high-level summary of the project, its vision, mission, goals, and links to all major documentation sections.

---

## Getting Started

If you're new to the project, the best place to start is the [Developer Setup Guide](./guides/SETUP.md). It will walk you through cloning the repository, installing dependencies, and getting the application running locally.

---

## Vision & Mission
- Empower individuals to take meaningful control of their healthcare data by providing a **secure, patient-owned, centralized health platform** that enables **seamless access, portability, and meaningful insights** into their medical history. Through increased access and understanding, patients will be equipped to take a more active role in their healthcare.
- "Take control of your health. Guardian puts your medical data in your hands, giving you instant access, security, and the power to decide who sees it. Wherever you go, whatever happens, you're in control. Your health, your rules."
- Guardian exists to solve one of the most critical problems in modern healthcare: **fragmented, inaccessible, and siloed medical data**. Our platform is built on the foundation that **patients, not institutions, should own and manage their health information**—ensuring that data flows freely when needed while remaining **secure, private, and patient-centric**.

## Purpose
- By making health data **accessible, portable, and actionable**, Guardian will drive efficiency in healthcare, reducing administrative burdens, eliminating redundancies, and ultimately leading to **better health outcomes at a lower cost** for individuals and healthcare systems alike.

## Project Goals
- Shift data ownership into the hands of the patient.
- Define and track success metrics (e.g., patient engagement, data accessibility, satisfaction scores).
- Design for scalability and modularity to support future integrations (prescription management, appointment bookings, multi-language support).
- Ensure HIPAA, GDPR, and regional regulatory compliance at every layer.

---

## Key Architectural Principles

Our architecture is designed to be modular, scalable, and maintainable. The core principles are:

- **Pluggable "document-processor" endpoint:** Allows for easy swapping of backend compute services.
- **Stateless micro-steps:** Each part of the AI pipeline performs a single, focused task.
- **Vendor-agnostic data layer:** Built on Postgres to avoid vendor lock-in.
- **Solo-dev friendly:** Minimal DevOps and pay-per-use pricing.

For a more detailed explanation, see the [Architecture Overview](./architecture/OVERVIEW.md) and the [Document Processing Pipeline](./architecture/pipeline.md) design.

---

## Current Status

The project is under active development. For a detailed log of recent activities, please see the [Progress Log](./PROGRESS_LOG.md).

---

## Quick Links
- [Roadmap](./ROADMAP.md)
- [Progress Log](./PROGRESS_LOG.md)
- [MVP Prototype](./architecture/prototype.md)
- [Long-Term Vision](./architecture/vision.md)
- [Architecture Overview](./architecture/OVERVIEW.md)
- [Core Functionality](./architecture/CORE_FUNCTIONALITY.md)
- [Security & Compliance](./architecture/SECURITY_COMPLIANCE.md)
- [Decisions/ADRs](./decisions/)
- [Guides](./guides/)
- [Management](./management/)
- [Business](./business/)

---

## Project Structure

The documentation is organized into logical sections to help different audiences find what they need:

### 📁 Directory Structure
```
docs/
├── README.md                    # Main entry point and navigation
├── PROJECT_OVERVIEW.md          # This file - project summary
├── ROADMAP.md                   # Development timeline
├── PROGRESS_LOG.md              # Session-by-session progress
├── architecture/                # Technical architecture
│   ├── OVERVIEW.md             # System design overview
│   ├── pipeline.md             # AI processing pipeline
│   ├── prototype.md            # MVP scope and design
│   ├── vision.md               # Long-term technical vision
│   ├── CORE_FUNCTIONALITY.md   # Key features
│   └── SECURITY_COMPLIANCE.md  # Security requirements
├── guides/                      # Setup and development guides
│   ├── SETUP.md               # Developer setup instructions
│   └── supabase-setup.md      # Database and auth setup
├── decisions/                   # Architecture Decision Records
│   └── 0001-supabase-vs-neon.md # Stack decision rationale
├── business/                    # Business context
│   ├── MODEL.md               # Revenue and partnerships
│   └── BRAND.md               # Brand and marketing
├── management/                  # Project management
│   ├── TASKS.md               # Current task board
│   └── MEETING_LOG.md         # Meeting notes
├── context/                     # AI development context
│   └── AI_context.md          # Session history and decisions
└── archive/                     # Historical information
    ├── edge_function_context.md # Previous implementation context
    └── chatgpt_response.txt     # Early planning discussions
```

### 🎯 How to Use This Documentation

**For New Developers:**
1. Start with [README.md](./README.md) for navigation
2. Follow [Developer Setup Guide](./guides/SETUP.md) 
3. Review [Architecture Overview](./architecture/OVERVIEW.md)
4. Check [Current Tasks](./management/TASKS.md) for priorities

**For Business Stakeholders:**
1. Read this overview document
2. Review [Roadmap](./ROADMAP.md) for timeline
3. Check [Business Model](./business/MODEL.md) for strategy
4. See [Progress Log](./PROGRESS_LOG.md) for recent updates

**For Contributors:**
1. Review [Current Tasks](./management/TASKS.md) for priorities
2. Check [Progress Log](./PROGRESS_LOG.md) for context
3. Read relevant [Architecture Decision Records](./decisions/)
4. Update [AI Context](./context/AI_context.md) after sessions

--- 