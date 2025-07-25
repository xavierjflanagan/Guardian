# Guardian Unified Data Architecture & Lifecycle Strategy

**Status:** Finalized
**Date:** 2025-07-25
**Authors:** Gemini (Primary Author), with contributions from Claude, O3, and Xavier Flanagan.
**Supersedes:** This document synthesizes all previous data strategy proposals and serves as the canonical blueprint for database and data lifecycle implementation.

---

## 1. Executive Summary

This document outlines the definitive data architecture for the Guardian platform. Through a collaborative process of proposal and critical review, we have forged a hybrid strategy that combines the performance of traditional relational design with the flexibility of modern data modeling. The architecture is built on a foundation of immutable data, deep provenance, and clinically-aware lifecycle management.

This strategy directly enables our core user-facing goals: providing a unified and trustworthy health dashboard where every piece of data is traceable to its source, contextually linked, and managed with an understanding of its real-world temporal nature.

## 2. Core Architectural Principles

*   **Immutable History:** No data is ever deleted or directly overwritten. The database is designed as a complete, auditable historical record.
*   **Clinically-Aware Lifecycle:** The system understands that medical data evolves. It uses a sophisticated, rule-based engine to manage the status of data (e.g., active, resolved, superseded) rather than relying on simplistic logic.
*   **Deep, Multi-Layered Provenance:** Every clinical fact is traceable not just to its source document, but to its precise location on the page and the specific AI process that extracted it.
*   **Separation of Concerns:** The architecture cleanly separates clinical data, source metadata, and relational links into dedicated, optimized structures.

---

## 3. Database Schema: A Multi-Table Relational Model

**Decision:** We will implement a relational schema with multiple, type-specific tables (e.g., `patient_medications`, `patient_allergies`).

**Rationale:** After considering a single "ledger" table, we concluded that the multi-table approach is superior for Guardian's needs. It's like a well-organized filing cabinet with separate, clearly labeled folders for each data type. This provides:
*   **Data Integrity:** We can enforce that a `patient_medications` record *must* have a dosage, a rule that doesn't apply to allergies. This prevents data corruption.
*   **Performance:** Querying a smaller, specific table is dramatically faster than searching a single giant one.
*   **Clarity & Maintainability:** The schema is easy for developers to understand and work with, reducing the risk of bugs.

### 3.1. Uncategorized Data Handling

**Decision:** A dedicated `unclassified_data` table will be created.

**Rationale:** To address the scenario where the AI extracts data that doesn't fit a predefined category, this table acts as a safe holding pen. It prevents data loss and allows for human or future-AI review, without granting the AI dangerous permissions to alter the database structure on the fly.

---

## 4. Data Lifecycle: The Guardian Rule Engine

**Decision:** We will manage temporal state using `valid_from` and `valid_to` columns in each clinical table, governed by a sophisticated, type-specific rule engine.

**Rationale:** A simple approach of superseding data based on its absence in new documents is clinically naive and dangerous. A patient's full history is crucial. Therefore, our system will adhere to a core principle: **absence of evidence is not evidence of absence.** The `valid_to` date will only be set when there is explicit new information.

*   **Rule Examples:**
    *   **Allergies/Chronic Conditions:** Are considered permanent unless a document explicitly states they are resolved or disproven.
    *   **Medications:** The lifecycle is more dynamic. The `valid_to` date can be set by the AI if it extracts an explicit duration (e.g., "take for 7 days"). If a medication is absent from a new, trusted list, it will be flagged for review, not automatically retired.
*   **`valid_from` Logic:** This date is determined using a clear hierarchy: 1) An explicit date in the text, 2) The date of the source document, or 3) The upload date.

---

## 5. Provenance: A Multi-Layered Source Model

**Decision:** We will adopt O3's proposed model of two dedicated tables: `document_representations` and `clinical_fact_sources`.

**Rationale:** This provides the most robust and scalable solution for provenance. It correctly models the reality that a single source document can have multiple "representations" (image, OCR text, AI JSON), and these representations can be linked to multiple clinical "facts." This clean separation is superior to storing source metadata directly in the clinical tables.

---

## 6. Relationship Modeling: A Flexible Link Table

**Decision:** We will adopt Claude's proposal for a single, generic `medical_data_relationships` table.

**Rationale:** While my initial proposal was to use a JSONB column for relationships, this would create a major performance bottleneck, as it cannot be efficiently indexed. A dedicated link table, as proposed by Claude and O3, is the correct approach. We chose Claude's generic model because of its flexibility. It allows us to link any data point to any other (e.g., a lab result to a condition) without needing to create new tables, effectively building a powerful knowledge graph of the patient's health.

---

## 7. Data Unit Normalization: The "Store Both" Approach

**Decision:** For any data with units of measurement, we will store both the original extracted value/unit and a normalized value in a standard scientific unit (SI).

**Rationale:** This is another critical requirement for data integrity and usability. This approach allows us to perform accurate, standardized comparisons (e.g., graphing lab results from different labs over time) while preserving the original source data perfectly for provenance. A `user_settings` table will allow users to choose their preferred display units (e.g., Imperial vs. Metric), giving us backend integrity and frontend flexibility.
