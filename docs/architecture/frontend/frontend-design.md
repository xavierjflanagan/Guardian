
# Guardian Frontend Design & Architecture

**Status:** Active
**Date:** 2025-07-22
**Author:** Gemini & Team Synthesis

## 1. Overview

This document serves as the canonical source of truth for the Guardian application's frontend design, user experience (UX), and component architecture. Its purpose is to guide development, ensuring that all frontend work aligns with a single, coherent vision.

## 2. Core User Experience Philosophy

The Guardian dashboard must empower patients by transforming their scattered, complex medical documents into a single, unified, and understandable health profile. The experience is defined by two key views:

1.  **The Main Dashboard (Patient-Centric View):** A single-pane-of-glass summary of the user's complete health status, aggregated from all processed documents. This is the primary view of the application.
2.  **The Document Explorer (Document-Centric View):** A secondary view focused on auditing and verification, allowing a user to select a specific document and see exactly what information was extracted from it.

This dual-view approach provides both a high-level, actionable summary and a low-level, verifiable data source, building user trust and confidence in the AI-powered system.

## 3. Page Architecture

### 3.1. The Main Dashboard (`/`)

This is the default page for authenticated users. It provides the **Patient-Centric** view.

**Vision:** A user logs in and immediately sees a comprehensive, up-to-date summary of their health. The data is aggregated from all their documents, de-duplicated, and presented in a clean, intuitive interface.

**Key Components:**

*   **Unified Medications List:** A single list of all current medications, compiled from multiple prescriptions and doctor's notes. Each entry must still have a clickable source link pointing to the origin document(s).
*   **Comprehensive Allergy Panel:** A critical, always-visible list of all known allergies.
*   **Conditions Timeline:** A historical view of all diagnosed medical conditions.
*   **Lab Results Tracker:** A view that aggregates lab results over time, allowing for trend analysis (e.g., charting cholesterol levels from multiple tests).
*   **Upload Component:** A floating action button or a dedicated section to allow users to easily upload new documents to contribute to their profile.

**Backend Implication:** This view CANNOT be built directly from the "messy" JSONB data in its current form. It requires a "Normalizer" service on the backend to process the raw AI output into a clean, aggregated, and de-duplicated relational database schema.

### 3.2. The Document Explorer (`/explorer`)

This page provides the **Document-Centric** view.

**Vision:** A user wants to verify where a piece of information came from or see the context of a specific file. They navigate here to see a master-detail view.

**Key Components:**

*   **Document Management Panel (Left Sidebar):**
    *   A prominent file upload component.
    *   A scrollable list of all uploaded documents, showing filename, upload date, and processing status (`processing`, `completed`, `failed`).
    *   Error logs are displayed for failed documents.
*   **Extracted Information Panel (Main Content Area):**
    *   When a user clicks a "completed" document from the list, this panel displays the formatted medical data extracted *only* from that single document.
    *   This view directly reflects the structure of the `medical_data` JSONB object for the selected document.

## 4. Design Principles & UI Requirements

*   **Clarity Over Density:** The user should never feel overwhelmed. Use whitespace, clear typography, and progressive disclosure to present information.
*   **Trust Through Transparency:** Every single piece of data on the Main Dashboard must be traceable to its source. A user must be able to click on any data point (e.g., "Lisinopril 10mg") and see a pop-up or link indicating it came from "Dr. Smith's Visit Summary - July 15, 2024.pdf".
*   **Confidence is Key:** The AI's confidence score for any extracted data point must be visually represented, using the Green/Yellow/Red system. Low-confidence data should be clearly flagged as "Needs Review".
*   **Accessibility First:** The application must be fully compliant with WCAG 2.1 AA standards.

## 5. Development Strategy & Staging

**Phase 1 (POC - July 31 Deadline):**

1.  **Build the Document Explorer:** We will build the Document Explorer page first. This is because its data view maps directly to the current backend architecture (`medical_data` JSONB field). This is achievable within the deadline.
2.  **Use the Revised Bolt Prompt:** The `bolt-prompt-medical-dashboard-by-gemini.md` is designed to build exactly this Document Explorer page.
3.  **Result:** By July 31, we will have a functional application that proves the core value proposition: users can upload documents, see them processed by AI, and view the extracted, verifiable results for each document.

**Phase 2 (Post-POC):**

1.  **Build the Backend Normalizer:** Develop the service that takes the raw JSONB data and populates a clean, relational database.
2.  **Build the Main Dashboard:** With the clean data available, build the true, patient-centric Main Dashboard.
3.  **Set as Default:** Make the new Main Dashboard the default landing page for users.

This phased approach allows us to deliver a valuable, functional, and impressive POC on time, while setting the stage for the full, aggregated product vision.
