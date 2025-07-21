# ADR-0008: Frontend AI Development Workflow Strategy

**Status:** Active  
**Date:** 2025-07-21  
**Author:** Claude (Anthropic) + Team Synthesis  
**Supersedes:** FRONTEND_WORKFLOW.md  

## Executive Summary

This ADR establishes the comprehensive AI-powered frontend development workflow for Guardian, integrating multiple AI tools (Bolt.new, Claude Code, v0) with traditional development practices to accelerate healthcare UI development while maintaining code quality, security, and HIPAA compliance.

## Context

Guardian requires rapid frontend development to complete POC by July 31 and evolve into a sophisticated healthcare platform. We have access to multiple AI development tools and need a structured approach to maximize their effectiveness while maintaining architectural integrity.

## Decision

**Adopt a hybrid AI-powered development workflow** that leverages the strengths of different tools at appropriate phases of development.

## Architecture Overview

### Primary Repository & Deployment
- **GitHub + Vercel (Next.js/Supabase)** = single source of truth  
- Protect `main` with PR-only merges; run lint + OWASP scans on every pull request
- All AI-generated code must be reviewed and integrated through standard Git workflow

### AI Tool Ecosystem

| Tool | Primary Use-Case | Export Model | When to Use | When to Turn Off |
|------|------------------|--------------|-------------|------------------|
| **Bolt.new** | Creative UI generation, healthcare component creation | GitHub sync or ZIP download | Initial component creation, visual redesigns | After component integration complete |
| **Claude Code** | Integration, optimization, Guardian-specific implementation | Direct codebase editing | Data integration, TypeScript, compliance | N/A (persistent assistant) |
| **Vercel v0** | One-shot scaffolding, rapid prototyping | "Add to Codebase" → local files | Quick component scaffolding | After component lands in repo |
| **Lovable** | Non-dev teammate collaboration, CRUD apps | Auto-push to linked GitHub repo | Designer collaboration | After feature stabilizes |

### Daily Development Environment
- **Claude Code** → Strategic planning, integration, optimization
- **Cursor IDE** → Chat + refactor Edge Functions, SQL, React
- **Warp Terminal** → AI-assisted CLI (deploy Supabase, tail logs, etc.)

## Core Workflow Strategy

### **Phase 1: AI Generation (Bolt + Claude Collaboration)**

#### Claude's Role: AI Prompt Architect
Instead of generic prompts like "Create a medical dashboard", Claude creates Guardian-specific prompts:

```typescript
✅ "Create a medical document processing dashboard for a Next.js 15.3.4 + React 19 + TypeScript healthcare app.

CONTEXT:
- Uses Supabase for auth/database with RLS 
- Documents table: { id, user_id, filename, status: 'uploaded'|'processing'|'completed', ocr_text, confidence_score, created_at }
- Existing Tailwind CSS with Inter font
- Healthcare blue primary (#0066CC)

REQUIREMENTS:
- Show document processing queue with real-time status updates
- Display confidence scores as progress bars (green >95%, yellow 80-95%, red <80%)
- Error handling with retry buttons for failed documents
- HIPAA-compliant design (secure, professional, accessible)
- TypeScript interfaces for all props

STYLING:
- Medical-grade typography (readable, professional)
- WCAG 2.1 AA accessibility compliance
- Responsive design for mobile healthcare workers"
```

#### Bolt's Role: Creative UI Generation
```typescript
// Bolt generates beautiful, functional component
const MedicalDashboard = () => {
  // Nice styling, good structure, basic functionality with mock data
  return <div>Beautiful Healthcare UI</div>
}
```

### **Phase 2: Integration & Optimization (Claude Code)**

```typescript
// Claude adds Guardian-specific integrations
const MedicalDashboard = () => {
  const { user } = useUser() // Supabase auth integration
  const { documents } = useDocuments(user?.id) // Real data integration
  const [processing, setProcessing] = useState<ProcessingStatus>() // Proper TypeScript
  
  // Performance optimizations, error handling, accessibility
  return <div>Beautiful UI + Real Guardian Functionality</div>
}
```

### **Phase 3: Review & Deploy (Traditional Workflow)**

```bash
# Standard Git workflow for all AI-generated code
1. AI generates code → export to feature branch
2. Code review and testing in Cursor/Warp
3. Security and compliance checks
4. Squash & merge to main → Vercel deploy
```

## Practical Implementation Flow

### **1. Component Creation Workflow**
```bash
# Step 1: Claude creates detailed Bolt prompt
# Step 2: Bolt generates beautiful component
# Step 3: Export to Git branch (ui/component-name)
# Step 4: Claude integrates with Guardian systems
# Step 5: PR review → merge to main
```

### **2. Feature Development Workflow**  
```bash
# Step 1: Prototype in Bolt → export to spike/feature-name
# Step 2: Claude refines and integrates locally  
# Step 3: Test in Cursor/Warp development environment
# Step 4: Security review and compliance check
# Step 5: Squash & merge to main → Vercel deploy
```

### **3. Designer Collaboration Workflow**
```bash
# Step 1: Designers use Lovable for mockups
# Step 2: Review PRs from Lovable auto-sync
# Step 3: Cherry-pick stable components
# Step 4: Claude integrates with Guardian architecture
```

## Tool-Specific Strategies

### **Bolt.new Optimization**

#### When to Use Bolt:
- ✅ Initial component generation with beautiful styling
- ✅ Major visual redesigns and UI/UX iterations  
- ✅ New UI elements from scratch
- ✅ Design system establishment
- ✅ Healthcare interface prototyping

#### Bolt Best Practices:
1. **Provide comprehensive context** using Claude's architectural knowledge
2. **Focus on visual and UX requirements** rather than integration details
3. **Iterate on design** until visually satisfied before handoff
4. **Export clean code** for Claude integration

### **Claude Code Optimization**

#### When to Use Claude:
- 🔧 Guardian-specific data integration (Supabase, auth, real data)
- 🔧 TypeScript refinements and proper interfaces
- 🔧 Performance optimizations for medical documents
- 🔧 Accessibility improvements for HIPAA compliance
- 🔧 Complex business logic and error handling
- 🔧 Debugging and architectural consistency

#### Claude Best Practices:
1. **Read Bolt-generated code** thoroughly before modifications
2. **Preserve Bolt's design patterns** while adding functionality
3. **Maintain TypeScript consistency** throughout integration
4. **Add comprehensive error handling** and loading states
5. **Implement Guardian-specific patterns** and conventions

### **Handoff Decision Matrix**

#### Continue with Bolt When:
- You want **immediate visual changes**
- You're **experimenting with layouts/designs**
- You need **new components from scratch**
- Component is **purely presentational**

#### Switch to Claude When:
- Component needs **real data integration**
- You need **TypeScript improvements** or error handling
- You want **performance optimizations**
- You need **accessibility compliance**
- Component requires **complex business logic**

## Long-term Evolution Strategy

### **Months 1-2: Heavy AI Generation** ("Interior Designer Phase")
- **Usage**: 70% Bolt, 30% Claude
- **Focus**: Component library creation, design system establishment
- **Goal**: Rapid beautiful UI generation

### **Months 3-4: Balanced Partnership** ("Collaborative Phase")
- **Usage**: 50% Bolt, 50% Claude  
- **Focus**: New major features with sophisticated integration
- **Goal**: Feature development with visual polish

### **Months 5-6: Integration-Heavy** ("Engineering Phase")
- **Usage**: 30% Bolt, 70% Claude
- **Focus**: Performance optimization, enterprise features
- **Goal**: Production-ready healthcare platform

### **Beyond 6 Months: Strategic AI Usage** ("Design Consultant Phase")
- **Usage**: 20% Bolt, 80% Claude + traditional development
- **Focus**: Major UI redesigns, new feature prototyping
- **Goal**: Continuous evolution with solid architecture

## Security & Compliance Integration

### **Compliance Checklist (Each Merge)**
- [ ] Strip sample PHI / secrets from AI-generated code  
- [ ] Run OWASP/Zap baseline, `npm audit`, `npm run lint`  
- [ ] Confirm Supabase storage rules & Vercel env vars never leak
- [ ] Verify HIPAA-compliant data handling patterns
- [ ] Test accessibility compliance (WCAG 2.1 AA)
- [ ] Review medical data visualization accuracy

### **Healthcare-Specific AI Considerations**

#### Bolt Prompts Must Include:
- **HIPAA compliance requirements**
- **Medical data visualization best practices**
- **Healthcare accessibility standards**
- **Professional medical design patterns**
- **Patient-centric user workflows**

#### Claude Integration Must Add:
- **Secure data handling** for patient information
- **Audit trail implementation** for medical record access
- **Error handling** meeting healthcare standards
- **Performance optimization** for large medical documents
- **Accessibility compliance** verification

## Component Architecture Strategy

### **File Organization**
```
guardian-web/
├── components/
│   ├── ai-generated/      # Raw AI outputs (temporary)
│   ├── healthcare/        # Integrated medical components
│   ├── ui/               # Design system components  
│   └── shared/           # Reusable utilities
├── docs/
│   └── architecture/adr/ # This file and related ADRs
└── types/
    └── guardian.ts       # Guardian-specific TypeScript interfaces
```

### **Component Quality Standards**

#### AI-Generated Component Requirements:
- ✅ Visually appealing and professionally designed
- ✅ Responsive and mobile-friendly
- ✅ Consistent with healthcare design patterns
- ✅ Basic functionality with appropriate mock data
- ✅ TypeScript interfaces for all props

#### Integrated Component Requirements:
- ✅ Seamless Supabase data integration
- ✅ Proper TypeScript implementation with Guardian types
- ✅ HIPAA-compliant data handling
- ✅ WCAG 2.1 AA accessibility compliance
- ✅ Performance optimized for healthcare use cases
- ✅ Comprehensive error handling and edge cases
- ✅ Integration with Guardian authentication and RLS

## Success Metrics

### **Development Velocity**
- **Target**: 40-60% faster component development vs traditional methods
- **Measure**: Time from concept to deployed component
- **Baseline**: Traditional React component development timeline

### **Code Quality**
- **AI Component Quality**: Pass design review on first iteration >80%
- **Integration Quality**: Pass code review on first attempt >90%
- **Bug Rate**: <10% of AI-generated components require post-deployment fixes

### **Healthcare Compliance**
- **Accessibility**: 100% of components pass WCAG 2.1 AA audit
- **Security**: 0 HIPAA violations in AI-generated code
- **Performance**: Medical document loading <2s on 3G networks

## Risks & Mitigations

### **Risk**: AI-generated code quality inconsistency
**Mitigation**: Mandatory code review and Claude integration phase

### **Risk**: Security vulnerabilities in AI outputs  
**Mitigation**: Automated security scans + manual healthcare compliance review

### **Risk**: Over-dependence on AI tools
**Mitigation**: Maintain traditional development skills + fallback workflows

### **Risk**: Tool vendor lock-in
**Mitigation**: Export-focused workflow + multiple tool options

## Implementation Timeline

### **Immediate (Week 1)**
- [ ] Set up Bolt.new workspace with Guardian integration
- [ ] Create first Claude-generated prompts for POC components
- [ ] Establish Git workflow for AI-generated code
- [ ] Complete AI processing dashboard using Bolt → Claude workflow

### **Short-term (Month 1)**
- [ ] Generate comprehensive healthcare component library
- [ ] Establish design system using AI-assisted development
- [ ] Integrate all components with Guardian Supabase architecture
- [ ] Deploy polished POC with AI-enhanced frontend

### **Medium-term (Months 2-6)**
- [ ] Optimize workflow based on real usage patterns
- [ ] Develop advanced healthcare-specific components
- [ ] Implement enterprise-grade features and compliance
- [ ] Scale team collaboration using multi-tool workflow

## Conclusion

This hybrid AI-powered frontend development workflow leverages the creative capabilities of modern AI tools while maintaining the architectural integrity, security, and compliance requirements essential for a healthcare application. By clearly defining tool responsibilities and handoff procedures, we can achieve rapid development velocity without compromising code quality.

**Key Success Factors:**
1. **Clear tool boundaries** and handoff procedures
2. **Guardian-specific AI prompt engineering** via Claude
3. **Mandatory integration and review** phases
4. **Healthcare compliance** throughout AI workflow
5. **Evolutionary approach** that adapts tool usage over time

---

**Priority**: Critical for POC completion and long-term development velocity  
**Dependencies**: Bolt.new subscription, Claude Code access, existing Guardian architecture  
**Next Review**: After POC completion (August 2025)