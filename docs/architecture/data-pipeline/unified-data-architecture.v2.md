# Guardian Unified Data Architecture & Lifecycle Strategy (v2)

**Status:** Living Document
**Authors:** Gemini, with contributions from Claude, O3, and human reviewers.

## 1. Overview

This document outlines the definitive data architecture for the Guardian platform. It synthesizes feedback from multiple architectural proposals to create a robust, scalable, and maintainable system. This version incorporates detailed feedback to provide a more comprehensive and actionable blueprint for development.

## 2. Core Principles

- **Immutability**: Data is never physically deleted. Changes are tracked through versioning, maintaining a complete audit trail.
- **Traceability**: Every piece of data can be traced back to its source document and the specific process that extracted it.
- **Data Integrity**: The system enforces data consistency and accuracy through a combination of database constraints, validation rules, and controlled data entry processes.
- **Scalability**: The architecture is designed to handle growing data volumes and user load without significant performance degradation.
- **Interoperability**: The system is designed to be compatible with existing healthcare data standards, such as FHIR, to facilitate data exchange with other systems.

## 3. Data Pipeline

The data processing pipeline consists of the following stages:

1.  **Ingestion**: Users upload medical documents in various formats (e.g., PDF, JPEG, PNG).
2.  **Extraction**: An AI-powered service extracts structured data from the documents. This includes text, entities, and their relationships.
3.  **Normalization**: The extracted data is cleaned, standardized, and mapped to the appropriate tables in the database.
4.  **Enrichment**: Additional context and relationships are added to the normalized data.
5.  **Storage**: The processed data is stored in a secure and scalable database.

## 4. Database Schema

### 4.1. `documents` Table

Stores metadata about each uploaded document.

| Column      | Type      | Description                                      |
|-------------|-----------|--------------------------------------------------|
| `id`        | `uuid`    | Primary Key                                      |
| `user_id`   | `uuid`    | Foreign key to the `users` table                 |
| `file_name` | `text`    | Original name of the uploaded file               |
| `status`    | `text`    | Processing status (e.g., 'pending', 'completed') |
| `created_at`| `timestamptz` | Timestamp of when the document was uploaded      |

### 4.2. `document_revisions` Table

Stores different versions of the extracted data from a document.

| Column      | Type      | Description                                      |
|-------------|-----------|--------------------------------------------------|
| `id`        | `uuid`    | Primary Key                                      |
| `document_id`| `uuid`    | Foreign key to the `documents` table             |
| `data`      | `jsonb`   | The extracted data in JSON format                |
| `created_at`| `timestamptz` | Timestamp of when the revision was created       |

### 4.3. `clinical_fact_sources` Table

Links clinical data points to their source in a document.

| Column      | Type      | Description                                      |
|-------------|-----------|--------------------------------------------------|
| `id`        | `uuid`    | Primary Key                                      |
| `fact_id`   | `uuid`    | Foreign key to the specific clinical data table |
| `table_name`| `text`    | The name of the table where the fact is stored   |
| `document_id`| `uuid`    | Foreign key to the `documents` table             |
| `page_number`| `integer` | The page number in the document where the data was found |
| `bounding_box`| `jsonb`   | The coordinates of the data on the page          |

### 4.4. `medical_data_relationships` Table

Stores relationships between different pieces of medical data.

| Column      | Type      | Description                                      |
|-------------|-----------|--------------------------------------------------|
| `id`        | `uuid`    | Primary Key                                      |
| `source_data_point_id` | `uuid` | Foreign key to the source data point      |
| `target_data_point_id` | `uuid` | Foreign key to the target data point      |
| `relationship_type` | `text` | The type of relationship (e.g., 'treats', 'caused_by') |
| `confidence_score` | `decimal` | The confidence score of the relationship |

## 5. Data Lifecycle Management

The system uses a combination of versioning and soft deletion to manage the lifecycle of data. When a document is re-processed, a new revision is created, and the previous revision is marked as superseded. This ensures that the full history of the data is preserved.

## 6. Security and Compliance

- **Access Control**: Role-based access control (RBAC) will be implemented to ensure that users can only access their own data.
- **Data Encryption**: All sensitive data will be encrypted at rest and in transit.
- **Audit Trail**: All changes to medical data will be logged to provide a complete audit trail.
- **Compliance**: The system will be designed to comply with relevant healthcare regulations, such as HIPAA.

## 7. Open Issues and Future Considerations

- **Data Retention Policies**: Define and implement policies for data archival and deletion.
- **FHIR Compliance**: Investigate the feasibility and requirements for achieving FHIR compliance.
- **Real-time Data Sync**: Explore options for real-time data synchronization with external health providers.
