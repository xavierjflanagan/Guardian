# Data-Centric Architecture: From Provenance to Insight

**Status:** Proposed
**Date:** 2025-07-25
**Author:** Gemini
**Supersedes:** This document enhances and provides the next evolution for `jsonb-normalization-architecture.md`.

## 1. Executive Summary

This document outlines the next evolution of the Guardian data architecture, building upon the established normalization pipeline. It directly incorporates the principles of data lifecycle management, deep source provenance, and relational metadata. The goal is to transform Guardian from a system that *stores* health information into a platform that *understands* it, providing users with unparalleled trust, context, and insight.

This architecture will enable three cornerstone user-facing features:

1.  **Deep Provenance:** Allow users to trace any data point not just to its source document, but to its precise visual location on that document.
2.  **Contextual Understanding:** Capture and display the "why" behind data (e.g., a medication is for a specific condition).
3.  **Relational Navigation:** Allow users to seamlessly navigate between related health concepts within their dashboard.

## 2. Core Architectural Enhancements

To achieve this, we will introduce enhancements at three key layers of the system: AI Extraction, Database Schema, and the Normalization Service.

### 2.1. Stage 1 Enhancement: AI Extraction & Bounding Boxes

The initial AI extraction process (Vision/GPT-4o) must be updated. The prompt will be refined to instruct the model to return not just the extracted data, but also its **bounding box coordinates** (`x`, `y`, `width`, `height`) from the original document image.

**Updated `medical_data` JSONB Structure (Example):**

```typescript
// This is a conceptual update to the JSONB object produced by the initial AI pipeline.
interface MedicalData {
  // ... existing fields
  medicalData: {
    conditions?: Array<{
      condition: string;
      status: string;
      // NEW: Bounding box for deep provenance
      sourceLocation: {
        page: number;
        x: number;
        y: number;
        width: number;
        height: number;
      };
      // NEW: Contextual and relational metadata
      context: string | null; // e.g., "due to menorrhagia"
      relatedTo: Array<{type: 'medication' | 'lab_result', text: string}>; // e.g., [{type: 'medication', text: 'Iron Supplements'}]
    }>;
    medications?: Array<{
      name: string;
      dosage: string;
      frequency: string;
      // NEW: Bounding box for deep provenance
      sourceLocation: {
        page: number;
        x: number;
        y: number;
        width: number;
        height: number;
      };
       // NEW: Contextual and relational metadata
      context: string | null; // e.g., "for Type 2 Diabetes"
      relatedTo: Array<{type: 'condition', text: string}>; // e.g., [{type: 'condition', text: 'Type 2 Diabetes'}]
    }>;
    // ... other categories updated similarly
  };
  // ... existing fields
}
```

### 2.2. Stage 2 Enhancement: Normalized Database Schema

#### Design Rationale: Multi-Table Relational Schema vs. Single Ledger

A common question is why we use multiple, specialized tables (e.g., `patient_medications`, `patient_allergies`) instead of a single, massive "ledger" table. While a single ledger is an intuitive concept, the multi-table approach is the professional standard for building robust, scalable applications for several key reasons:

*   **Clarity & Structure:** It's like a well-organized filing cabinet with separate, clearly labeled folders. Each table has a specific purpose and a predictable structure. A `patient_medications` record has columns for `dosage` and `frequency`, which don't make sense for a `patient_conditions` record. This avoids confusion and clutter.
*   **Speed & Efficiency:** Querying a smaller, specific table is dramatically faster than searching through a single giant one. To find all allergies, the database goes directly to the `patient_allergies` table, ignoring all other irrelevant data.
*   **Data Integrity:** We can enforce specific rules on each table. For example, we can require that every medication record *must* have a dosage, without forcing that same rule onto an allergy record. This prevents bad data and ensures reliability.

The rich metadata and tags are still central, but they are organized within the many columns of these specialized, efficient tables.

#### Proposed Schema Modifications (`005_add_rich_metadata_fields.sql`)

To accommodate deep provenance and future data sources, we will add the following columns to the primary normalized tables (`patient_medications`, `patient_conditions`, `patient_allergies`, etc.).

```sql
-- Add to patient_medications, patient_conditions, patient_allergies, etc.
ALTER TABLE patient_medications
ADD COLUMN source_type TEXT DEFAULT 'document_upload',
ADD COLUMN source_location JSONB,
ADD COLUMN related_entities JSONB;

-- Example of the data to be stored:
-- source_type: 'document_upload' (or later, 'api_import', 'wearable_sync')
-- source_location: {"page": 1, "x": 150, "y": 320, "width": 200, "height": 25}
-- related_entities: [{"id": "uuid-of-condition", "table": "patient_conditions", "text": "Type 2 Diabetes"}]
```

*   **`source_type` (TEXT):** A tag indicating the origin of the data. Initially, this will be `'document_upload'`. This prepares the schema for future integrations with APIs, wearables, or other data sources without requiring a redesign.
*   **`source_location` (JSONB):** Stores the bounding box coordinates. This is the key to the "click to see source image" feature.
*   **`related_entities` (JSONB):** Stores an array of pointers to other records *created from the same source document*. This creates the explicit, self-contained links between related data points.

### 2.3. Stage 3 Enhancement: Normalization Service Logic

The `document-normalizer` Edge Function will be upgraded to handle this new, richer data structure.

**Updated Normalization Flow: Intra-Document Linking**

To ensure data integrity and a clear audit trail, the normalization and linking process is self-contained for each document. **No pre-existing data from other documents will ever be modified.** The entire two-pass process happens within a single, atomic transaction for one document at a time.

1.  **Receive Enhanced JSONB:** The function ingests the `medical_data` object for a single source document, now containing `sourceLocation` and `relatedTo` fields.

2.  **Two-Pass Normalization (Atomic Transaction):**
    *   **First Pass (Entity Creation):** The normalizer iterates through the medical data. For each item (e.g., a medication, a condition), it creates a *new row* in the corresponding normalized table. Each new row is tagged with the source document's ID. The `source_location` data is stored directly, and the `source_type` is set to `'document_upload'`. The text-based `relatedTo` information is held in memory for the next pass.
    *   **Second Pass (Intra-Document Relational Linking):** After all entities from the source document have been created, this second pass resolves the relationships *only between the records created in the first pass*. The function looks up the UUIDs of the records it just created (e.g., the "Lisinopril" medication and the "Hypertension" condition from the same document) and updates the `related_entities` column for both newly created records, linking them to each other.

3.  **Store Relationships:** The resolved relationships, containing the UUIDs of the related records *from the same document*, are now permanently stored. This maintains a perfect, verifiable link between the data and its specific source, fulfilling the core principle of data provenance. The frontend is then responsible for aggregating data from multiple sources to create a unified view.

## 3. Frontend Implementation & User Experience

With this enhanced backend, the frontend can now deliver the visionary features requested:

### 3.1. Deep Provenance Viewer

*   **On Click:** When a user clicks a data point (e.g., "Anemia") on their dashboard, a modal or pop-up appears.
*   **Display Options:** This modal will offer multiple views:
    1.  **Source Document:** The name of the source file(s), clickable to view the full PDF/image.
    2.  **Cropped Snippet:** An image snippet of the original document, dynamically generated using the stored `source_location` coordinates. This provides immediate, undeniable proof of the data's origin.
    3.  **Extracted Text:** The raw OCR text associated with the data point.
    4.  **AI JSON:** The raw JSONB generated by the AI for that item.

### 3.2. Contextual Data Display

*   The frontend will display the `context` string directly alongside the data point.
    *   Under "Lisinopril", it might say "*Prescribed for Hypertension*".
    *   Under "Anemia", it might say "*Context: due to menorrhagia*".

### 3.3. Hyperlinked Health Record

*   The `related_entities` field enables a fully interconnected dashboard.
*   When viewing a medication, any linked conditions will be displayed as hyperlinks. Clicking on "Hypertension" would navigate the user to the details of that condition in their "Conditions" panel, which in turn would show all other medications and lab results related to it.

## 4. Implementation Plan

1.  **Update AI Prompt:** Refine the master prompt for the AI extraction service to include instructions for bounding boxes and relationship extraction.
2.  **Create New DB Migration:** Write and apply `005_add_rich_metadata_fields.sql` to add the `source_location` and `related_entities` columns.
3.  **Upgrade Normalizer Function:** Modify the `document-normalizer` to implement the two-pass normalization logic.
4.  **Develop Frontend Components:** Build the "Deep Provenance" modal and update the dashboard components to display contextual data and hyperlinks.

This architecture creates a powerful flywheel: better AI extraction leads to a richer database, which enables a more insightful and trustworthy frontend, fulfilling Guardian's core mission.
