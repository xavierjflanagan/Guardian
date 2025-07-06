# Sign-Off Protocol Policy

**Purpose:** This document defines the sign-off protocol for ending a work session when the user requests it. It now uses only `docs/PROGRESS_LOG.md` as the single source of truth for session tracking.

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

### Step 1: Gather Session Information
Ask the user these questions in a single message (dot points, one after the other):

in this session;
- what work did you do?
- how many hours? (as decimal, e.g. 4.5)
- what are your priorities next session?
- any blockers or issues?

### Step 2: Update Progress Log
- Find the `## [YYYY-MM-DD] Work Session Started` block at the top of `docs/PROGRESS_LOG.md` and replace it with a summary block in this format:
  ```markdown
  ## [YYYY-MM-DD] Work Session Summary
  - **Duration:** [X.X hours]
  - **Accomplishments:** [User's summary]
  - **Blockers:** [Any issues noted]
  - **Next Session Focus:** [User's next priorities]
  - **R&D Hours:** [Same as duration]
  ---
  ```

### Step 2.5: Sync Technical Tasks
- Read the current `docs/management/TASKS.md` file.
- Check for any updates or changes since last session.
- Sync all technical tasks with the Notion Technical Task Board (https://www.notion.so/22887f8cee9e816b98cbc8a99950d452).
- Ensure both TASKS.md and Notion board are up to date (push/pull as needed).

### Step 3: Confirm Completion
- Respond to the user with a completion message and a sign-off quote, e.g.:
  All progress has been logged and files updated. Great work this session!
  [Insert a random sign-off quote here, e.g., "Rest is not idleness, and to lie sometimes on the grass under trees on a summer's day... is by no means a waste of time." – John Lubbock]

---

## 📁 Files That May Need Updates
- `docs/PROGRESS_LOG.md` (always)
- `docs/management/TASKS.md` (for task status)
- Other documentation files as needed (conditional)

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