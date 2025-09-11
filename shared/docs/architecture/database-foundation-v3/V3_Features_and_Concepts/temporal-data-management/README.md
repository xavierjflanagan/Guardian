# Temporal Data Management

## Overview

This folder contains all concepts and strategies related to managing healthcare data across time, including deduplication, historical tracking, and temporal conflict resolution for clinical entities.

## Problem Domain

Healthcare data presents unique temporal challenges:
- Multiple documents may contain the same clinical information from different time periods
- Clinical entities (medications, conditions, allergies) evolve over time
- Document dates may conflict with clinical effective dates
- Users need both current state and historical progression

## Key Concepts in This Folder

### Core Files
- **`deduplication-framework.md`** - Core logic for identifying and handling duplicate clinical entities using medical codes and deterministic supersession
- **`temporal-conflict-resolution.md`** - Date hierarchy and precedence rules for resolving conflicting temporal information
- **`clinical-identity-policies.md`** - Defines what makes clinical entities "the same" for deduplication purposes

### Archive
- **`archive/`** - Contains all iterations of the temporal health data evolution strategy documents, preserving the evolution of our thinking

## Relationships to Other Folders

- **Medical Code Resolution**: Provides the medical codes needed for clinical entity identity
- **Narrative Architecture**: Consumes temporal data to create coherent clinical storylines
- **Implementation Planning**: Translates temporal concepts into concrete database and AI pipeline changes

## Implementation Status

This folder contains the conceptual framework for V4's temporal data management system. The core challenge is maintaining both clean, deduplicated current state while preserving complete historical context for audit and clinical decision-making.

Key innovations:
- Deterministic supersession logic (no AI decision-making required)
- Temporal precedence using clinical effective dates
- Complete audit trail preservation through versioning
- Single active row per clinical entity with full history maintained