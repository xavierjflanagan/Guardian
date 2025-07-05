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
- [Describe the docs structure and how to use it]

--- 