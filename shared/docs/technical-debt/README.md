# Technical Debt Items

This directory contains detailed documentation for all technical debt items in Guardian v7.

## **Quick Reference**

| Item | Priority | Status | Last Updated |
|------|----------|--------|--------------|
| [Performance Monitoring](performance-monitoring.md) | 🔴 HIGH | Documented | Aug 2025 |
| [Security Hardening](security-hardening.md) | 🟡 MEDIUM | Planned | Aug 2025 |
| [Scalability Planning](scalability-planning.md) | 🟢 LOW | Planned | Aug 2025 |

## **Document Template**

Each technical debt item should follow this structure:

```markdown
# [Debt Item Name]

**Impact:** [HIGH/MEDIUM/LOW] - [Brief description of business impact]
**Effort:** [Time estimate]
**Risk:** [What happens if not addressed]
**Trigger:** [When this becomes critical]

## Current State
- ✅ What's working
- ❌ What's missing
- ⚠️ What's at risk

## What We Need
1. Specific requirement 1
2. Specific requirement 2
3. Specific requirement 3

## Implementation Plan
- **Phase 1:** [Description] ([Time estimate])
- **Phase 2:** [Description] ([Time estimate])
- **Phase 3:** [Description] ([Time estimate])

## Business Impact
**Without this:** [Negative consequences]
**With this:** [Positive outcomes]

## Success Criteria
- [ ] Measurable outcome 1
- [ ] Measurable outcome 2
- [ ] Measurable outcome 3
```

## **Adding New Debt Items**

1. Create new `.md` file using template above
2. Add to main registry: `docs/project/technical-debt.md`
3. Create GitHub issue if HIGH priority
4. Update this README's quick reference table