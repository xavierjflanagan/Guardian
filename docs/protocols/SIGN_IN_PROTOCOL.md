# Sign-In Protocol Policy

**Purpose:** This document defines the complete sign-in protocol that should be executed when the user requests "execute sign in protocol" or wants to start a work session.

---

## 🎯 **When to Execute This Protocol**

Execute this protocol when the user says any of:
- "Execute sign in protocol"
- "Start work session"
- "Begin session"
- "Sign in for work"
- Similar requests to start a work session

---

## 📋 **Protocol Steps**

### Step 1: Validate Previous Session
Check if the previous session was properly signed off:

1. **Review last entry in `docs/PROGRESS_LOG.md`**
2. **Check if last session has completion details**
3. **If no proper sign-off found:**
   - Ask: *"I notice your last session wasn't properly signed off. Do you remember what you accomplished and how long you worked? I can help you complete that sign-off first."*
   
   **If user provides information:**
   - Execute the sign-off protocol retrospectively
   - Follow all sign-off steps using the user's provided information
   - Then proceed with current sign-in
   
   **If user doesn't remember or doesn't respond:**
   - Add default entry to progress log:
   ```markdown
   ## [ESTIMATED_DATE] Previous Session (Incomplete Sign-off)
   - **Duration:** Unknown
   - **Accomplishments:** Session occurred but details not recorded
   - **Status:** ⚠️ Incomplete documentation - sign-off missed
   - **R&D Hours:** 0 (cannot verify for compliance)
   
   ---
   ```
   - Then proceed with current sign-in

### Step 2: Gather Session Information
Ask the user these questions:

1. **"What are your main goals for this session?"**
   - Get 2-3 key objectives or tasks to focus on
   - This helps prioritize work and measure progress

2. **"How long do you plan to work today?"** (Optional)
   - Get estimated session duration
   - Helps with time management and planning

3. **"Any specific areas you want to focus on?"** (Optional)
   - Frontend, backend, documentation, architecture, etc.
   - Helps contextualize the work

### Step 3: Review Current Status
Investigate and report on current project status:

1. **Check `docs/management/TASKS.md`** for current priorities
2. **Review recent progress** from `docs/PROGRESS_LOG.md`
3. **Note any urgent items** or blockers from previous sessions
4. **Summarize current project status** for the user

### Step 4: Update Documents

#### A. Update Progress Log (`docs/PROGRESS_LOG.md`)
Add a new session start entry:
```markdown
## [YYYY-MM-DD] Work Session Started
- **Start Time:** [Current time]
- **Planned Duration:** [User's estimate if provided]
- **Session Goals:** [User's main objectives]
- **Focus Areas:** [User's specified focus]

---
```

**⚠️ DATE/TIME ACCURACY:** 
- **Always ask user for current date/time** if uncertain
- **Use format: YYYY-MM-DD** for dates
- **If no access to system time, use placeholder [CURRENT_DATE]** and note for user to update

#### B. Update Session Summary (`docs/SESSION_SUMMARY.md`)
Update the current session information:
```markdown
# Current Development Session

**Last Updated:** [Current date and time]
**Session Status:** 🟢 Active (planned: [X hours if provided])
**Total Hours This Week:** [Calculate from recent sessions]

## Current Session Goals
[User's main goals for this session]

## Project Status
[Brief current project state from task management review]
```

### Step 5: Provide Session Briefing
Give the user a helpful session overview:

```
🚀 Work session started successfully!

📋 Session Overview:
- Goals: [User's objectives]
- Current priorities: [Top 3 from task list]
- Recent progress: [Brief context from recent work]
- Estimated duration: [If provided]

📍 Current Project Status:
[Brief summary of where things stand]

You're all set! Let me know if you need any assistance during your session. 💪
```

---

## 📁 **Files That May Need Updates**

### Primary Files (Always Update)
- `docs/PROGRESS_LOG.md` - Session start logging
- `docs/SESSION_SUMMARY.md` - Current session status

### Review Files (For Context)
- `docs/management/TASKS.md` - Current task priorities
- Recent entries in progress log for context

---

## 🛡️ **Error Handling**

If previous session wasn't signed off:
1. **Offer to complete it** before starting new session
2. **Allow user to skip** if they prefer
3. **Note the gap** in documentation

If files are missing:
1. **Create them** with appropriate templates
2. **Note file creation** in response
3. **Continue with protocol**

---

## 🎯 **Success Criteria**

Protocol is successful when:
- [x] Previous session status checked
- [x] User goals and plans captured
- [x] Current project status reviewed
- [x] Session start documented
- [x] User receives helpful briefing

The goal is to **quickly orient** the user and **set up the session** for productivity.

---

## 📝 **Example Interaction**

**User:** "Execute sign in protocol"

**AI:** "I'll start your work session! Let me ask a couple quick questions:

1. What are your main goals for this session?
2. How long do you plan to work today?
3. Any specific areas you want to focus on?"

**User:** [Provides answers]

**AI:** "Perfect! Let me check your current status and get you set up...

🚀 Work session started successfully!

📋 Session Overview:
- Goals: Complete API documentation, start deployment guide
- Current priorities: Document processor endpoint, API docs, troubleshooting guide  
- Recent progress: Major documentation overhaul completed yesterday
- Estimated duration: 4 hours

📍 Current Project Status:
You're in Phase 1 of MVP development. Authentication and file upload are complete, now focusing on documentation and AI pipeline development.

You're all set! Let me know if you need any assistance during your session. 💪"

---

*This protocol ensures you start each session with clear context and objectives, making your work time more focused and productive.*