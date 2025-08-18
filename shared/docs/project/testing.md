# Testing Strategy

**Purpose:** Outlines the testing strategy for the Guardian project to ensure code quality, reliability, and maintainability.
**Last updated:** August 2025 (Major infrastructure improvements implemented)
**Audience:** Developers, QA, contributors
**Prerequisites:** Familiarity with Node.js, TypeScript, and testing frameworks

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

## Test Infrastructure (Updated August 2025)

### **Modern Testing Patterns**
Guardian now implements production-quality testing infrastructure with:

#### **Centralized Mock Utilities** 
- **Location**: `apps/web/test-utils/supabase-mocks.ts`
- **Purpose**: Consistent, typed Supabase client mocking across all test files
- **Benefits**: Eliminates duplication, ensures consistent behavior, easier maintenance

```typescript
// Usage in test files
import { createMockSupabaseClient, setupGlobalMocks } from '../../test-utils/supabase-mocks'

setupGlobalMocks() // Sets up crypto, navigator, fetch
const mockClient = createMockSupabaseClient({
  // Custom overrides as needed
})
```

#### **Type-Safe Test Assertions**
- **Proper discriminated union handling**: Uses `isValidationFailure()` and `isValidationSuccess()` type guards
- **Eliminated unsafe casts**: No more `(result as any)` patterns
- **Resilient expectations**: `expect.objectContaining()` for robust assertions

```typescript
// Before (unsafe)
expect((result as any).error).toBe('Validation failed')

// After (type-safe)
if (isValidationFailure(result)) {
  expect(result.error).toBe('Validation failed')
}
```

#### **Dependency Injection for Testability**
- **Clean audit logging tests**: `useEventLogging(options?: { auditLogger?: Fn })`
- **No global mocking**: Inject mock functions instead of patching globals
- **Clear separation**: Client-side vs server-side logging paths

### **Critical Test Infrastructure Components**

#### **Supabase Authentication Mocking**
- **Complete auth coverage**: `getSession()`, `getUser()`, `onAuthStateChange()` 
- **Healthcare-specific**: Session management for audit trails
- **Global setup**: Configured in `jest.setup.js` for consistency

#### **Global Test Environment**
- **Fetch polyfill**: Server-side operation support without per-test stubs
- **Crypto mocking**: Consistent UUIDs for session tracking
- **Console management**: Silenced expected logs for clean CI output

## Execution

- **Local Development:** Developers should run `pnpm --filter @guardian/web run test` locally before pushing changes.
- **Type Safety:** Always run `pnpm --filter @guardian/web run typecheck` to ensure TypeScript compilation
- **CI Status:** ✅ **FULLY OPERATIONAL** - All blocking infrastructure issues resolved (August 2025)
- **Continuous Integration:** Tests run automatically on every push with reliable, fast feedback
