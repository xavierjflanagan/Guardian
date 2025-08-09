# Guardian Unified Data Architecture & Lifecycle Strategy

**Status:** Finalized & Reviewed
**Date:** 2025-07-25
**Authors:** Gemini (Primary Author), with contributions from Claude, O3, and Xavier Flanagan.

---

## 1. Executive Summary

This document outlines the definitive data architecture for the Guardian platform. Through a collaborative process of proposal and critical review, we have forged a hybrid strategy that combines the performance of traditional relational design with the flexibility of modern data modeling. The architecture is built on a foundation of immutable data, deep provenance, and clinically-aware lifecycle management.

This strategy directly enables our core user-facing goals: providing a unified and trustworthy health dashboard where every piece of data is traceable to its source, contextually linked, and managed with an understanding of its real-world temporal nature.

---

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

### 3.2. Medication Data Model: Patient History vs. Canonical Library

**Decision:** To provide rich filtering and querying capabilities (e.g., by medication class), we will use a two-table approach for medications.

**Rationale:** Patient documents often contain incomplete or colloquial medication names. Relying solely on extracted text would make it impossible to reliably categorize or query medications. By linking patient data to a canonical library, we can provide powerful features like filtering by class (e.g., "Statins") or prescription type.

1.  **`medications_master` (Canonical Library):** A pre-populated, static table containing detailed, non-patient-specific information. This table will be sourced from a trusted external drug database (e.g., RxNorm).
    *   `id`: Primary Key
    *   `generic_name`: The standardized generic name (e.g., "Atorvastatin").
    *   `brand_names`: An array of known brand names (e.g., `['Lipitor']`).
    *   `medication_class`: The drug's therapeutic class (e.g., "Statin").
    *   `is_prescription`: Boolean.
    *   `source`: The source of the canonical data (e.g., 'RxNorm').

2.  **`patient_medications` (Patient-Specific History):** This table records every instance of a medication a patient has taken.
    *   `id`: Primary Key
    *   `patient_id`: Foreign Key to the `patients` table.
    *   **`medication_id`** (Foreign Key to the `medications_master` table)
    *   `dosage`, `frequency`, `route`: Patient-specific details from the source document.
    *   `status`: e.g., 'active', 'inactive', 'ceased'.
    *   `valid_from`, `valid_to`: The time period this specific instance of the medication is considered active.
    *   `source_id`: Foreign Key to the `clinical_fact_sources` table for provenance.

---

## 4. Data Lifecycle: The Guardian Rule Engine

**Decision:** We will manage temporal state using `valid_from` and `valid_to` columns in each clinical table, governed by a sophisticated, type-specific rule engine.

**Rationale:** A simple approach of superseding data based on its absence in new documents is clinically naive and dangerous. A patient's full history is crucial. Therefore, our system will adhere to a core principle: **absence of evidence is not evidence of absence.** The `valid_to` date will only be set when there is explicit new information.

### 4.1. Handling Complex Scenarios: Re-commenced Medications

The data model is designed to handle real-world clinical histories, such as a patient stopping and later re-starting the same medication.

*   **How it Works:** This scenario will result in two distinct rows in the `patient_medications` table, each with its own `valid_from` and `valid_to` dates. For example:
    1.  `name: 'Lisinopril', valid_from: '2020-01-15', valid_to: '2022-03-01'`
    2.  `name: 'Lisinopril', valid_from: '2024-06-10', valid_to: NULL`
*   **Frontend Presentation:** The backend provides the raw, accurate history. The frontend application is responsible for intelligently aggregating this data for display. It will not show two separate "Lisinopril" entries. Instead, it will present a consolidated view, such as: **Lisinopril** (Jan 2020 - Mar 2022, Jun 2024 - Present).

### 4.2. Handling Ambiguity: `valid_from` Logic

**Decision:** The `valid_from` date is critical for context. When not explicitly stated in the source text, its value will be determined by a strict hierarchy.

1.  **Explicit Date:** The date is clearly mentioned in the source text ("patient was diagnosed on Jan 5, 2021").
2.  **Document Date:** If no explicit date exists, the creation date of the source document is used.
3.  **Upload Date:** If the document itself is undated, the system will use the date it was uploaded to Guardian.

To ensure this ambiguity is not hidden from the user, a `valid_from_precision` column will be added to clinical tables. This allows the UI to display more accurate context, such as "Condition present *since at least* [Document Date]".

---

## 5. The Data Processing Pipeline: From Raw Text to Structured Data

**Question:** How does raw, unstructured text from a document get converted into the clean, relational data described above?

**Answer:** This is handled by a multi-step pipeline that separates AI-powered extraction from deterministic data mapping. This is a standard and robust approach (often called ETL) that ensures reliability and maintainability.

1.  **Extraction (AI):** The raw document (e.g., PDF, image) is sent to a powerful AI model (LLM). The model is given a specific prompt instructing it to read the document and extract all clinical information into a structured JSON format. This includes identifying relationships between data points (e.g., this lab result was ordered to monitor that condition).
2.  **Normalization (Code):** The JSON output from the AI is then passed to a deterministic service (e.g., a cloud function named `document-normalizer`). **This service is not an AI.** It is a piece of code that acts as a "mapper". It contains explicit rules to parse the JSON and load the data into the correct database tables.
    *   It validates the incoming data (e.g., checks for required fields).
    *   It looks up canonical entities (e.g., finds the correct entry in `medications_master`).
    *   It inserts the data into the appropriate tables (`patient_medications`, `patient_allergies`, etc.).
    *   It creates the links in the `medical_data_relationships` table.
3.  **Human-in-the-Loop (Verification):** The system is designed to recognize when the AI is not confident about a piece of data. This is crucial for clinical safety.

---

## 6. Data Unit Normalization & Confidence Scoring

**Question:** How does the system cope for the data unit noramlization step, where context may be needed to know what unit the extracted data is referring to; lets take DOB for example, depending on the geographical context, we dont know if its dd/mm/yyyy or mm/dd/yyyy? another example is how will the system cope if a doctors letter references a a1c as 6 but doesnt provide units because in that country they only use one, or back in the 90s the units were different? will the AI work it out and take into account that context? I assume we will need confidence interval metadata attached to this to help manage these scenarios?

**Answer:** This is a critical challenge that is addressed at multiple points in the pipeline.

*   **AI-Powered Context:** The extractor AI is prompted to use the entire document's context to resolve ambiguity. For example, it can use the address on a letterhead to infer the likely date format. This is a key advantage of using a powerful LLM for the extraction step.
*   **Store Both Original and Normalized:** For any value with a unit, we will store both the original value as extracted (`original_value`, `original_unit`) and a standardized version (`normalized_value`, `normalized_unit`). This preserves the source of truth while enabling standardized analysis (e.g., graphing lab results over time). If the AI cannot confidently determine the unit, the normalized fields can be left `NULL`.
*   **Confidence Scoring:** Every piece of data extracted by the AI is stored with a `confidence_score` to quantify the model's certainty.
*   **Review Flag:** If the AI is unable to confidently normalize a value or resolve an ambiguity, it can set a `requires_review` flag to `true`. This creates a queue for a human to verify the data, ensuring that clinical safety is the top priority.

---

## 7. Provenance: A Multi-Layered Source Model

**Decision:** We will adopt O3's proposed model of two dedicated tables: `document_representations` and `clinical_fact_sources`.

**Rationale:** This provides the most robust and scalable solution for provenance. It correctly models the reality that a single source document can have multiple "representations" (image, OCR text, AI JSON), and these representations can be linked to multiple clinical "facts." This clean separation is superior to storing source metadata directly in the clinical tables.

---

## 8. Relationship Modeling: A Flexible Link Table

**Decision:** We will adopt Claude's proposal for a single, generic `medical_data_relationships` table.

**Rationale:** While my initial proposal was to use a JSONB column for relationships, this would create a major performance bottleneck, as it cannot be efficiently indexed. A dedicated link table, as proposed by Claude and O3, is the correct approach. We chose Claude's generic model because of its flexibility. It allows us to link any data point to any other (e.g., a lab result to a condition) without needing to create new tables, effectively building a powerful knowledge graph of the patient's health.