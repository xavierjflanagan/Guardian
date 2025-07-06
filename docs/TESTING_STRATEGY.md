# Testing Strategy

This document outlines the testing strategy for the Guardian project to ensure code quality, reliability, and maintainability.

---

## Core Principles

- **Pragmatism:** As a solo-developer project, the testing strategy must be lightweight and focused on providing the most value for the effort.
- **Confidence:** Tests should provide confidence that critical paths are working as expected and that new changes do not introduce regressions.
- **Automation:** Where possible, tests should be automated and run as part of the development and deployment process.

---

## Levels of Testing

### 1. Static Analysis & Linting

- **Tools:** ESLint, Prettier, TypeScript Compiler (`tsc`)
- **Purpose:** To catch formatting issues, potential bugs, and type errors at build time before the code is even run.
- **Implementation:** These checks are already integrated into the `guardian-web` package and should be run before any commit.

### 2. Unit Tests

- **Framework:** Vitest / Jest
- **Purpose:** To test individual functions, components, and utilities in isolation.
- **Scope:**
    - All functions in `lib/` and `utils/` should have unit tests.
    - Complex UI components with significant logic should have unit tests.
    - Critical business logic (e.g., data transformation) must be unit tested.

### 3. Integration Tests

- **Framework:** Vitest / Jest with `testing-library/react`
- **Purpose:** To test the interaction between different parts of the application.
- **Scope:**
    - Test API endpoints to ensure they correctly interact with the Supabase backend.
    - Test the document processing pipeline to verify that each step correctly hands off to the next.
    - Test that frontend components correctly fetch and display data from the backend.

### 4. End-to-End (E2E) Tests

- **Framework:** Playwright or Cypress (to be decided)
- **Purpose:** To simulate real user workflows from start to finish in a browser environment.
- **Scope (MVP):**
    - **Happy Path - User Authentication:** A user can sign up, log out, and log back in.
    - **Happy Path - Document Upload:** A logged-in user can upload a document and see it appear in their dashboard.

---

## Execution

- **Local Development:** Developers should run `npm run test` locally before pushing changes.
- **Continuous Integration (CI):** (Future) A GitHub Action will be configured to run all tests automatically on every push to the main branch. A pull request will not be mergeable unless all tests pass.
