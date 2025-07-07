# Guardian Project Overview

**Purpose:** High-level summary of the Guardian project, its vision, mission, goals, and navigation to all major documentation sections.
**Last updated:** July 2025
**Audience:** New developers, business stakeholders, contributors
**Prerequisites:** None

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

For a more detailed explanation, see the [Architecture Overview](../architecture/system-design.md) and the [Document Processing Pipeline](../architecture/data-pipeline.md).

---

## Current Status

The project is under active development. For a detailed log of recent activities, please see the [Progress Log](../PROGRESS_LOG.md).

---

## Quick Links
- [Roadmap](../project/roadmap.md)
- [Progress Log](../PROGRESS_LOG.md)
- [MVP Prototype](../architecture/prototype.md)
- [Long-Term Vision](../architecture/vision.md)
- [Architecture Overview](../architecture/system-design.md)
- [Core Functionality](../architecture/CORE_FUNCTIONALITY.md)
- [Security & Compliance](../architecture/security-compliance.md)
- [Decision Records](../architecture/adr/)
- [Guides](../guides/)
- [Management](../management/)
- [Business](../business/)

---

## How to Use This Documentation

**For New Developers:**
1. Start with [README.md](../README.md) for navigation
2. Follow [Developer Setup Guide](../guides/developer-setup.md)
3. Review [Architecture Overview](../architecture/system-design.md)
4. Check [Current Tasks](../management/TASKS.md) for priorities

**For Business Stakeholders:**
1. Read this overview document
2. Review [Roadmap](../project/roadmap.md) for timeline
3. Check [Business Model](../business/model.md) for strategy
4. See [Progress Log](../PROGRESS_LOG.md) for recent updates

**For Contributors:**
1. Review [Current Tasks](../management/TASKS.md) for priorities
2. Check [Progress Log](../PROGRESS_LOG.md) for context
3. Read relevant [Decision Records](../architecture/adr/)
4. Update [AI Context](../context/AI_context.md) after sessions

---

## Code Quality and AI Collaboration Policy

> **Standard of Excellence:**
> All code, whether written by AI or human contributors, should reflect the wisdom, experience, and best practices of a team of senior software engineers. Every decision should be made thoughtfully, with maintainability, scalability, and clarity in mind, as if the codebase were built by an amazing, highly experienced team.

### Core Principles

#### Clarity and Simplicity
- Write code that is easy to understand. Prioritize readability over cleverness.
- Add comments only when necessary to explain *why* a particular piece of code exists, not *what* it does.

#### File and Directory Organization
- Maintain the existing Next.js project structure.
- Create new files and directories in a logical and organized manner.
- Before creating a new file, review the existing file structure to see if the new code belongs in an existing file.
- **`lib/` (Library):** Use for more substantial, application-specific logic or integrations (e.g., database functions, API client wrappers, authentication logic).
- **`utils/` (Utilities):** Use for smaller, generic, and often pure helper functions (e.g., date formatting, string manipulation, validation).

#### Don't Repeat Yourself (DRY)
- Avoid duplicating code. Instead, create reusable components, functions, or classes.
- Before writing new code, check if similar functionality already exists that can be reused or generalized.

#### Regular Refactoring
- Periodically, development should pause to review and refactor the codebase.
- Refactoring includes removing unused code, simplifying complex logic, and improving the overall structure of the code.
- This ensures the project remains maintainable as it grows.

#### Descriptive Naming
- Use clear and descriptive names for files, folders, variables, functions, and components.
- Names should reflect the purpose of the code they represent. For example, a function that gets user data should be named `getUserData()`.

#### Commit Message Standards
- Write clear and concise commit messages.
- A good commit message should summarize the change and its purpose.