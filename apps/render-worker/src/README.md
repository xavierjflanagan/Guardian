# Worker Source Structure

## Current Implementation: Monolithic (Phase 1)
All functionality is in `worker.ts` for simplicity and faster initial deployment.

## Future Modular Structure (Phase 2)

### Why These Folders Exist (Currently Empty)

The folder structure follows the V3_ARCHITECTURE_MASTER_GUIDE.md specification. They're placeholders for the planned refactoring:

```
src/
├── worker.ts              # Current: Everything here (monolithic)
├── api-clients/          # Future: API client modules
│   ├── openai-client.ts  # OpenAI GPT-4 integration
│   ├── google-vision.ts  # Google Cloud Vision OCR
│   └── supabase-storage.ts # File storage operations
├── database/             # Future: Database layer
│   ├── repositories/     # Data access patterns
│   ├── queries/         # SQL query builders
│   └── migrations/      # Schema updates
├── job-processors/       # Future: Job type handlers
│   ├── shell-file-processor.ts
│   ├── ai-processor.ts
│   ├── narrative-generator.ts
│   └── consent-verifier.ts
└── utils/               # Future: Shared utilities
    ├── logger.ts        # Structured logging
    ├── error-handler.ts # Error management
    ├── rate-limiter.ts  # API throttling
    └── metrics.ts       # Performance tracking
```

## Refactoring Timeline

### Phase 1 (Current) ✅
- Single `worker.ts` file
- Basic job processing
- Minimal dependencies
- Quick to deploy and test

### Phase 2 (When Needed)
Refactor when we need:
- Multiple job types (beyond shell_file_processing)
- Complex API integrations
- Unit testing individual components
- Multiple developers working on different parts

### Phase 3 (Scale)
Full modular architecture when:
- Processing 1000s of jobs
- Need specialized processors
- Require detailed monitoring
- Want to reuse components

## Why Not Modular Now?

1. **YAGNI (You Aren't Gonna Need It)**: Don't over-engineer before requirements are clear
2. **Faster Iteration**: Single file is easier to modify and deploy
3. **Clearer Dependencies**: Everything in one place during development
4. **Proven Need**: Refactor when pain points emerge, not preemptively

## When to Refactor

Refactor into modules when:
- [ ] `worker.ts` exceeds 1000 lines
- [ ] Adding 3+ different job types
- [ ] Multiple API integrations needed
- [ ] Team grows beyond 2 developers
- [ ] Need independent testing of components

## How to Refactor

When ready, follow this pattern:

1. **Extract API Clients**:
   ```typescript
   // Move from worker.ts
   class OpenAIClient { ... }
   
   // To api-clients/openai-client.ts
   export class OpenAIClient { ... }
   ```

2. **Extract Processors**:
   ```typescript
   // Move processShellFile method
   // To job-processors/shell-file-processor.ts
   ```

3. **Extract Database Logic**:
   ```typescript
   // Move all Supabase queries
   // To database/repositories/
   ```

4. **Keep worker.ts as Orchestrator**:
   ```typescript
   // worker.ts becomes thin orchestration layer
   import { ShellFileProcessor } from './job-processors';
   // ... coordinate between modules
   ```

## Current Priority

Focus on:
1. Getting worker deployed and running ✅
2. Adding real AI processing to existing `worker.ts`
3. Testing with actual document processing
4. THEN consider modularization based on real needs

The empty folders are **intentional placeholders** showing where we're headed, but we're not there yet. This is good architecture - plan for modularity but implement simply.