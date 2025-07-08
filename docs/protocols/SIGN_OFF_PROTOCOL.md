# Sign-Off Protocol Policy

**Purpose:** Defines the sign-off protocol for ending a work session. Uses docs/PROGRESS_LOG.md as the single source of truth for session tracking.
**Last updated:** July 2025
**Audience:** All contributors, developers, project managers
**Prerequisites:** None

---

## When to Execute This Protocol

Execute this protocol when the user says any of:
- "Execute sign off protocol"
- "Sign off session"
- "End work session"
- "Complete sign off"
- Similar requests to end a work session

---

## Protocol Steps

### Step 0.5: Review Protocol Documentation
- Read `docs/protocols/README.md` to understand the full context and intended outcomes of the protocol system
- This ensures proper execution and validates that all promised benefits are delivered

### Step 1: Gather Session Information
Ask the user these questions in a single message (dot points, one after the other):

in this session;
- what work did you do?
- how many hours? (as decimal, e.g. 4.5)
- what are your priorities next session?
- any blockers or issues?

### Step 2: Update Progress Log
- **Get current date and time**: Use `date` command to get current date and time for accurate logging
- **Extract start time**: Capture the "Start Time" from the existing `## [YYYY-MM-DD] Work Session Started` block
- Replace the "Work Session Started" block at the top of `docs/PROGRESS_LOG.md` with a summary block in this format:
  ```markdown
  ## [YYYY-MM-DD] Work Session Summary
  - **Start Time:** [From the Work Session Started block]
  - **Duration:** [X.X hours]
  - **Accomplishments:** [User's summary]
  - **Blockers:** [Any issues noted]
  - **Next Session Focus:** [User's next priorities]
  - **R&D Hours:** [Same as duration]
  ---
  ```

### Step 2.5: Update AI Context Log

**Comprehensive AI Context Review & Update** in `docs/context/AI_context.md`:

**First, Review Entire File:**
- Read through all existing sections to understand current project state
- Identify outdated information, completed tasks, or changed priorities
- Note gaps between documented context and actual progress

**Then, Update Contextually:**
- **Project Goal**: Update if scope, priorities, or objectives evolved during session
- **Tech Stack & Architecture**: Modify if new technologies added, removed, or architectural decisions changed
- **Session Updates**: 
  - Update existing session summaries if they contain outdated "Next Steps" or "Blockers"
  - Add new session update that builds on previous context rather than repeating information
  - Reference and connect to previous sessions' outcomes
- **Cross-Reference**: Ensure consistency with related documentation files that were modified

**Session Update Content:**
- **Progress**: What was accomplished, referencing previous session goals
- **Decisions**: Key architectural, technical, or process decisions made
- **Context Evolution**: How the project understanding or direction changed
- **Next Steps**: Updated priorities based on current state
- **Blockers**: Current obstacles, noting which previous blockers were resolved

**Error Handling**: If unable to update, note the failure and suggest manual update.

### Step 2.75: Sync Technical Tasks
- Read the current `docs/management/TASKS.md` file.
- Check for any updates or changes since last session.
- Sync all technical tasks with the Notion Technical Task Board (https://www.notion.so/22887f8cee9e816b98cbc8a99950d452).
- Ensure both TASKS.md and Notion board are up to date (push/pull as needed).

### Step 3: Confirm Completion
- Respond to the user with a completion message that includes:
  - **Files Modified**: List all files that were actually updated during the sign-off process
  - **Session Summary**: Brief recap of what was logged
  - **Sign-off Quote**: A random inspirational quote
  
Example format:
```
Session sign-off complete! 

**Files Updated:**
- docs/PROGRESS_LOG.md
- docs/context/AI_context.md
- docs/management/TASKS.md

**Session Summary:**
- Duration: [X.X hours]
- Focus: [Brief summary of work]
- Next session: [Key priorities]

Great work this session!
[Insert a random sign-off quote here, e.g., "Rest is not idleness, and to lie sometimes on the grass under trees on a summer's day... is by no means a waste of time." – John Lubbock]
```

---

## 📁 Files That May Need Updates
- `docs/PROGRESS_LOG.md` (always updated)
- `docs/context/AI_context.md` (always updated)
- `docs/management/TASKS.md` (for task status sync)
- Other documentation files as needed (conditional based on session work)

---

## 🛡️ Error Handling
- If any step fails, continue with other steps and note the failure in your response. Suggest manual action if needed.
- If user provides incomplete information, ask for clarification or use reasonable defaults (e.g., "General development work"). Proceed with available information rather than blocking.

---

## Success Criteria
- User questions answered and recorded
- Progress log updated with session details
- Task management reflects current status
- User receives confirmation message

The goal is to make this seamless and quick—the entire interaction should take 2-3 minutes maximum.

---

## Example Interaction

**User:** "Execute sign off protocol"

**AI:** "I'll execute the sign-off protocol for you! Let me ask a few quick questions:

in this session;
- what work did you do?
- how many hours? (as decimal, e.g. 4.5)
- what are your priorities next session?
- any blockers or issues?

**User:** [Provides answers]

**AI:** "Perfect! Let me update the documentation...

Session Summary:
- Duration: 4.5 hours
- Accomplishments: API documentation completed, deployment guide created
- Documents updated: PROGRESS_LOG.md, TASKS.md
- Next session focus: Implement document processor endpoint

All progress has been logged and files updated. Great work this session!
[Insert a random sign-off quote here, e.g., "Rest is not idleness, and to lie sometimes on the grass under trees on a summer's day... is by no means a waste of time." – John Lubbock]"

---

*This protocol ensures consistent project tracking, R&D compliance, and seamless session management through AI assistance.*