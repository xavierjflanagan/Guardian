# Protocol System Design - Guardian Project

**Purpose:** Automated sign-in/sign-off system for project management and R&D tax compliance
**Created:** December 2024

---

## 🎯 **System Requirements**

### Functional Requirements
- [x] Manual protocol execution via AI command
- [x] Automated 12-hour scheduling (12:00 PM & 12:00 AM AEST)
- [x] Progress report file updates
- [x] Notion integration via MCP
- [x] Time tracking for R&D compliance
- [x] Validation of previous protocol completion
- [x] Sign-in/sign-off workflow management

### Technical Requirements
- Node.js execution environment
- GitHub Actions for scheduling
- Notion MCP integration
- File system access for updates
- JSON configuration management

---

## 📋 **Protocol Definitions**

### Sign-In Protocol
```json
{
  "name": "daily-sign-in",
  "description": "Daily work session start protocol",
  "triggers": ["manual", "scheduled:12:00-AEST"],
  "actions": [
    {
      "type": "validate",
      "check": "previous-signoff-completed",
      "required": true
    },
    {
      "type": "time-track",
      "action": "start-session",
      "timestamp": "auto"
    },
    {
      "type": "file-update",
      "target": "docs/PROGRESS_LOG.md",
      "action": "append-session-start"
    },
    {
      "type": "notion-sync",
      "target": "daily-standup",
      "action": "create-entry"
    },
    {
      "type": "status-check",
      "targets": ["github", "vercel", "supabase"]
    }
  ]
}
```

### Sign-Off Protocol
```json
{
  "name": "daily-sign-off",
  "description": "Daily work session end protocol",
  "triggers": ["manual", "scheduled:00:00-AEST"],
  "actions": [
    {
      "type": "time-track",
      "action": "end-session",
      "timestamp": "auto"
    },
    {
      "type": "prompt-user",
      "questions": [
        "What was accomplished today?",
        "Any blockers or issues?",
        "Priority tasks for tomorrow?"
      ]
    },
    {
      "type": "file-update",
      "target": "docs/PROGRESS_LOG.md",
      "action": "append-session-summary"
    },
    {
      "type": "file-update",
      "target": "docs/management/TASKS.md",
      "action": "update-task-status"
    },
    {
      "type": "notion-sync",
      "target": "progress-tracker",
      "action": "update-daily-entry"
    },
    {
      "type": "generate-reports",
      "targets": ["time-summary", "progress-summary"]
    }
  ]
}
```

---

## ⏰ **Scheduling System**

### GitHub Actions Workflow
```yaml
# .github/workflows/daily-protocols.yml
name: Daily Protocol Execution

on:
  schedule:
    # 12:00 PM AEST (02:00 UTC)
    - cron: '0 2 * * *'
    # 12:00 AM AEST (14:00 UTC previous day)
    - cron: '0 14 * * *'
  workflow_dispatch: # Manual trigger

jobs:
  execute-protocol:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm install
      - name: Execute Protocol
        run: |
          if [ $(date +%H) -eq 2 ]; then
            node protocols/execute-protocol.js sign-in
          else
            node protocols/execute-protocol.js sign-off
          fi
        env:
          NOTION_API_KEY: ${{ secrets.NOTION_API_KEY }}
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

---

## 🕒 **Time Tracking System**

### Time Tracker Schema
```json
{
  "sessions": [
    {
      "id": "uuid",
      "date": "2024-12-20",
      "start_time": "2024-12-20T12:00:00+11:00",
      "end_time": "2024-12-20T18:30:00+11:00",
      "duration_hours": 6.5,
      "session_type": "development",
      "tasks_completed": ["api-docs", "deployment-guide"],
      "notes": "Completed documentation overhaul",
      "rd_eligible": true
    }
  ],
  "monthly_summary": {
    "2024-12": {
      "total_hours": 45.5,
      "rd_eligible_hours": 42.0,
      "sessions_count": 8,
      "avg_session_length": 5.7
    }
  }
}
```

---

## 🔄 **Execution Flow**

### Manual Execution
```bash
# User tells AI: "Execute sign-in protocol"
# AI responds with:
node protocols/execute-protocol.js sign-in

# User tells AI: "Execute sign-off protocol" 
# AI responds with:
node protocols/execute-protocol.js sign-off
```

### Automated Execution
1. **12:00 PM AEST** - Sign-in protocol
   - Check previous sign-off completed
   - Start time tracking
   - Update progress log
   - Sync with Notion
   - System status check

2. **12:00 AM AEST** - Sign-off protocol
   - End time tracking
   - Prompt for daily summary
   - Update all progress files
   - Generate reports
   - Sync with Notion

---

## 📊 **Integration Points**

### File Updates
- `docs/PROGRESS_LOG.md` - Session summaries
- `docs/management/TASKS.md` - Task status updates
- `protocols/time-tracker.json` - Time tracking data
- `docs/SESSION_SUMMARY.md` - Daily work summaries

### Notion Integration (via MCP)
- **Daily Standup Table** - Session start/end
- **Progress Tracker** - Daily accomplishments
- **Time Tracking Database** - R&D compliance data
- **Task Management** - Priority updates

### External Services
- **GitHub** - Commit activity analysis
- **Vercel** - Deployment status
- **Supabase** - Service health check

---

## 🛡️ **Validation & Error Handling**

### Pre-execution Checks
```javascript
const validations = {
  signIn: [
    'check-previous-signoff-completed',
    'verify-notion-connection',
    'validate-file-permissions'
  ],
  signOff: [
    'check-active-session-exists',
    'verify-minimum-session-time',
    'validate-progress-updates'
  ]
};
```

### Error Recovery
- **Failed Notion sync** → Retry with exponential backoff
- **File update errors** → Create backup and retry
- **Missing session data** → Prompt for manual input
- **Validation failures** → Log error and notify user

---

## 📈 **Reporting & Analytics**

### R&D Tax Compliance Reports
```javascript
// Monthly R&D summary
{
  "month": "2024-12",
  "total_rd_hours": 120.5,
  "eligible_activities": [
    "AI pipeline development",
    "Healthcare data processing research", 
    "Security compliance implementation"
  ],
  "documentation_links": [
    "docs/PROGRESS_LOG.md",
    "notion://progress-tracker"
  ]
}
```

---

## 🔧 **Implementation Steps**

### Week 1: Core System
1. Create protocol definition files
2. Build execution engine
3. Implement time tracking
4. Set up file update automation

### Week 2: Integration
1. Notion MCP integration
2. GitHub Actions workflow
3. Validation system
4. Error handling

### Week 3: Enhancement
1. Reporting system
2. Analytics dashboard
3. User experience refinement
4. Documentation completion

---

## 🎯 **Success Metrics**

- **Automation Rate:** >95% successful automated executions
- **Data Accuracy:** 100% time tracking accuracy
- **Compliance:** Complete R&D documentation trail
- **User Experience:** Single command protocol execution
- **Reliability:** <1% failure rate for critical updates

---

*This system will provide comprehensive project management automation while ensuring R&D tax compliance and maintaining detailed progress tracking.*