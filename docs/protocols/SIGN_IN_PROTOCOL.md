# Sign-In Protocol Policy

**Purpose:** Defines the sign-in protocol for starting a new work session. Uses docs/PROGRESS_LOG.md as the single source of truth for session tracking.
**Last updated:** July 2025
**Audience:** All contributors, developers, project managers
**Prerequisites:** None

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

### Step 0.5: Review Protocol Documentation
- Read `docs/protocols/README.md` to understand the full context and intended outcomes of the protocol system
- This ensures proper execution and validates that all promised benefits are delivered

### Step 1: Check Previous Session
- Review the last entry in `docs/PROGRESS_LOG.md` to ensure the previous session was properly signed off.
- If the last session is missing completion details:
  - Ask: *"I notice your last session wasn't properly signed off. Do you remember what you accomplished and how long you worked? I can help you complete that sign-off first."*
  - If the user provides information:
    - Execute the sign-off protocol retrospectively using the provided details, then proceed with sign-in.
  - If the user doesn't remember or doesn't respond:
    - Add a default entry to the progress log:
      ```markdown
      ## [ESTIMATED_DATE] Previous Session (Incomplete Sign-off)
      - **Duration:** Unknown
      - **Accomplishments:** Session occurred but details not recorded
      - **Status:** Incomplete documentation - sign-off missed
      - **R&D Hours:** 0 (cannot verify for compliance)
      ---
      ```
    - Then proceed with current sign-in.

### Step 2: Gather Session Information
Ask the user these questions in a single message (dot points, one after the other):

For this session;
- What are your main goals? (2-3 key objectives or tasks)
- How long do you plan to work?
- Any specific areas you want to focus on? (Optional: e.g., frontend, backend, documentation, architecture)

### Step 2.25: Review AI Context
**Comprehensive AI Context Review** in `docs/context/AI_context.md`:

- Read through the entire AI context file to understand current project state
- Note the latest session updates, decisions, and next steps
- Identify any blockers or priorities from previous sessions
- Understand recent architectural or technical decisions
- Gather context about project evolution and current focus areas

This review will inform both the task sync and session briefing steps.

### Step 2.5: Sync Technical Tasks
- Read the current `docs/management/TASKS.md` file.
- Check for any updates or changes since last session.
- Sync all technical tasks with the Notion Technical Task Board (https://www.notion.so/22887f8cee9e816b98cbc8a99950d452).
- Ensure both TASKS.md and Notion board are up to date (push/pull as needed).
- **Use AI context insights** to better understand task priorities and status.

### Step 3: Update Progress Log
- **Get current date and time**: Use `date` command to get current date and time
- Add a new entry at the top of `docs/PROGRESS_LOG.md` in this format:
  ```markdown
  ## [YYYY-MM-DD] Work Session Started
  - **Start Time:** [HH:MM TIMEZONE from date command]
  - **Session Goals:** [User's main objectives]
  ---
  ```
  *Note: Both date and time come from the `date` command output*

### Step 4: Provide Contextual Briefing
Generate a comprehensive session briefing by combining insights from:

- **AI Context Review**: Current project state, recent decisions, priorities, and blockers
- **Progress Log**: Recent session summaries and accomplishments
- **Task Status**: Current task priorities and any updates from Notion sync
- **User Goals**: How the user's session goals align with project priorities

**Briefing should include:**
- Current project phase and focus areas
- Recent progress and key decisions
- How user's goals fit into overall project direction
- Any relevant blockers or considerations
- Contextual encouragement based on recent momentum

---

## 📁 **Files That May Need Updates**

### Primary Files (Always Update)
- `docs/PROGRESS_LOG.md` - Session start logging

### Review Files (For Context)
- `docs/context/AI_context.md` - Canonical project context and recent decisions
- `docs/management/TASKS.md` - Current task priorities and status
- Recent entries in progress log for session continuity

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
- [x] Session start documented
- [x] User receives helpful briefing

The goal is to **quickly orient** the user and **set up the session** for productivity.

---

## 📝 **Example Interaction**

**User:** "Execute sign in protocol"

**AI:** "I'll start your work session! Let me ask a couple quick questions:

For this session;
- What are your main goals?
- How long do you plan to work?
- Any specific areas you want to focus on?

**User:** [Provides answers]

**AI:** "Perfect! Let me review your project context and get you set up...

🚀 Work session started successfully!

📋 Session Overview:
- **Your Goals:** Complete API documentation, start deployment guide
- **Session Duration:** 4 hours
- **Focus Areas:** Documentation and pipeline development

📍 Current Project Context:
- **Project Phase:** Phase 1 MVP development
- **Recent Progress:** Major documentation overhaul completed, authentication and file upload implemented
- **Current Priorities:** Document processor endpoint, API documentation, troubleshooting guide
- **Architecture Status:** Supabase stack finalized, modular pipeline design documented
- **Next Steps:** AI pipeline implementation and benchmarking

🎯 Session Alignment:
Your goals align perfectly with current project priorities. The API documentation work will support the upcoming pipeline implementation phase.

You're all set! [Insert a random inspirational quote here, e.g., "The future depends on what you do today." – Mahatma Gandhi]