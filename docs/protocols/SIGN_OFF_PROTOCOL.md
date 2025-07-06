# Sign-Off Protocol Policy

**Purpose:** This document defines the complete sign-off protocol that should be executed when the user requests "execute sign off protocol" or similar commands.

---

## 🎯 **When to Execute This Protocol**

Execute this protocol when the user says any of:
- "Execute sign off protocol"
- "Sign off session" 
- "End work session"
- "Complete sign off"
- Similar requests to end a work session

---

## 📋 **Protocol Steps**

### Step 1: Gather Information from User
Ask the user these questions (use friendly, conversational tone):

1. **"What did you accomplish in this session?"**
   - Get a summary of tasks completed, progress made, problems solved
   - This will be used to update progress logs and task status

2. **"How many hours did you work this session?"** 
   - Get precise work time for R&D tax compliance
   - Format as decimal (e.g., 4.5 hours, 2.25 hours)

3. **"What are your priorities for the next session?"**
   - Get upcoming tasks and focus areas
   - This will be used to update task management

4. **"Any blockers or issues to note?"** (Optional)
   - Get any obstacles or problems encountered
   - Leave blank if none

### Step 2: Investigate Recent Changes
Review what has changed since the last sign-off by:

1. **Check the last entry in `docs/PROGRESS_LOG.md`** to see when the last session ended
2. **Review any file changes** made since that time (if possible)
3. **Look at `docs/management/TASKS.md`** to see current task status
4. **Note any significant developments** since last session

### Step 3: Update Documents
Update the following documents in this order:

#### A. Update Progress Log (`docs/PROGRESS_LOG.md`)
Add a new session entry at the top with this format:
```markdown
## [YYYY-MM-DD] Work Session Summary
- **Duration:** [X.X hours]
- **Accomplishments:** [User's summary]
- **Key Progress:** [Your investigation findings]
- **Blockers:** [Any issues noted] 
- **Next Session Focus:** [User's next priorities]
- **R&D Hours:** [Same as duration - for tax compliance]

---
```

#### B. Update Task Management (`docs/management/TASKS.md`)
Based on user's accomplishments:
- Mark completed tasks as ✅ Complete
- Add new tasks from "next priorities" 
- Update task status and priorities
- Move items between sections as appropriate

#### C. Update Session Summary (`docs/SESSION_SUMMARY.md`)
Create or update the current session summary:
```markdown
# Current Development Session

**Last Updated:** [Current date and time]
**Session Duration:** [X.X hours]
**Total Hours This Week:** [Calculate from recent sessions]

## This Session
[User's accomplishments]

## Next Session Priorities
[User's next priorities]

## Weekly Progress Overview
[Brief summary of recent progress from multiple sessions]
```

#### D. Conditional Updates
Based on the type of work accomplished, also update:

**If Documentation Work:**
- Update relevant documentation files mentioned
- Update `docs/README.md` if navigation changed

**If Code Development:**
- Consider updating `README.md` if new features added
- Note any architectural changes

**If Architecture/Design Work:**
- Update relevant architecture documents
- Update project overview if scope changed

**If Bug Fixes/Issues:**
- Update any relevant troubleshooting docs
- Note resolved issues

### Step 4: R&D Tax Compliance
Ensure R&D compliance by:
1. Recording hours worked in progress log
2. Categorizing work as R&D eligible (development, research, problem-solving)
3. Maintaining detailed activity records for audit purposes

### Step 5: Confirm Completion
Respond to the user with:
```
✅ Sign-off protocol completed successfully!

📊 Session Summary:
- Duration: [X.X hours] 
- Accomplishments: [Brief summary]
- Documents updated: [List of files updated]
- Next session focus: [Key priorities]

All progress has been logged and files updated. Great work this session! 🚀
```

---

## 📁 **Files That May Need Updates**

### Primary Files (Always Update)
- `docs/PROGRESS_LOG.md` - Session logging
- `docs/management/TASKS.md` - Task status  
- `docs/SESSION_SUMMARY.md` - Current session overview

### Secondary Files (Conditional)
- `docs/README.md` - If navigation or overview changed
- `README.md` (root) - If major features or status changed
- `docs/architecture/` files - If architectural work done
- `docs/guides/` files - If setup or process changes
- `docs/api/` files - If API changes made
- Any specific files mentioned in user's accomplishments

### Backup Considerations
- Always preserve existing content when updating
- Add new information rather than replacing
- Maintain chronological order in logs
- Keep formatting consistent

---

## 🛡️ **Error Handling**

If any step fails:
1. **Continue with other steps** - Don't let one failure stop the whole protocol
2. **Note the failure** in your response to the user
3. **Suggest manual action** if needed
4. **Still complete the protocol** as much as possible

If user provides incomplete information:
1. **Ask for clarification** on missing details
2. **Use reasonable defaults** if user prefers (e.g., "General development work")
3. **Proceed with available information** rather than blocking

---

## 🎯 **Success Criteria**

Protocol is successful when:
- [x] User questions answered and recorded
- [x] Progress log updated with session details
- [x] Task management reflects current status  
- [x] Session summary is current
- [x] R&D hours properly documented
- [x] User receives confirmation message

The goal is to make this **seamless and quick** - the entire interaction should take 2-3 minutes maximum.

---

## 📝 **Example Interaction**

**User:** "Execute sign off protocol"

**AI:** "I'll execute the sign-off protocol for you! Let me ask a few quick questions:

1. What did you accomplish in this session?
2. How many hours did you work?
3. What are your priorities for the next session?
4. Any blockers or issues to note?"

**User:** [Provides answers]

**AI:** "Perfect! Let me update the documentation... 

✅ Sign-off protocol completed successfully!

📊 Session Summary:
- Duration: 4.5 hours
- Accomplishments: API documentation completed, deployment guide created
- Documents updated: PROGRESS_LOG.md, TASKS.md, SESSION_SUMMARY.md
- Next session focus: Implement document processor endpoint

All progress has been logged and files updated. Great work this session! 🚀"

---

*This protocol ensures consistent project tracking, R&D compliance, and seamless session management through AI assistance.*