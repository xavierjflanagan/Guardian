# Import Path Consistency

**Impact:** LOW - Bundle bloat risk  
**Effort:** 1 hour (setup + documentation)  
**Risk:** Increased bundle size, slower builds, runtime performance  
**Trigger:** Ongoing monitoring  

## Current State

- ✅ **Monorepo structure established** with packages/ui and apps/web
- ✅ **Component imports working** with @guardian/ui barrel exports
- ❌ **Type vs value imports inconsistent** throughout codebase
- ⚠️ **Bundle bloat risk** as monorepo evolves and grows

## What We Need

1. **ESLint rules for import consistency** - Enforce type-only imports where appropriate
2. **Bundle analysis automation** - Monitor import impact on bundle size
3. **Documentation and patterns** - Clear guidelines for import best practices

## Implementation Plan

- **Phase 1:** ESLint configuration (30 minutes)
  - Add @typescript-eslint/consistent-type-imports rule
  - Configure auto-fix for type-only imports
  - Add to existing ESLint configuration

- **Phase 2:** Codebase cleanup (20 minutes)
  - Run ESLint auto-fix across codebase
  - Review and validate type-only import changes
  - Update import patterns in new code

- **Phase 3:** Monitoring setup (10 minutes)
  - Add bundle analyzer to build process
  - Document import best practices
  - Add to development workflow documentation

## Business Impact

**Without this:**
- Gradual bundle size inflation over time
- Slower build times and runtime performance
- Inconsistent import patterns confusing developers

**With this:**
- Optimized bundle size and build performance
- Consistent import patterns across codebase
- Automated monitoring preventing future regressions

## Success Criteria

- [ ] ESLint rules enforcing consistent type imports
- [ ] Bundle analyzer integrated into build process
- [ ] Import pattern documentation for team reference