# Guardian Claude Code AI System

**Version**: 1.0  
**Created**: August 2025  
**Purpose**: Specialized AI subagent system for Guardian healthcare platform development

---

## 🏗️ System Overview

This directory contains a specialized AI operations system designed to accelerate Guardian development through domain-specific subagents, automated workflows, and external data integration.

### **Core Philosophy**
Instead of having one generalist AI, we have **7 specialized AI experts** that understand different aspects of the Guardian codebase and business:

- 🔧 **Sergei** - Infrastructure & Backend (Supabase, Render, databases)
- 🤖 **Tessa** - AI Processing (document pipeline, OCR, Vision AI)
- 🎨 **Prue** - Frontend (Next.js, React, UI/UX)
- ✅ **Quinn** - Quality & Testing (validation, medical data quality)
- 🏥 **Cleo** - Healthcare Data (FHIR, medical standards, clinical workflows)
- 📊 **Ana** - Analytics (metrics, user behavior, business intelligence)
- 📈 **Groot** - Growth (marketing, acquisition, retention)

---

## 📁 Directory Structure

```
.claude/
├── README.md                    # This file - master guide
├── ARCHITECTURE.md              # Visual system design
├── agents/                      # AI specialist definitions
│   ├── infrastructure-sergei.md
│   ├── ai-processing-tessa.md
│   ├── frontend-prue.md
│   ├── quality-quinn.md
│   ├── healthcare-data-cleo.md
│   ├── analytics-ana.md
│   └── growth-groot.md
├── memory/                      # Agent memory banks
│   ├── sergei/                  # Sergei's private learnings
│   ├── tessa/                   # Tessa's private learnings
│   ├── prue/                    # Prue's private learnings
│   ├── quinn/                   # Quinn's private learnings
│   ├── cleo/                    # Cleo's private learnings
│   ├── ana/                     # Ana's private learnings
│   ├── groot/                   # Groot's private learnings
│   └── shared/                  # Cross-agent communication
├── commands/                    # Workflow shortcuts (slash commands)
│   ├── infra/                   # Infrastructure commands
│   ├── ai/                      # AI processing commands
│   ├── ui/                      # Frontend commands
│   ├── quality/                 # Quality/testing commands
│   ├── health/                  # Healthcare commands
│   ├── analytics/               # Analytics commands
│   └── growth/                  # Growth commands
└── scripts/                     # Automation & MCP integration
    ├── update-context.sh
    ├── refresh-external-data.sh
    └── mcp-servers/
```

---

## 🚀 Quick Start Guide

### **Basic Usage**
```bash
# Ask for infrastructure help
"Sergei, help me optimize the database performance"

# Get frontend assistance  
"Prue, create a new medical record component"

# Use shortcuts
/infra:monitor          # → Delegates to Sergei
/ui:component MyCard    # → Delegates to Prue
/ai:validate           # → Delegates to Tessa
```

### **Agent Delegation**
Claude Code automatically delegates to the right specialist based on:
- **Keywords**: "database", "component", "processing", "FHIR", etc.
- **File paths**: Working in `supabase/` → Sergei, `components/` → Prue
- **Slash commands**: `/infra:*` → Sergei, `/ui:*` → Prue

---

## 🧠 How Agent Memory Works

### **Private Memory** (Agent-Specific)
Each agent maintains their own knowledge bank:
```
.claude/memory/sergei/
├── database-optimizations.md    # Sergei's DB learnings
├── deployment-patterns.md       # Deployment strategies
└── infrastructure-issues.md     # Problem solutions
```

### **Shared Memory** (Cross-Agent)
Important decisions and insights shared across agents:
```
.claude/memory/shared/
├── recent-decisions.md          # Major project decisions
├── performance-insights.md      # System-wide optimizations
└── agent-communications.md      # Inter-agent consultations
```

### **Memory Updates**
- **Automatic**: Agents update their memory after each interaction
- **Manual**: You can directly edit memory files to add context
- **Persistent**: Memory accumulates over time, making agents smarter

---

## ⚡ Slash Commands Reference

### **Infrastructure (/infra:)**
- `/infra:deploy` - Deployment operations
- `/infra:migrate` - Database migrations
- `/infra:monitor` - Performance monitoring
- `/infra:scale` - Scaling operations

### **AI Processing (/ai:)**
- `/ai:process` - Document processing
- `/ai:optimize` - Cost/performance optimization
- `/ai:validate` - AI output validation
- `/ai:pipeline` - Pipeline management

### **Frontend (/ui:)**
- `/ui:component` - Create new components
- `/ui:optimize` - Performance optimization
- `/ui:accessibility` - A11y improvements

### **Quality (/test:)**
- `/test:medical` - Medical data testing
- `/test:validate` - Data validation
- `/test:quality` - Quality checks

### **Healthcare (/health:)**
- `/health:fhir` - FHIR validation
- `/health:mapping` - Medical data mapping
- `/health:standards` - Healthcare standards

### **Analytics (/analytics:)**
- `/analytics:metrics` - Key metrics analysis
- `/analytics:dashboard` - Create dashboards
- `/analytics:funnel` - Conversion analysis

### **Growth (/growth:)**
- `/growth:experiment` - Growth experiments
- `/growth:acquisition` - User acquisition
- `/growth:retention` - Retention analysis

---

## 🔧 Customization Guide

### **Adding New Agents**
1. Create new agent file in `agents/`
2. Create private memory folder in `memory/`
3. Add relevant slash commands
4. Test delegation

### **Modifying Agent Expertise**
1. Edit the agent's `.md` file
2. Update their `context_paths`
3. Modify their `system_prompt`
4. Add domain-specific knowledge

### **External Data Integration**
1. Create MCP server in `scripts/mcp-servers/`
2. Configure MCP connection
3. Update agent to use external data
4. Test data access

---

## 🐛 Troubleshooting

### **Agent Not Responding**
- Check agent file syntax
- Verify context paths exist
- Test basic delegation

### **Memory Not Updating**
- Check hooks configuration
- Verify file permissions
- Test manual memory updates

### **External Data Issues**
- Verify MCP server configuration
- Check API credentials
- Test connection manually

---

## 📈 Success Metrics

### **Week 1 Goals**
- [x] All 7 agents operational
- [x] Basic slash commands working
- [x] Memory system functional

### **Ongoing Improvements**
- Agent response accuracy
- Memory utilization
- External data integration
- Cross-agent collaboration

---

## 🔄 System Updates

When updating this AI system:

1. **Document Changes**: Update this README and ARCHITECTURE.md
2. **Test Agents**: Verify all agents still work correctly
3. **Update Memory**: Clear outdated memory if needed
4. **Version Control**: Commit changes to preserve system evolution

---

**Need Help?** Reference the [ARCHITECTURE.md](./ARCHITECTURE.md) for visual diagrams and detailed technical specifications.